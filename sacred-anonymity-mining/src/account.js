const { encrypt, decrypt } = require('eth-sig-util')
const {randomBN, numToBuffer, bufferToNum, poseidonHash} = require('../../sacred-contracts-eth/lib/baseUtils')
const currencyList = ["eth", "dai"]

class Account {
  constructor({ amounts, secret, nullifier } = {}) {
    
    if(!amounts) {
      amounts = {}
      currencyList.forEach(symbol => {
        amounts[symbol] = {
          "apAmount" : BigInt('0'),
          "aaveInterestAmount" : BigInt('0')
        }
      })
    }

    this.amounts = amounts
    this.secret = secret ? BigInt(secret) : randomBN(31)
    this.nullifier = nullifier ? BigInt(nullifier) : randomBN(31)

    let data = []
    currencyList.forEach(symbol=>{
      data.push(this.amounts[symbol].apAmount)
      data.push(this.amounts[symbol].aaveInterestAmount)
    })
    data.push(this.secret)
    data.push(this.nullifier)
    this.commitment = poseidonHash(data)
    this.nullifierHash = poseidonHash([this.nullifier])

    currencyList.forEach(symbol => {
      const amountInfo = this.amounts[symbol]
      if (amountInfo.apAmount.lt(BigInt(0))) {
        throw new Error('Cannot create an account with negative ap amount')
      }
  
      if (amountInfo.aaveInterestAmount.lt(BigInt(0))) {
        throw new Error('Cannot create an account with negative aave interests amount')
      }
    })
  }

  getAmountsList() {
    let data = []
    currencyList.forEach(symbol=>{
      data.push(this.amounts[symbol].apAmount)
    })
    return data
  }

  getAaveInterestsList() {
    let data = []
    currencyList.forEach(symbol=>{
      data.push(this.amounts[symbol].aaveInterestAmount)
    })
    return data
  }

  getApAmount(symbol) {
    return this.amounts[symbol].apAmount
  }

  getAaveInterest(symbol) {
    return this.amounts[symbol].aaveInterestAmount
  }

  static getCurrencyIndex(symbol) {
    return currencyList.findIndex(item => {
      return symbol === item
    })
  }

  encrypt(pubkey) {
    let data = [numToBuffer(this.secret, 31, 'be'), numToBuffer(this.nullifier, 31, 'be')]
    currencyList.forEach(symbol=>{
      data.push(symbol)
      data.push("&&")
      data.push(numToBuffer(this.amounts[symbol].apAmount, 31, 'be'))
      data.push(numToBuffer(this.amounts[symbol].aaveInterestAmount, 31, 'be'))
      data.push(";;")
    })
    const bytes = Buffer.concat(data)
    return encrypt(pubkey, { data: bytes.toString('base64') }, 'x25519-xsalsa20-poly1305')
  }

  static decrypt(privkey, data) {
    const decryptedMessage = decrypt(data, privkey)
    const buf = Buffer.from(decryptedMessage, 'base64')
    const secret = bufferToNum(buf.slice(0, 31), "be")
    const nullifier = bufferToNum(buf.slice(31, 62), "be")
    let amounts = {}
    const coinInfos = buf.slice(62).split(";;")
    coinInfos.forEach(infoBuf=>{
      const data = infoBuf.split("&&")
      if(data.length !== 2) {
        throw new Error('Corrupted CoinInfo')
      }
      const symbol = data[0]
      amounts[symbol] = {
        "apAmount" : bufferToNum(data[1].slice(0, 31), "be"),
        "aaveInterestAmount" : bufferToNum(data[1].slice(31, 62), "be")
      }
    })

    return new Account({
      amounts,
      secret,
      nullifier,
    })
  }
}

module.exports = Account
