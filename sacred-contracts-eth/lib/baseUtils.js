require('dotenv').config()
const { ethers } = require("hardhat");
const { poseidon } = require('circomlib')
const fs = require('fs')
const snarkjs = require('snarkjs')
const crypto = require('crypto')
const circomlib = require('circomlib')
const bigInt = snarkjs.bigInt
const { fromWei, toWei, toBN, BN } = require('web3-utils')
let provider

function bitsToNumber(bits) {
  let result = 0
  for (const item of bits.slice().reverse()) {
    result = (result << 1) + item
  }
  return result
}

/** Generate random number of specified byte length */
const rbigint = nbytes => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))

/** Compute pedersen hash */
const pedersenHash = data => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

const poseidonHash = (items) => poseidon(items)
const poseidonHash2 = (a, b) => poseidonHash([a, b])

/** BigNumber to hex string of specified length */
function toHex(number, length = 32) {
  const str = number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)
  return '0x' + str.padStart(length * 2, '0')
}

/**
 * Abstraction for getting events from ethers. Returns human readable events.
 *
 * @memberof dapp-utils/ethers
 *
 * @param {ethers.Contract} contract - ethers contract instance.
 * @param {object} options
 * @param {number} options.from - Block to query from.
 * @param {number|string} options.to - block to query to.
 * @param {string} options.topics - name of event as it appears in the contract (i.e., 'Transfer').
 * @returns {array} - Array of events.
 */
const getEvents = async (contract, options) => {
  const { eventName, fromBlock = 0, toBlock = 'latest', topics } = options;
  const parsedTopic = topics ? ethers.utils.id(contract.interface.events[topics].signature) : null;
  if(!provider) {
    console.log("BaseUtils isn't initialized!")
  }
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
 * Parses Sacred.cash note
 * @param noteString the note
 */
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

function toDecimals(value, decimals, fixed) {
  const zero = new BN(0)
  const negative1 = new BN(-1)
  decimals = decimals || 18
  fixed = fixed || 7

  value = new BN(value)
  const negative = value.lt(zero)
  const base = new BN('10').pow(new BN(decimals))
  const baseLength = base.toString(10).length - 1 || 1

  if (negative) {
    value = value.mul(negative1)
  }

  let fraction = value.mod(base).toString(10)
  while (fraction.length < baseLength) {
    fraction = `0${fraction}`
  }
  fraction = fraction.match(/^([0-9]*[1-9]|0)(0*)/)[1]

  const whole = value.div(base).toString(10)
  value = `${whole}${fraction === '0' ? '' : `.${fraction}`}`

  if (negative) {
    value = `-${value}`
  }

  if (fixed) {
    value = value.slice(0, fixed)
  }

  return value
}

function calculateFee({ gasPrices, currency, amount, refund, ethPrices, relayerServiceFee, decimals }) {
  const decimalsPoint = Math.floor(relayerServiceFee) === Number(relayerServiceFee) ?
    0 :
    relayerServiceFee.toString().split('.')[1].length
  const roundDecimal = 10 ** decimalsPoint
  const total = toBN(fromDecimals({ amount, decimals }))
  const feePercent = total.mul(toBN(relayerServiceFee * roundDecimal)).div(toBN(roundDecimal * 100))
  const expense = toBN(toWei(gasPrices.fast.toString(), 'gwei')).mul(toBN(0xF4240))
  let desiredFee
  switch (currency) {
    case 'eth': {
      desiredFee = expense.add(feePercent)
      break
    }
    default: {
      desiredFee = expense.add(toBN(refund))
        .mul(toBN(10 ** decimals))
        .div(toBN(ethPrices[currency]))
      desiredFee = desiredFee.add(feePercent)
      break
    }
  }
  return desiredFee
}

async function getProvider(rpc) {
  if(!provider) {
    if(ethers.provider && typeof hre !== 'undefined') {
      provider = ethers.provider
    } else {
      if(!rpc) {
        console.log("Please provide RPC url!")
        return null
      }
      provider = new ethers.providers.JsonRpcProvider(rpc)
    }
  }
  return provider
}

function getNetworkName(netId) {
  let netName
  switch (netId) {
    case 1:
      return 'mainnet'
    case 4:
      return 'rinkeby'
    case 42:
      return 'kovan'
  }
  return netName
}

async function init(rpc) {
  await getProvider(rpc)
}

module.exports = {
  init,
  bitsToNumber,
  rbigint,
  toHex,
  pedersenHash,
  poseidonHash2,
  parseNote,
  createDeposit, 
  calculateFee,
  fromDecimals,
  toDecimals,
  getEvents,
  getProvider,
  getNetworkName
}
