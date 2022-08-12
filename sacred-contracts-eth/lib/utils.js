const axios = require('axios')
const { ethers } = require("hardhat")
const assert = require('assert')
const MerkleTree = require('fixed-merkle-tree')
const { groth16 } = require('snarkjs')
const { toWei} = require('web3-utils')
const baseUtils = require("./baseUtils")

const { PRIVATE_KEY, HARDHAT_CHAINID } = process.env
let web3, wasmFile, zkeyFileName
let sacredProxy, contracts = {}
let MERKLE_TREE_HEIGHT
let zeroMerkleRoot
let netId, netName, config, wallet
let erc20Abi
let provider

async function init({ instancesInfo, erc20Contract, rpc }) {
  await baseUtils.init(rpc)
  provider = await baseUtils.getProvider()
  const { chainId, name } = await provider.getNetwork()
  netId = "" + chainId
  netName = name
  const testing = typeof hre !== 'undefined' ? ["hardhat", "localhost"].includes(hre.network.name) : false

  if (testing) {
    const accounts = await ethers.getSigners();
    wallet = accounts[0];
    netId = "" + HARDHAT_CHAINID
    if (!netId) {
      console.log("Please specifiy original chainId of forked network in .env")
    }
  } else {
    wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  }

  config = instancesInfo
  erc20Abi = erc20Contract

  const tree = new MerkleTree(20, [], { hashFunction: baseUtils.poseidonHash2 })
  zeroMerkleRoot = '0x' + tree.root().toString(16).padStart(32 * 2, '0')
}

async function setup({ ethSacredAbi, erc20SacredAbi, sacredProxyContract, wasmPath, zkeyFilePath }) {
  wasmFile = wasmPath
  zkeyFileName = zkeyFilePath
  MERKLE_TREE_HEIGHT = process.env.MERKLE_TREE_HEIGHT || 20
  sacredProxy = sacredProxyContract

  const netkeys = Object.keys(config.pools)
  netkeys.forEach(netKey => {
    if (netKey !== "" + netId) {
      return
    }
    const infos = config.pools[netKey]
    const currencies = Object.keys(infos)
    currencies.forEach(currency => {
      const addressInfo = infos[currency].instanceAddress
      const amounts = Object.keys(addressInfo)
      amounts.forEach(amount => {
        const key = currency + amount
        const address = addressInfo[amount]
        if (address) {
          contracts[key] = new ethers.Contract(address, currency === "eth" ? ethSacredAbi : erc20SacredAbi, wallet)
        }
      })
    })
  })
}

function getProvider() {
  return provider
}

function getNetId() {
  return netId
}

function getCurrentNetworkName() {
  return netName
}

function getWalllet() {
  return wallet
}

function getZeroMerkleRoot() {
  return zeroMerkleRoot
}

/** Display ETH account balance */
async function printETHBalance({ address, name }) {
  console.log(`${name} ETH balance is`, ethers.utils.formatEther(await provider.getBalance(address)))
}

/** Display ERC20 account balance */
async function printERC20Balance({ address, name, tokenAddress }) {
  const erc20 = new ethers.Contract(tokenAddress, erc20Abi, wallet)
  const balance = await erc20.balanceOf(address)
  const decimals = await erc20.decimals()
  console.log(`${name} Token Balance is`, ethers.utils.formatUnits(balance, decimals))
}

