const { ethers } = require("hardhat")
const { Multicall } = require('ethereum-multicall')
const { action } = require('./utils')
const abi = new ethers.utils.AbiCoder()

let provider

function setProvider(prod) {
  provider = prod
}

async function getSacredTreesEvents(sacredTrees, type, fromBlock, toBlock) {
  const eventName = type === action.DEPOSIT ? 'DepositData' : 'WithdrawalData'
  if(!provider) {
    console.log("Please set provider!")
  }
  const events = await provider.getLogs({
    address: sacredTrees.address,
    topics: sacredTrees.filters[eventName]().topics,
    fromBlock,
    toBlock,
  })
  return events
    .map((e) => {
      const { instance, hash, block, index } = sacredTrees.interface.parseLog(e).args
      const encodedData = abi.encode(['address', 'bytes32', 'uint256'], [instance, hash, block])
      return {
        instance,
        hash,
        block: block.toNumber(),
        index: index.toNumber(),
        sha3: ethers.utils.keccak256(encodedData),
      }
    })
    .sort((a, b) => a.index - b.index)
}

async function getPendingEventHashes(sacredTrees, type, from, to) {
  try {
    const target = sacredTrees.address
    const method = type === action.DEPOSIT ? 'deposits' : 'withdrawals'

    const multicall = new Multicall({ ethersProvider: provider, tryAggregate: true });
    const contractCallContext = [];
    const depositsAbi = {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "deposits",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
    const withdrawsAbi = {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "withdrawals",
      "outputs": [
        {
          "internalType": "bytes32",
          "name": "",
          "type": "bytes32"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    }
    for (let i = from; i < to; i++) {
      contractCallContext.push(
        {
          reference: `SacredTreeContract${i}`,
          contractAddress: target,
          abi: type === action.DEPOSIT ?  [depositsAbi] : [withdrawsAbi],
          calls: [{ reference: `${method}_${i}`, methodName: method, methodParameters: [i] }]
        }
        )
     }

    const results = await multicall.call(contractCallContext);
    let hashes = []
    for (let i = from; i < to ; i++) {
      const hash = results.results[`SacredTreeContract${i}`].callsReturnContext[0].returnValues[0]
      hashes.push(hash)
    }
    return hashes
  } catch (e) {
    console.error('getPendingEventHashes', e)
  }
}

async function getEvents(sacredTrees, type) {
  const committedMethod = type === action.DEPOSIT ? 'lastProcessedDepositLeaf' : 'lastProcessedWithdrawalLeaf'
  const committedCount = (await sacredTrees[committedMethod]()).toNumber()
  const pendingLengthMethod = type === action.DEPOSIT ? 'depositsLength' : 'withdrawalsLength'
  const pendingLength = (await sacredTrees[pendingLengthMethod]()).toNumber()
  const pendingEventHashes = await getPendingEventHashes(sacredTrees, type, committedCount, pendingLength)
  const events = await getSacredTreesEvents(sacredTrees, type, 6496688, 'latest')
  const committedEvents = events.slice(0, committedCount)
  const pendingEvents = pendingEventHashes.map((e) => events.find((a) => a.sha3 === e))

  if (pendingEvents.some((e) => e === undefined)) {
    pendingEvents.forEach((e, i) => {
      if (e === undefined) {
        console.log('Unknown event', pendingEventHashes[i])
      }
    })
    throw new Error('Tree contract expects unknown sacred event')
  }

  return {
    committedEvents,
    pendingEvents,
  }
}

module.exports = {
  getEvents,
  getSacredTreesEvents,
  setProvider
}
