const { ethers } = require("hardhat");
const { action } = require('./utils')
const abi = new ethers.utils.AbiCoder()

let provider

function setProvider(prod) {
  provider = prod
}

async function getSacredTreesEvents(sacredTree, type, fromBlock, toBlock) {
  const eventName = type === action.DEPOSIT ? 'DepositData' : 'WithdrawalData'
  if(!provider) {
    console.log("Please set provider!")
  }
  const events = await provider.getLogs({
    address: sacredTree.address,
    topics: sacredTree.filters[eventName]().topics,
    fromBlock,
    toBlock,
  })
  return events
    .map((e) => {
      const { instance, hash, block, index } = sacredTree.interface.parseLog(e).args
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

async function getPendingEventHashes(sacredTree, type, from, to) {
  try {
    let calls = []
    const target = sacredTree.address
    const method = type === action.DEPOSIT ? 'deposits' : 'withdrawals'

    const multiCallAddrs = {
      1: "0xeefBa1e63905eF1D7ACbA5a8513c70307C1cE441",
      42:"0x2cc8688C5f75E365aaEEb4ea8D6a480405A48D2A",
      80001:"0x08411ADd0b5AA8ee47563b146743C13b3556c9Cc",
      137: "0x11ce4B23bD875D7F5C6a31084f55fDe1e9A87507"
    }
    // const config = {
    //   rpcUrl: getRPCUrl(),
    //   multicallAddress: multiCallAddrs[process.env.NET_ID],
    // }

    // for (let i = from; i < to; i++) {
    //   calls.push({
    //     target,
    //     call: [`${method}(uint256)(bytes32)`, i],
    //     returns: [[i]],
    //   })
    // }
    // const result = await aggregate(calls, config)
    // return Object.values(result.results.original)

    let result = []
    for (let i = from; i < to ; i++) {
      const hash = await sacredTrees[`${method}(uint256)`](i);
      result.push(hash)
    }
    return result
  } catch (e) {
    console.error('getPendingEventHashes', e)
  }
}

async function getEvents(sacredTree, type) {
  const committedMethod = type === action.DEPOSIT ? 'lastProcessedDepositLeaf' : 'lastProcessedWithdrawalLeaf'
  const committedCount = (await sacredTree[committedMethod]()).toNumber()

  const pendingLengthMethod = type === action.DEPOSIT ? 'depositsLength' : 'withdrawalsLength'
  const pendingLength = (await sacredTree[pendingLengthMethod]()).toNumber()

  const pendingEventHashes = await getPendingEventHashes(type, committedCount, pendingLength)
  const events = await getSacredTreesEvents(sacredTree, type, 0, 'latest')

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
