
const {parseNote, numToBuffer, randomBN, pedersenHash, poseidonHash} = require('../../sacred-contracts-eth/lib/baseUtils')

class Note {
  constructor({ secret, nullifier, netId, amount, currency, depositBlock, withdrawalBlock, instance } = {}) {
    this.secret = secret ? BigInt(secret) : randomBN(31)
    this.nullifier = nullifier ? BigInt(nullifier) : randomBN(31)

    this.commitment = pedersenHash(
      Buffer.concat([numToBuffer(this.nullifier, 31, 'le'), numToBuffer(this.secret, 31, 'le')]),
    )
    this.nullifierHash = pedersenHash(numToBuffer(this.nullifier, 31, 'le'))
    this.rewardNullifier = poseidonHash([this.nullifierHash])

    this.netId = netId
    this.amount = amount
    this.currency = currency
    this.depositBlock = BigInt(depositBlock)
    this.withdrawalBlock = BigInt(withdrawalBlock)
    this.instance = instance || Note.getInstance(currency, amount)
  }

  static getInstance(/* currency, amount */) {
    // todo
  }

  static fromString(note, instance, depositBlock, withdrawalBlock) {
    const {currency, amount, netId, deposit} = parseNote(note)
    return new Note({
      secret: deposit.secret,
      nullifier: deposit.nullifier,
      netId,
      amount,
      currency,
      depositBlock,
      withdrawalBlock,
      instance,
    })
  }
}

module.exports = Note
