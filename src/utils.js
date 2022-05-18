require('dotenv').config()
const config = require('../sacred-token/config')
const path = require('path')
const { getCreate2Address } = require('@ethersproject/address')
const { keccak256 } = require('@ethersproject/solidity')
const { ethers } = require("hardhat");
const MerkleTree = require('fixed-merkle-tree')
const { poseidon } = require('circomlib')
const tokenConfig = require('../config')
const fs = require('fs')
const snarkjs = require('snarkjs')
const crypto = require('crypto')
const circomlib = require('circomlib')
const bigInt = snarkjs.bigInt
const merkleTree = require('../lib/MerkleTree')
const buildGroth16 = require('websnark/src/groth16')
const websnarkUtils = require('websnark/src/utils')
const { fromWei, toWei, toBN, BN } = require('web3-utils')

let web3, proxyContract, instanceContract, circuit, proving_key, groth16, erc20, senderAccount
let MERKLE_TREE_HEIGHT

const { DEPLOYER, SALT, NET_ID, AIRDROP_RECEIVER } = process.env

let addressTable = {}
let provider

async function getProvider(rpc) {
  if(!provider) {
    if(ethers.provider && typeof hre !== 'undefined') {
      provider = ethers.provider
    } else {
      if(!rpc) {
        rpc = getRPCUrl()
      }
      provider = new ethers.providers.JsonRpcProvider(rpc)
    }
  }
  return provider
}

function getRPCUrl() {
  let rpc = ""
  switch(NET_ID) {
    case "1":
      rpc = process.env.MAINNET_RPC_URL
      break
    case "42":
      rpc = process.env.KOVAN_RPC_URL
      break
    case "4":
      rpc = process.env.RINKEBY_RPC_URL
      break
    case "137":
      rpc = process.env.POLYGON_RPC_URL
      break
    case "80001":
      rpc = process.env.MUMBAI_RPC_URL
      break
  }
  return rpc
}

/** Generate random number of specified byte length */
const rbigint = nbytes => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))

/** Compute pedersen hash */
const pedersenHash = data => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

/** BigNumber to hex string of specified length */
function toHex(number, length = 32) {
  const str = number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)
  return '0x' + str.padStart(length * 2, '0')
}

/** Display ETH account balance */
async function printETHBalance({ address, name }) {
  //console.log(`${name} ETH balance is`, web3.utils.fromWei(await web3.eth.getBalance(address)))
}

/** Display ERC20 account balance */
async function printERC20Balance({ address, name, tokenAddress }) {
  const erc20ContractJson = require('./build/contracts/ERC20Mock.json')
  erc20 = tokenAddress ? new web3.eth.Contract(erc20ContractJson.abi, tokenAddress) : erc20
  console.log(`${name} Token Balance is`, web3.utils.fromWei(await erc20.methods.balanceOf(address).call()))
}

const getEvents = async (contract, options) => {
  const { eventName, fromBlock = 0, toBlock = 'latest', topics } = options;
  const provider = await getProvider()
  const parsedTopic = topics ? ethers.utils.id(contract.interface.events[topics].signature) : null;
  const events = await provider.getLogs({
    fromBlock,
    toBlock,
    address: contract.address,
    topics: [parsedTopic],
  });

  const parsedEventData = events.map(log => contract.interface.parseLog(log));
  const combinedEventData = events.map((event, index) => {
    return {
      ...event,
      name: parsedEventData[index].name,
      values: parsedEventData[index].args,
    };
  });

  let output = combinedEventData.map(event => {
    return {
      ...event,
      returnValues: event.values,
    };
  });
  output = output.filter(function(event){
    return event.name === eventName
  })
  return output;
};

/**
 * Create deposit object from secret and nullifier
 */