async function generateGroth16Proof(input, wasmFile, zkeyFileName) {
  const { proof: _proof, publicSignals: _publicSignals } = await groth16.fullProve(input, wasmFile, zkeyFileName);
  const editedPublicSignals = baseUtils.unstringifyBigInts(_publicSignals);
  const editedProof = baseUtils.unstringifyBigInts(_proof);
  const calldata = await groth16.exportSolidityCallData(editedProof, editedPublicSignals);
  const argv = calldata.replace(/["[\]\s]/g, "").split(',').map(x => BigInt(x).toString());
  const a = [argv[0], argv[1]];
  const b = [[argv[2], argv[3]], [argv[4], argv[5]]];
  const c = [argv[6], argv[7]];
  return {a, b, c}
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the sacred, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param deposit Deposit object
 */
async function generateMerkleProof(sacredInstance, deposit) {
  // Get all deposit events from smart contract and assemble merkle tree from them
  console.log('Getting current state from sacred contract')
  const events = await baseUtils.getEvents(sacredInstance, { eventName: "Deposit", fromBlock: 0, toBlock: 'latest' })
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map(e => e.returnValues.commitment)
  const tree = new MerkleTree(MERKLE_TREE_HEIGHT, leaves, { hashFunction: baseUtils.poseidonHash2 })

  // Find current commitment in the tree
  const depositEvent = events.find(e => e.returnValues.commitment === baseUtils.toHex(deposit.commitment))
  const leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1
  // Compute merkle proof of our commitment
  const root = await tree.root()
  const isValidRoot = await sacredInstance.isKnownRoot(baseUtils.toHex(root))
  const isSpent = await sacredInstance.isSpent(baseUtils.toHex(deposit.nullifierHash))
  assert(isValidRoot === true, 'Merkle tree is corrupted')
  assert(isSpent === false, 'The note is already spent')
  assert(leafIndex >= 0, 'The deposit is not found in the tree')

  const path = tree.path(leafIndex)
  return {
    root: root,
    path_elements: path.pathElements,
    path_index: baseUtils.bitsToNumber(path.pathIndices)
  }
}

/**
 * Generate SNARK proof for withdrawal
 * @param deposit Deposit object
 * @param recipient Funds recipient
 * @param relayer Relayer address
 * @param fee Relayer fee
 * @param refund Receive ether for exchanged tokens
 */
async function generateProof({ sacredInstance, deposit, recipient, relayerAddress = 0, fee = 0, refund = 0 }) {
  // Compute merkle proof of our commitment
  const { root, path_elements, path_index } = await generateMerkleProof(sacredInstance, deposit)
  const pathElements = path_elements.map(item => baseUtils.toHex(item))
  // Prepare circuit input
  const input = {
    // Public snark inputs
    root: baseUtils.toHex(root),
    nullifierHash: baseUtils.toHex(deposit.nullifierHash),
    recipient: baseUtils.toHex(recipient),
    relayer: baseUtils.toHex(relayerAddress),
    fee: baseUtils.toHex(fee),
    refund: baseUtils.toHex(refund),

    // Private snark inputs
    nullifier: baseUtils.toHex(deposit.nullifier),
    secret: baseUtils.toHex(deposit.secret),
    pathElements: pathElements,
    pathIndices: path_index,
  }

  console.log('Generating SNARK proof')
  const {a, b, c} = await generateGroth16Proof(input, wasmFile, zkeyFileName);
  const args = [
    input.root,
    input.nullifierHash,
    baseUtils.toHex(input.recipient, 20),
    baseUtils.toHex(input.relayer, 20),
    input.fee,
    input.refund
  ]
  console.time('Proof time')
  return { a, b, c, args }
}

/**
 * Make a deposit
 * @param currency Сurrency
 * @param amount Deposit amount
 */
async function deposit({ currency, amount }) {
  const deposit = baseUtils.createDeposit({ nullifier: baseUtils.randomBN(31), secret: baseUtils.randomBN(31) })
  const note = baseUtils.toHex(deposit.preimage, 62)
  const noteString = `sacred-${currency}-${amount}-${netId}-${note}`
  console.log(`Your note: ${noteString}`)
  let blockNumber = 0
  const sacredInstance = contracts[currency + amount]
  if (!sacredInstance) {
    console.log("SacredInstance was not setup properly!")
    return
  }
  const senderAccount = wallet.address
  if (currency === 'eth') {
    const value = ethers.utils.parseEther(amount.toString())
    await printETHBalance({ address: sacredInstance.address, name: 'Sacred' })
    await printETHBalance({ address: senderAccount, name: 'Sender account' })
    console.log('Submitting deposit transaction')
    console.log(value.toString())
    let overrides = { value, from: senderAccount, gasLimit: 20000000 }
    if (sacredProxy) {
      const instance = getSacredInstanceAddress(netId, currency, amount)
      const tx = await (await sacredProxy.deposit(instance, baseUtils.toHex(deposit.commitment), note, overrides)).wait()
      blockNumber = tx.blockNumber
    } else {
      const tx = await (await sacredInstance.deposit(baseUtils.toHex(deposit.commitment), overrides)).wait()
      blockNumber = tx.blockNumber
    }

    await printETHBalance({ address: sacredInstance.address, name: 'Sacred' })
    await printETHBalance({ address: senderAccount, name: 'Sender account' })
  } else { // a token
    const tokenAddress = config.pools[`${netId}`][currency].token
    const erc20 = new ethers.Contract(tokenAddress, erc20Abi, wallet)
    await printERC20Balance({ address: sacredInstance.address, name: 'Sacred', tokenAddress })
    await printERC20Balance({ address: senderAccount, name: 'Sender account', tokenAddress })
    const decimals = config.pools[`${netId}`][currency].decimals
    const tokenAmount = ethers.utils.parseUnits( amount, decimals )
    const allowance = await erc20.allowance(senderAccount, sacredInstance.address, { from: senderAccount })
    console.log('Current allowance is', ethers.utils.formatUnits(allowance, decimals))
    if (BigInt(allowance) < BigInt(tokenAmount)) {
      console.log('Approving tokens for deposit')
      await erc20.approve(sacredInstance.address, tokenAmount, { from: senderAccount })
    }

    console.log('Submitting deposit transaction')
    await sacredInstance.deposit(baseUtils.toHex(deposit.commitment), { from: senderAccount, gasLimit: 2e6 })
    await printERC20Balance({ address: sacredInstance.address, name: 'Sacred', tokenAddress })
    await printERC20Balance({ address: senderAccount, name: 'Sender account', tokenAddress })
  }

  return {
    noteString,
    blockNumber
  }
}

/**
 * Do an ETH withdrawal
 * @param noteString Note to withdraw
 * @param recipient Recipient address
 */
async function withdraw({ deposit, currency, amount, recipient, relayerURL, refund = '0' }) {
  if (currency === 'eth' && refund !== '0') {
    throw new Error('The ETH purchase is supposted to be 0 for ETH withdrawals')
  }
  refund = toWei(refund)
  const sacredInstance = contracts[currency + amount]
  if (!sacredInstance) {
    console.log("SacredInstance was not setup properly!")
    return
  }
  console.log("InstanceAddress: ", sacredInstance.address)
  let blockNumber
  if (relayerURL) {
    if (relayerURL.endsWith('.eth')) {
      throw new Error('ENS name resolving is not supported. Please provide DNS name of the relayer. See instuctions in README.md')
    }
    const relayerStatus = await axios.get(relayerURL + '/status')
    const { relayerAddress, netId, gasPrices, ethPrices, relayerServiceFee } = relayerStatus.data
    assert(netId === await web3.eth.net.getId() || netId === '*', 'This relay is for different network')
    console.log('Relay address: ', relayerAddress)

    const decimals = isLocalRPC ? 18 : config.pools[`${netId}`][currency].decimals
    const fee = baseUtils.calculateFee({ gasPrices, currency, amount, refund, ethPrices, relayerServiceFee, decimals })
    if (fee.gt(ethers.utils.parseUnits( amount, decimals ))) {
      throw new Error('Too high refund')
    }
    const { a, b, c, args } = await generateProof({ sacredInstance, deposit, recipient, relayerAddress, fee, refund })

    console.log('Sending withdraw transaction through relay')
    try {
      const relay = await axios.post(relayerURL + '/relay', { contract: sacred._address, a, b, c, args })
      if (netId === 1 || netId === 42) {
        console.log(`Transaction submitted through the relay. View transaction on etherscan https://${getCurrentNetworkName()}etherscan.io/tx/${relay.data.txHash}`)
      } else {
        console.log(`Transaction submitted through the relay. The transaction hash is ${relay.data.txHash}`)
      }

      const receipt = await waitForTxReceipt({ txHash: relay.data.txHash })
      console.log('Transaction mined in block', receipt.blockNumber)
    } catch (e) {
      if (e.response) {
        console.error(e.response.data.error)
      } else {
        console.error(e.message)
      }
    }
  } else {
    const { a, b, c, args } = await generateProof({ sacredInstance, deposit, recipient, refund })

    console.log('Submitting withdraw transaction')
    let tx
    const senderAccount = wallet.address
    if (sacredProxy) {
      const instance = getSacredInstanceAddress(netId, currency, amount)
      tx = await (await sacredProxy.withdraw(instance, a, b, c, ...args, { from: senderAccount, value: refund.toString(), gasLimit: 20000000 })).wait()
    } else {
      tx = await (await sacredInstance.withdraw(a, b, c, ...args, { from: senderAccount, value: refund.toString(), gasLimit: 20000000 })).wait()
    }

    blockNumber = tx.blockNumber
    if (tx.status === 1) { //Success
      if ([1, 42, 4].includes(parseInt(netId))) {
        console.log(`View transaction on etherscan https://${getCurrentNetworkName()}etherscan.io/tx/${tx.transactionHash}`)
      } else {
        console.log(`The transaction hash is ${tx.transactionHash}`)
      }
    } else {
      console.error('on transactionHash error', tx.message)
    }
  }
  console.log('Done, BlockNumber:', blockNumber)
  return blockNumber
}

/** Recursive function to fetch past events, if it gives error for more than 100000 logs, it divides and conquer */
async function getPastEvents(start, end, data) {
  // console.log('start', start);
  try {
    const a = await sacred.getPastEvents('Deposit', { fromBlock: start, toBlock: end });
    data.push(a);
    return a;
  } catch (error) {
    const middle = Math.round((start + end) / 2);
    console.log('Infura 10000 limit [' + start + '..' + end + '] ' +
      '->  [' + start + '..' + middle + '] ' +
      'and [' + (middle + 1) + '..' + end + ']');
    await getPastEvents(start, middle, data);
    await getPastEvents(middle, end, data);
    let final = [];
    data?.forEach((d) => {
      final = final.concat(d);
    })
    return final;
  }
}

async function loadDepositData({ currency, amount, deposit }) {
  try {
    const sacred = contracts[currency + amount]
    if (!sacred) {
      console.log("SacredInstance was not setup properly!")
      return
    }

    const events = await baseUtils.getEvents(sacred, { eventName: "Deposit", fromBlock: 0, toBlock: 'latest' })
    const eventWhenHappened = events.filter(event => {
      return event.values["commitment"] == deposit.commitmentHex
    })

    if (eventWhenHappened.length === 0) {
      throw new Error('There is no related deposit, the note is invalid')
    }

    const { timestamp } = eventWhenHappened[0].returnValues
    const txHash = eventWhenHappened[0].transactionHash
    const isSpent = await sacred.isSpent(deposit.nullifierHex)
    const receipt = await provider.getTransactionReceipt(txHash)

    return { timestamp, txHash, isSpent, from: receipt.from, commitment: deposit.commitmentHex }
  } catch (e) {
    console.error('loadDepositData', e)
  }
  return {}
}


async function loadWithdrawalData({ amount, currency, deposit }) {
  try {
    const sacred = contracts[currency + amount]
    if (!sacred) {
      console.log("SacredInstance was not setup properly!")
      return
    }

    const events = await baseUtils.getEvents(sacred, { eventName: "Withdrawal", fromBlock: 0, toBlock: 'latest' })
    const eventWhenHappened = events.filter(event => {
      return event.values["nullifierHash"] == deposit.nullifierHex
    })

    if (eventWhenHappened.length === 0) {
      throw new Error('There is no related withdraw, the note is invalid')
    }

    const withdrawEvent = eventWhenHappened[0]
    const fee = withdrawEvent.returnValues.fee
    const decimals = config.pools[`${netId}`][currency].decimals
    const withdrawalAmount = ethers.utils.parseUnits("" + amount, decimals).sub(fee)
    const { timestamp } = await provider.getBlock(withdrawEvent.blockHash)
    return {
      amount: ethers.utils.formatUnits(withdrawalAmount, decimals),
      txHash: withdrawEvent.transactionHash,
      to: withdrawEvent.returnValues.to,
      timestamp,
      nullifier: deposit.nullifierHex,
      fee: ethers.utils.formatUnits(fee, decimals)
    }
  } catch (e) {
    console.error('loadWithdrawalData', e)
  }
}

/**
 * Waits for transaction to be mined
 * @param txHash Hash of transaction
 * @param attempts
 * @param delay
 */
function waitForTxReceipt({ txHash, attempts = 60, delay = 1000 }) {
  return new Promise((resolve, reject) => {
    const checkForTx = async (txHash, retryAttempt = 0) => {
      const result = await web3.eth.getTransactionReceipt(txHash)
      if (!result || !result.blockNumber) {
        if (retryAttempt <= attempts) {
          setTimeout(() => checkForTx(txHash, retryAttempt + 1), delay)
        } else {
          reject(new Error('tx was not mined'))
        }
      } else {
        resolve(result)
      }
    }
    checkForTx(txHash)
  })
}

function getSacredInstanceAddress(netId, currency, amount) {
  return config.pools["" + netId][currency].instanceAddress['' + amount]
}

module.exports = {
  getSacredInstanceAddress,
  deposit,
  withdraw,
  init,
  setup,
  getNetId,
  getCurrentNetworkName,
  getWalllet,
  getProvider,
  printETHBalance,
  printERC20Balance,
  loadDepositData,
  loadWithdrawalData,
  getZeroMerkleRoot,
  baseUtils,
}
