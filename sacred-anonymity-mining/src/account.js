const { encrypt, decrypt } = require('eth-sig-util')
const {randomBN, numToBuffer, bufferToNum, poseidonHash} = require('../../sacred-contracts-eth/lib/baseUtils')
const currencyList = ["eth", "dai", "reserve1", "reserve2", "reserve3"]

class Account {
  constructor({ apAmounts, aaveInterestAmounts, secret, nullifier } = {}) {
    
    this.apAmounts = [...new Array(currencyList.length)].map(() => BigInt(0))
    this.aaveInterestAmounts = [...new Array(currencyList.length)].map(() => BigInt(0))
    if(apAmounts) {
      this.apAmounts = [...apAmounts]
    }
    if(aaveInterestAmounts) {
      this.aaveInterestAmounts = [...aaveInterestAmounts]
    }
    this.secret = secret ? BigInt(secret) : randomBN(31)
    this.nullifier = nullifier ? BigInt(nullifier) : randomBN(31)

    let data = []
    for(let i = 0; i < currencyList.length; i++) {
      data.push(this.apAmounts[i])
      data.push(this.aaveInterestAmounts[i])
    }
    data.push(this.secret)
    data.push(this.nullifier)
    this.commitment = poseidonHash(data)
    this.nullifierHash = poseidonHash([this.nullifier])

    for(let i = 0; i < currencyList.length; i++) {
      if (this.apAmounts[i].lt(BigInt(0))) {
        throw new Error('Cannot create an account with negative ap amount')
      }
  
      if (this.aaveInterestAmounts[i].lt(BigInt(0))) {
        throw new Error('Cannot create an account with negative aave interests amount')
      }
    }
  }

  getApAmountList() {
    return [...this.apAmounts]
  }

  getAaveInterestList() {
    return [...this.aaveInterestAmounts]
  }

  getApAmount(symbol) {
    const index = Account.getCurrencyIndex(symbol)
    return this.apAmounts[index]
  }

  getAaveInterest(symbol) {
    const index = Account.getCurrencyIndex(symbol)
    return this.aaveInterestAmounts[index]
  }

  static getCurrencyIndex(symbol) {
    return currencyList.findIndex(item => {
      return symbol === item
    })
  }

  encrypt(pubkey) {
    let data = [numToBuffer(this.secret, 31, 'be'), numToBuffer(this.nullifier, 31, 'be')]
    for(let i = 0; i < currencyList.length; i++) {
      data.push(numToBuffer(this.apAmounts[i], 31, 'be'))
      data.push(numToBuffer(this.aaveInterestAmounts[i], 31, 'be'))
    }
    const bytes = Buffer.concat(data)
    return encrypt(pubkey, { data: bytes.toString('base64') }, 'x25519-xsalsa20-poly1305')
  }

  static decrypt(privkey, data) {
    const decryptedMessage = decrypt(data, privkey)
    const buf = Buffer.from(decryptedMessage, 'base64')
    const secret = bufferToNum(buf.slice(0, 31), "be")
    const nullifier = bufferToNum(buf.slice(31, 62), "be")
    let apAmounts = [...new Array(currencyList.length)].map(() => BigInt(0))
    let aaveInterestAmounts = [...new Array(currencyList.length)].map(() => BigInt(0))
    for(let i = 0; i < currencyList.length; i++) {
      const index = 62 + i * 62
      apAmounts[i] = bufferToNum(buf.slice(index, index + 31), "be")
      aaveInterestAmounts[i] = bufferToNum(buf.slice(index + 31, index + 62), "be")
    }

    return new Account({
      apAmounts,
      aaveInterestAmounts,
      secret,
      nullifier,
    })
  }
}

module.exports = Account
