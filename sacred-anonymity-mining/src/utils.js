const Decimal = require('decimal.js')
const { soliditySha3 } = require('web3-utils')
const { groth16 } = require('snarkjs')
const { toHex, unstringifyBigInts} = require('../../sacred-contracts-eth/lib/baseUtils')
const Web3 = require('web3')
const web3 = new Web3()

const RewardExtData = {
  RewardExtData: {
    relayer: 'address',
    encryptedAccount: 'bytes',
  },
}
const AccountUpdate = {
  AccountUpdate: {
    inputRoot: 'bytes32',
    inputNullifierHash: 'bytes32',
    outputRoot: 'bytes32',
    outputPathIndices: 'uint256',
    outputCommitment: 'bytes32',
  },
}
const RewardArgs = {
  RewardArgs: {
    rate: 'uint256',
    fee: 'uint256',
    instance: 'address',
    rewardNullifier: 'bytes32',
    extDataHash: 'bytes32',
    currencyIndex: 'uint256',
    depositRoot: 'bytes32',
    withdrawalRoot: 'bytes32',
    extData: RewardExtData.RewardExtData,
    account: AccountUpdate.AccountUpdate,
  },
}

const WithdrawExtData = {
  WithdrawExtData: {
    fee: 'uint256',
    recipient: 'address',
    relayer: 'address',
    encryptedAccount: 'bytes',
  },
}

function getExtRewardArgsHash({ relayer, encryptedAccount }) {
  const encodedData = web3.eth.abi.encodeParameters(
    [RewardExtData],
    [{ relayer: toHex(relayer, 20), encryptedAccount }],
  )
  const hash = soliditySha3({ t: 'bytes', v: encodedData })
  return '0x00' + hash.slice(4) // cut last byte to make it 31 byte long to fit the snark field
}

function getExtWithdrawArgsHash({ fee, recipient, relayer, encryptedAccount }) {
  const encodedData = web3.eth.abi.encodeParameters(
    [WithdrawExtData],
    [
      {
        fee: toHex(fee, 32),
        recipient: toHex(recipient, 20),
        relayer: toHex(relayer, 20),
        encryptedAccount,
      },
    ],
  )
  const hash = soliditySha3({ t: 'bytes', v: encodedData })
  return '0x00' + hash.slice(4) // cut first byte to make it 31 byte long to fit the snark field
}

function packEncryptedMessage(encryptedMessage) {
  const nonceBuf = Buffer.from(encryptedMessage.nonce, 'base64')
  const ephemPublicKeyBuf = Buffer.from(encryptedMessage.ephemPublicKey, 'base64')
  const ciphertextBuf = Buffer.from(encryptedMessage.ciphertext, 'base64')
  const messageBuff = Buffer.concat([
    Buffer.alloc(24 - nonceBuf.length),
    nonceBuf,
    Buffer.alloc(32 - ephemPublicKeyBuf.length),
    ephemPublicKeyBuf,
    ciphertextBuf,
  ])
  return '0x' + messageBuff.toString('hex')
}

function unpackEncryptedMessage(encryptedMessage) {
  if (encryptedMessage.slice(0, 2) === '0x') {
    encryptedMessage = encryptedMessage.slice(2)
  }
  const messageBuff = Buffer.from(encryptedMessage, 'hex')
  const nonceBuf = messageBuff.slice(0, 24)
  const ephemPublicKeyBuf = messageBuff.slice(24, 56)
  const ciphertextBuf = messageBuff.slice(56)
  return {
    version: 'x25519-xsalsa20-poly1305',
    nonce: nonceBuf.toString('base64'),
    ephemPublicKey: ephemPublicKeyBuf.toString('base64'),
    ciphertext: ciphertextBuf.toString('base64'),
  }
}

// a = floor(10**18 * e^(-0.0000000001 * amount))
// yield = BalBefore - (BalBefore * a)/10**18
function sacredFormula({ balance, amount, poolWeight = 1e10 }) {
  const decimals = new Decimal(10 ** 18)
  balance = new Decimal(balance.toString())
  amount = new Decimal(amount.toString())
  poolWeight = new Decimal(poolWeight.toString())

  const power = amount.div(poolWeight).negated()
  const exponent = Decimal.exp(power).mul(decimals)
  const newBalance = balance.mul(exponent).div(decimals)
  return BigInt(balance.sub(newBalance).toFixed(0))
}

function reverseSacredFormula({ balance, tokens, poolWeight = 1e10 }) {
  balance = new Decimal(balance.toString())
  tokens = new Decimal(tokens.toString())
  poolWeight = new Decimal(poolWeight.toString())

  return BigInt(poolWeight.times(Decimal.ln(balance.div(balance.sub(tokens)))).toFixed(0))
}

module.exports = {
  getExtRewardArgsHash,
  getExtWithdrawArgsHash,
  packEncryptedMessage,
  unpackEncryptedMessage,
  sacredFormula,
  reverseSacredFormula,
  RewardArgs,
  RewardExtData,
  AccountUpdate,
}
