const { toBN } = require('web3-utils')
const {
  getExtRewardArgsHash,
  getExtWithdrawArgsHash,
  packEncryptedMessage,
  RewardArgs,
} = require('./utils')

const {poseidonHash, poseidonHash2, bitsToNumber, toHex} = require('../../sacred-contracts-eth/lib/baseUtils')

const Account = require('./account')
const MerkleTree = require('fixed-merkle-tree')
const websnarkUtils = require('websnark/src/utils')
const buildGroth16 = require('websnark/src/groth16')
const { ethers } = require("hardhat")
let provider

async function getProvider(rpc) {
  if(!provider) {
    if(ethers.provider && typeof hre !== 'undefined') {
      provider = ethers.provider
    } else {
      if(!rpc) {
        console.log("Please provide RPC Url!")
      } else {
        provider = new ethers.providers.JsonRpcProvider(rpc)
      }
    }
  }
  return provider
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

class Controller {
  constructor({ minerContract, sacredTreesContract, merkleTreeHeight, provingKeys, groth16 }) {
    this.merkleTreeHeight = Number(merkleTreeHeight)
    this.provingKeys = provingKeys
    this.minerContract = minerContract
    this.sacredTreesContract = sacredTreesContract
    this.groth16 = groth16
  }

  async init(rpc) {
    this.groth16 = await buildGroth16()
    await getProvider(rpc)
  }

  async _fetchAccountCommitments() {
    const events = await getEvents(this.minerContract, {eventName:'NewAccount', fromBlock: 0, toBlock: 'latest' })
    // const events = await this.minerContract.getPastEvents('NewAccount', {
    //   fromBlock: 0,
    //   toBlock: 'latest',
    // })
    return events
      .sort((a, b) => a.returnValues.index - b.returnValues.index)
      .map((e) => toBN(e.returnValues.commitment))
  }

  _fetchDepositDataEvents() {
    return this._fetchEvents('DepositData')
  }

  _fetchWithdrawalDataEvents() {
    return this._fetchEvents('WithdrawalData')
  }

  async _fetchEvents(eventName) {
    const events = await getEvents(this.sacredTreesContract, {eventName, fromBlock: 0, toBlock: 'latest' })
    // const events = await this.sacredTreesContract.getPastEvents(eventName, {
    //   fromBlock: 0,
    //   toBlock: 'latest',
    // })
    return events
      .sort((a, b) => a.returnValues.index - b.returnValues.index)
      .map((e) => ({
        instance: toHex(e.returnValues.instance, 20),
        hash: toHex(e.returnValues.hash),
        block: Number(e.returnValues.block),
        index: Number(e.returnValues.index),
      }))
  }

  _updateTree(tree, element) {
    const oldRoot = tree.root()
    tree.insert(element)
    const newRoot = tree.root()
    const { pathElements, pathIndices } = tree.path(tree.elements().length - 1)
    return {
      oldRoot,
      newRoot,
      pathElements,
      pathIndices: bitsToNumber(pathIndices),
    }
  }

  async batchReward({ account, notes, publicKey, fee = 0, relayer = 0 }) {
    const accountCommitments = await this._fetchAccountCommitments()
    let lastAccount = account
    const proofs = []
    for (const note of notes) {
      const proof = await this.reward({
        account: lastAccount,
        note,
        publicKey,
        fee,
        relayer,
        accountCommitments: accountCommitments.slice(),
      })
      proofs.push(proof)
      lastAccount = proof.account
      accountCommitments.push(lastAccount.commitment)
    }
    const args = proofs.map((x) => web3.eth.abi.encodeParameters(['bytes', RewardArgs], [x.proof, x.args]))
    return { proofs, args }
  }

  /**
   * Generates proof and args to claim AP (anonymity points) for a note
   * @param {Account} account The account the AP will be added to
   * @param {Note} note The target note
   * @param {String} publicKey ETH public key for the Account encryption
   * @param {Number} fee Fee for the relayer
   * @param {String} relayer Relayer address
   * @param {Number} rate How many AP is generated for the note in block time
   * @param {String[]} accountCommitments An array of account commitments from miner contract
   * @param {String[]} depositDataEvents An array of account commitments from miner contract
   * @param {{instance: String, hash: String, block: Number, index: Number}[]} depositDataEvents An array of deposit objects from sacredTrees contract. hash = commitment
   * @param {{instance: String, hash: String, block: Number, index: Number}[]} withdrawalDataEvents An array of withdrawal objects from sacredTrees contract. hash = nullifierHash
   */
  async reward({
    account,
    note,
    publicKey,
    fee = 0,
    relayer = 0,
    rate = null,
    accountCommitments = null,
    depositDataEvents = null,
    withdrawalDataEvents = null,
  }) {
    if(!rate) {
      rate = await this.minerContract.rates(note.instance)
      rate = rate.toString()
    }
    const apAmount = toBN(rate).mul(toBN(note.withdrawalBlock).sub(toBN(note.depositBlock)))
    const newApAmount = account.apAmount.add(apAmount.sub(toBN(fee)))

    const tx = await (await this.minerContract.getAaveInterestsAmount(toHex(note.rewardNullifier), toHex(apAmount.toString()))).wait();
    const amountEvent = tx.events.find(item => item.event === 'AaveInterestsAmount')
    let aaveInterestAmount = toBN(amountEvent.args.amount.toString());
    let newAaveInterestAmount = account.aaveInterestAmount.add(aaveInterestAmount);

    const newAccount = new Account({ apAmount: newApAmount, aaveInterestAmount: newAaveInterestAmount })

    depositDataEvents = depositDataEvents || (await this._fetchDepositDataEvents())
    const depositLeaves = depositDataEvents.map((x) => {
      if (x.poseidon) {
        return x.poseidon
      }

      return poseidonHash([x.instance, x.hash, x.block])
    })

    const depositTree = new MerkleTree(this.merkleTreeHeight, depositLeaves, { hashFunction: poseidonHash2 })
    const depositItem = depositDataEvents.filter((x) => x.hash === toHex(note.commitment))
    if (depositItem.length === 0) {
      throw new Error('The deposits tree does not contain such note commitment')
    }
    const depositPath = depositTree.path(depositItem[0].index)

    withdrawalDataEvents = withdrawalDataEvents || (await this._fetchWithdrawalDataEvents())
    const withdrawalLeaves = withdrawalDataEvents.map((x) => {
      if (x.poseidon) {
        return x.poseidon
      }

      return poseidonHash([x.instance, x.hash, x.block])
    })
    const withdrawalTree = new MerkleTree(this.merkleTreeHeight, withdrawalLeaves, { hashFunction: poseidonHash2 })
    const withdrawalItem = withdrawalDataEvents.filter((x) => x.hash === toHex(note.nullifierHash))
    if (withdrawalItem.length === 0) {
      throw new Error('The withdrawals tree does not contain such note nullifier')
    }

    const withdrawalPath = withdrawalTree.path(withdrawalItem[0].index)

    accountCommitments = accountCommitments || (await this._fetchAccountCommitments())
    const accountTree = new MerkleTree(this.merkleTreeHeight, accountCommitments, {
      hashFunction: poseidonHash2,
    })

    const zeroAccount = {
      pathElements: new Array(this.merkleTreeHeight).fill(0),
      pathIndices: new Array(this.merkleTreeHeight).fill(0),
    }

    const accountIndex = accountTree.indexOf(account.commitment, (a, b) => toBN(a).eq(toBN(b)))
    const accountPath = accountIndex !== -1 ? accountTree.path(accountIndex) : zeroAccount
    const accountTreeUpdate = this._updateTree(accountTree, newAccount.commitment)

    const encryptedAccount = packEncryptedMessage(newAccount.encrypt(publicKey))
    const extDataHash = getExtRewardArgsHash({ relayer, encryptedAccount })
    const input = {
      rate,
      fee,
      instance: note.instance,
      rewardNullifier: note.rewardNullifier,
      extDataHash,

      noteSecret: note.secret,
      noteNullifier: note.nullifier,
      noteNullifierHash: note.nullifierHash,
      apAmount: toBN(rate).mul(toBN(note.withdrawalBlock).sub(toBN(note.depositBlock))),
      aaveInterestAmount: aaveInterestAmount,
      inputApAmount: account.apAmount,
      inputAaveInterestAmount: account.aaveInterestAmount,
      inputSecret: account.secret,
      inputNullifier: account.nullifier,
      inputRoot: accountTreeUpdate.oldRoot,
      inputPathElements: accountPath.pathElements,
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      inputNullifierHash: account.nullifierHash,

      outputApAmount: newAccount.apAmount,
      outputAaveInterestAmount: newAccount.aaveInterestAmount,
      outputSecret: newAccount.secret,
      outputNullifier: newAccount.nullifier,
      outputRoot: accountTreeUpdate.newRoot,
      outputPathIndices: accountTreeUpdate.pathIndices,
      outputPathElements: accountTreeUpdate.pathElements,
      outputCommitment: newAccount.commitment,

      depositBlock: note.depositBlock,
      depositRoot: depositTree.root(),
      depositPathIndices: bitsToNumber(depositPath.pathIndices),
      depositPathElements: depositPath.pathElements,

      withdrawalBlock: note.withdrawalBlock,
      withdrawalRoot: withdrawalTree.root(),
      withdrawalPathIndices: bitsToNumber(withdrawalPath.pathIndices),
      withdrawalPathElements: withdrawalPath.pathElements,
    }

    const proofData = await websnarkUtils.genWitnessAndProve(
      this.groth16,
      input,
      this.provingKeys.rewardCircuit,
      this.provingKeys.rewardProvingKey,
    )

    const { proof } = websnarkUtils.toSolidityInput(proofData)

    const args = {
      rate: toHex(input.rate),
      fee: toHex(input.fee),
      instance: toHex(input.instance, 20),
      apAmount: toHex(input.apAmount.toString()),
      aaveInterestAmount: toHex(input.aaveInterestAmount.toString()),
      rewardNullifier: toHex(input.rewardNullifier),
      extDataHash: toHex(input.extDataHash),
      depositRoot: toHex(input.depositRoot),
      withdrawalRoot: toHex(input.withdrawalRoot),
      extData: {
        relayer: toHex(relayer, 20),
        encryptedAccount,
      },
      account: {
        inputRoot: toHex(input.inputRoot),
        inputNullifierHash: toHex(input.inputNullifierHash),
        outputRoot: toHex(input.outputRoot),
        outputPathIndices: toHex(input.outputPathIndices),
        outputCommitment: toHex(input.outputCommitment),
      },
    }

    return {
      proof,
      args,
      account: newAccount,
    }
  }

  async withdraw({ account, apAmount, aaveInterestAmount, recipient, publicKey, fee = 0, relayer = 0, accountCommitments = null }) {
    const newApAmount = account.apAmount.sub(toBN(apAmount)).sub(toBN(fee))
    const newAaveInterestAmount = account.aaveInterestAmount.sub(toBN(aaveInterestAmount))
    const newAccount = new Account({ apAmount: newApAmount, aaveInterestAmount: newAaveInterestAmount })

    accountCommitments = accountCommitments || (await this._fetchAccountCommitments())
    const accountTree = new MerkleTree(this.merkleTreeHeight, accountCommitments, {
      hashFunction: poseidonHash2,
    })
    const accountIndex = accountTree.indexOf(account.commitment, (a, b) => toBN(a).eq(toBN(b)))
    if (accountIndex === -1) {
      throw new Error('The accounts tree does not contain such account commitment')
    }
    const accountPath = accountTree.path(accountIndex)
    const accountTreeUpdate = this._updateTree(accountTree, newAccount.commitment)

    const encryptedAccount = packEncryptedMessage(newAccount.encrypt(publicKey))
    const extDataHash = getExtWithdrawArgsHash({ fee, recipient, relayer, encryptedAccount })

    const input = {
      apAmount: toBN(apAmount).add(toBN(fee)),
      aaveInterestAmount: toBN(aaveInterestAmount),
      extDataHash,

      inputApAmount: account.apAmount,
      inputAaveInterestAmount: account.aaveInterestAmount,
      inputSecret: account.secret,
      inputNullifier: account.nullifier,
      inputNullifierHash: account.nullifierHash,
      inputRoot: accountTreeUpdate.oldRoot,
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      inputPathElements: accountPath.pathElements,

      outputApAmount: newAccount.apAmount,
      outputAaveInterestAmount: newAccount.aaveInterestAmount,
      outputSecret: newAccount.secret,
      outputNullifier: newAccount.nullifier,
      outputRoot: accountTreeUpdate.newRoot,
      outputPathIndices: accountTreeUpdate.pathIndices,
      outputPathElements: accountTreeUpdate.pathElements,
      outputCommitment: newAccount.commitment,
    }

    const proofData = await websnarkUtils.genWitnessAndProve(
      this.groth16,
      input,
      this.provingKeys.withdrawCircuit,
      this.provingKeys.withdrawProvingKey,
    )
    const { proof } = websnarkUtils.toSolidityInput(proofData)

    const args = {
      apAmount: toHex(input.apAmount),
      aaveInterestAmount: toHex(input.aaveInterestAmount),
      extDataHash: toHex(input.extDataHash),
      extData: {
        fee: toHex(fee),
        recipient: toHex(recipient, 20),
        relayer: toHex(relayer, 20),
        encryptedAccount,
      },
      account: {
        inputRoot: toHex(input.inputRoot),
        inputNullifierHash: toHex(input.inputNullifierHash),
        outputRoot: toHex(input.outputRoot),
        outputPathIndices: toHex(input.outputPathIndices),
        outputCommitment: toHex(input.outputCommitment),
      },
    }

    return {
      proof,
      args,
      account: newAccount,
    }
  }

  async treeUpdate(commitment, accountTree = null) {
    if (!accountTree) {
      const accountCommitments = await this._fetchAccountCommitments()
      accountTree = new MerkleTree(this.merkleTreeHeight, accountCommitments, {
        hashFunction: poseidonHash2,
      })
    }
    const accountTreeUpdate = this._updateTree(accountTree, commitment)

    const input = {
      oldRoot: accountTreeUpdate.oldRoot,
      newRoot: accountTreeUpdate.newRoot,
      leaf: commitment,
      pathIndices: accountTreeUpdate.pathIndices,
      pathElements: accountTreeUpdate.pathElements,
    }

    const proofData = await websnarkUtils.genWitnessAndProve(
      this.groth16,
      input,
      this.provingKeys.treeUpdateCircuit,
      this.provingKeys.treeUpdateProvingKey,
    )
    const { proof } = websnarkUtils.toSolidityInput(proofData)

    const args = {
      oldRoot: toHex(input.oldRoot),
      newRoot: toHex(input.newRoot),
      leaf: toHex(input.leaf),
      pathIndices: toHex(input.pathIndices),
    }

    return {
      proof,
      args,
    }
  }
}

module.exports = Controller
