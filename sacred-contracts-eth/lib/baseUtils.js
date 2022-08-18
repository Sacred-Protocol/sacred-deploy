const { ethers } = require("hardhat");
const {toBigIntLE, toBufferLE, toBigIntBE, toBufferBE} = require('bigint-buffer')
const crypto = require('crypto')
const circomlib = require('circomlibjs');

let provider
let babyJub, pedersen, poseidon

function bitsToNumber(bits) {
  let result = 0
  for (const item of bits.slice().reverse()) {
    result = (result << 1) + item
  }
  return result
}

/** Generate random number of specified byte length */
const randomBN = (nbytes = 31) => BigInt(toBigIntLE(crypto.randomBytes(nbytes)).toString())

/** Compute pedersen hash */
const pedersenHash = data => BigInt(babyJub.F.toString(babyJub.unpackPoint(pedersen.hash(data))[0]))
const poseidonHash = (items) => BigInt(poseidon.F.toString(poseidon(items)))
const poseidonHash2 = (a, b) => poseidonHash([a, b])

function numToBuffer(number, size, endianess) {
  if(endianess === "le") {
    return toBufferLE(number, size)
  } else if(endianess === "be") {
    return toBufferBE(number, size)
  } else {
    console.log("endianess has to be 'le' or 'be'")
    return ""
  }
}

function bufferToNum(buf, endianess) {
  if(endianess === "le") {
    return toBigIntLE(buf)
  } else if(endianess === "be") {
    return toBigIntBE(buf)
  } else {
    console.log("endianess has to be 'le' or 'be'")
    return 0
  }
}

function unstringifyBigInts(o) {
  if ((typeof(o) == "string") && (/^[0-9]+$/.test(o) ))  {
      return BigInt(o);
  } else if ((typeof(o) == "string") && (/^0x[0-9a-fA-F]+$/.test(o) ))  {
      return BigInt(o);
  } else if (Array.isArray(o)) {
      return o.map(unstringifyBigInts);
  } else if (typeof o == "object") {
      if (o===null) return null;
      const res = {};
      const keys = Object.keys(o);
      keys.forEach( (k) => {
          res[k] = unstringifyBigInts(o[k]);
      });
      return res;
  } else {
      return o;
  }
}

/** BigNumber to hex string of specified length */
function toHex(number, length = 32) {
  const str = number instanceof Buffer ? number.toString('hex') : BigInt(number).toString(16)
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
  if (!provider) {
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
  output = output.filter(function (event) {
    return event.name === eventName
  })
  return output;
};

/**
 * Create deposit object from secret and nullifier
 */
function createDeposit({ nullifier, secret }) {
  const deposit = { nullifier, secret }
  const nullifierBuffer = numToBuffer(deposit.nullifier, 31, 'le')
  deposit.preimage = Buffer.concat([nullifierBuffer, numToBuffer(deposit.secret, 31, 'le')])
  deposit.commitment = pedersenHash(deposit.preimage)
  deposit.commitmentHex = toHex(deposit.commitment)
  deposit.nullifierHash = pedersenHash(nullifierBuffer)
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
  const nullifier = bufferToNum(buf.slice(0, 31), 'le')
  const secret = bufferToNum(buf.slice(31, 62), 'le')
  const deposit = createDeposit({ nullifier, secret })
  const netId = Number(match.groups.netId)

  return { currency: match.groups.currency, amount: match.groups.amount, netId, deposit }
}

function calculateFee({ gasPrices, currency, amount, refund, ethPrices, relayerServiceFee, decimals }) {
  const decimalsPoint = Math.floor(relayerServiceFee) === Number(relayerServiceFee) ?
    0 :
    relayerServiceFee.toString().split('.')[1].length
  const roundDecimal = 10 ** decimalsPoint
  const total = ethers.utils.parseUnits( amount, decimals )
  const feePercent = total.mul(BigInt(relayerServiceFee * roundDecimal)).div(BigInt(roundDecimal * 100))
  const expense = ethers.utils.parseUnits(gasPrices.fast.toString(), 'gwei').mul(BigInt(0xF4240))
  let desiredFee
  switch (currency) {
    case 'eth': {
      desiredFee = expense.add(feePercent)
      break
    }
    default: {
      desiredFee = expense.add(BigInt(refund))
        .mul(BigInt(10 ** decimals))
        .div(BigInt(ethPrices[currency]))
      desiredFee = desiredFee.add(feePercent)
      break
    }
  }
  return desiredFee
}

async function getProvider(rpc) {
  if (!provider) {
    if (ethers.provider && typeof hre !== 'undefined') {
      provider = ethers.provider
    } else {
      if (!rpc) {
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
  babyJub = await circomlib.buildBabyjub()
  pedersen = await circomlib.buildPedersenHash();
  poseidon = await circomlib.buildPoseidon();
  await getProvider(rpc)
}

module.exports = {
  init,
  bitsToNumber,
  randomBN,
  toHex,
  pedersenHash,
  poseidonHash,
  poseidonHash2,
  parseNote,
  createDeposit,
  calculateFee,
  getEvents,
  getProvider,
  getNetworkName,
  unstringifyBigInts,
  numToBuffer,
  bufferToNum
}