function createDeposit({ nullifier, secret }) {
  const deposit = { nullifier, secret }
  deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
  deposit.commitment = pedersenHash(deposit.preimage)
  deposit.commitmentHex = toHex(deposit.commitment)
  deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
  deposit.nullifierHex = toHex(deposit.nullifierHash)
  return deposit
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the sacred, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param deposit Deposit object
 */
 async function generateMerkleProof(deposit) {
  // Get all deposit events from smart contract and assemble merkle tree from them
  console.log('Getting current state from sacred contract')
  const events = await getEvents(instanceContract, {eventName:"Deposit", fromBlock: 0, toBlock: 'latest' })
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map(e => e.returnValues.commitment)
  const tree = new merkleTree(MERKLE_TREE_HEIGHT, leaves)

  // Find current commitment in the tree
  const depositEvent = events.find(e => e.returnValues.commitment === toHex(deposit.commitment))
  const leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1
  // Compute merkle proof of our commitment
  return tree.path(leafIndex)
}

/**
 * Generate SNARK proof for withdrawal
 * @param deposit Deposit object
 * @param recipient Funds recipient
 * @param relayer Relayer address
 * @param fee Relayer fee
 * @param refund Receive ether for exchanged tokens
 */
 async function generateProof({ deposit, recipient, relayerAddress = 0, fee = 0, refund = 0 }) {
  // Compute merkle proof of our commitment
  const { root, path_elements, path_index } = await generateMerkleProof(deposit)

  // Prepare circuit input
  const input = {
    // Public snark inputs
    root: root,
    nullifierHash: deposit.nullifierHash,
    recipient: bigInt(recipient),
    relayer: bigInt(relayerAddress),
    fee: bigInt(fee),
    refund: bigInt(refund),

    // Private snark inputs
    nullifier: deposit.nullifier,
    secret: deposit.secret,
    pathElements: path_elements,
    pathIndices: path_index,
  }

  console.log('Generating SNARK proof')
  console.time('Proof time')
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  console.timeEnd('Proof time')

  const args = [
    toHex(input.root),
    toHex(input.nullifierHash),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund)
  ]

  return { proof, args }
}

/**
 * Make a deposit
 * @param currency Сurrency
 * @param amount Deposit amount
 */
async function deposit({ currency, amount, netId }) {
  const instance = getSacredInstanceAddress(netId, currency, amount)
  const deposit = createDeposit({ nullifier: rbigint(31), secret: rbigint(31) })
  const note = toHex(deposit.preimage, 62)
  const noteString = `sacred-${currency}-${amount}-${NET_ID}-${note}`
  console.log(`Your note: ${noteString}`)
  let blockNumber = 0
  if (currency === 'eth') {
    const value = ethers.utils.parseEther(amount.toString())
    console.log('Submitting deposit transaction')
    console.log(value.toString())
    let overrides = { value, from: senderAccount, gasLimit: 20000000 }
    const tx = await (await proxyContract.deposit(instance, toHex(deposit.commitment), note, overrides)).wait()
    blockNumber = tx.blockNumber
  } else { // a token
    // const decimals = 18
    // const tokenAmount = fromDecimals({ amount, decimals })
    // const allowance = await erc20.methods.allowance(senderAccount, sacred.address).call({ from: senderAccount })
    // console.log('Current allowance is', fromWei(allowance))
    // if (toBN(allowance).lt(toBN(tokenAmount))) {
    //   console.log('Approving tokens for deposit')
    //   await erc20.methods.approve(sacred._address, tokenAmount).send({ from: senderAccount, gas: 1e6 })
    // }

    // console.log('Submitting deposit transaction')
    // await proxyContract.deposit(toHex(deposit.commitment)).send({ from: senderAccount, gas: 2e6 })
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
 async function withdraw({ netId, deposit, currency, amount, recipient, relayerURL, refund = '0' }) {
  const instance = getSacredInstanceAddress(netId, currency, amount)
  if (currency === 'eth' && refund !== '0') {
    throw new Error('The ETH purchase is supposted to be 0 for ETH withdrawals')
  }
  refund = toWei(refund)
  const { proof, args } = await generateProof({ deposit, recipient, refund })

  console.log('Submitting withdraw transaction')
  const tx = await (await proxyContract.withdraw(instance, proof, ...args, { from: senderAccount, value: refund.toString(), gasLimit: 20000000})).wait()
  console.log('Done')
  return tx.blockNumber
}


function parseNote(noteString) {
  const noteRegex = /sacred-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g
  const match = noteRegex.exec(noteString)
  if (!match) {
    throw new Error('The note has invalid format')
  }

  const buf = Buffer.from(match.groups.note, 'hex')
  const nullifier = bigInt.leBuff2int(buf.slice(0, 31))
  const secret = bigInt.leBuff2int(buf.slice(31, 62))
  const deposit = createDeposit({ nullifier, secret })
  const netId = Number(match.groups.netId)

  return { currency: match.groups.currency, amount: match.groups.amount, netId, deposit }
}

function fromDecimals({ amount, decimals }) {
  amount = amount.toString()
  let ether = amount.toString()
  const base = new BN('10').pow(new BN(decimals))
  const baseLength = base.toString(10).length - 1 || 1

  const negative = ether.substring(0, 1) === '-'
  if (negative) {
    ether = ether.substring(1)
  }

  if (ether === '.') {
    throw new Error('[ethjs-unit] while converting number ' + amount + ' to wei, invalid value')
  }

  // Split it into a whole and fractional part
  const comps = ether.split('.')
  if (comps.length > 2) {
    throw new Error(
      '[ethjs-unit] while converting number ' + amount + ' to wei,  too many decimal points'
    )
  }

  let whole = comps[0]
  let fraction = comps[1]

  if (!whole) {
    whole = '0'
  }
  if (!fraction) {
    fraction = '0'
  }
  if (fraction.length > baseLength) {
    throw new Error(
      '[ethjs-unit] while converting number ' + amount + ' to wei, too many decimal places'
    )
  }

  while (fraction.length < baseLength) {
    fraction += '0'
  }

  whole = new BN(whole)
  fraction = new BN(fraction)
  let wei = whole.mul(base).add(fraction)

  if (negative) {
    wei = wei.mul(negative)
  }

  return new BN(wei.toString(10), 10)
}

/**
 * Init web3, contracts, and snark
 */
async function init({ sender, proxyContractObj, instanceContractObj, currency = 'dai', amount = '100' }) {
  // TODO do we need this? should it work in browser really?
  senderAccount = sender
  circuit = require('../lib/sacred-eth-build/circuits/withdraw.json')
  proving_key = fs.readFileSync('lib/sacred-eth-build/circuits/withdraw_proving_key.bin').buffer
  MERKLE_TREE_HEIGHT = process.env.MERKLE_TREE_HEIGHT || 20
  groth16 = await buildGroth16()
  proxyContract = proxyContractObj
  instanceContract = instanceContractObj
  erc20 = {}
}

function initAddressTable(configData) {
  let keys = Object.keys(configData)
  for (var i = 0; i < keys.length; ++i) {
    let data = configData[keys[i]]
    if(data instanceof Object) {
      if(data.address) {
        addressTable[data.address] = ""
      }
      if(data.instance) {
        addressTable[data.instance] = ""
      }
      initAddressTable(data)
    }
  }

  addressTable['eth-01.sacredcash.eth'] = getSacredInstanceAddress(NET_ID, "eth", 0.1)
  addressTable['eth-1.sacredcash.eth'] = getSacredInstanceAddress(NET_ID, "eth", 1)
  addressTable['eth-10.sacredcash.eth'] = getSacredInstanceAddress(NET_ID, "eth", 10)
  addressTable['eth-100.sacredcash.eth'] = getSacredInstanceAddress(NET_ID, "eth", 100)
}

initAddressTable(config)

function getSacredInstanceAddress(netId, currency, amount) {
  return tokenConfig.deployments["netId" + netId][currency].instanceAddress['' + amount]
}

const poseidonHash = (items) => poseidon(items)
const poseidonHash2 = (a, b) => poseidonHash([a, b])
const tree = new MerkleTree(20, [], { hashFunction: poseidonHash2 })
const zeroMerkleRoot =
  '0x' +
  tree
    .root()
    .toString(16)
    .padStart(32 * 2, '0')

function getContractData(contractPath) {
  const json = require(contractPath)
  return {
    bytecode: json.bytecode,
    abi: json.abi,
    name: path.basename(contractPath, '.json'),
  }
}

function getAddress(bytecode) {
  const initHash = keccak256(['bytes'], [bytecode])
  return getCreate2Address(DEPLOYER, SALT, initHash)
}

function deploy({
  domain,
  amount,
  contract,
  args,
  title = '',
  description = '',
  dependsOn = [config.deployer.address],
  abi = ''
}) {
  console.log('Generating deploy for', contract.name)
  let bytecode = contract.bytecode
  if (args) {
    const c = new ethers.ContractFactory(contract.abi, contract.bytecode)
    bytecode = c.getDeployTransaction(...args).data
  }
  const expAddr = getAddress(bytecode)
  addressTable[domain] = expAddr
  return {
    domain,
    amount,
    contract: contract.name + '.sol',
    bytecode,
    abi: abi ? abi : contract.abi,
    expectedAddress: expAddr,
    title,
    description,
    dependsOn,
  }
}

function ensToAddr(ens) {
  return addressTable[ens]
}

function updateAddressTable(table) {
  addressTable = table
}

module.exports = {
  deploy,
  getContractData,
  zeroMerkleRoot,
  addressTable,
  ensToAddr,
  updateAddressTable,
  getSacredInstanceAddress,
  deposit,
  withdraw, 
  parseNote, 
  init,
  getProvider,
  getRPCUrl
}
