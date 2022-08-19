const {
  getExtRewardArgsHash,
  getExtWithdrawArgsHash,
  packEncryptedMessage,
  RewardArgs,
} = require('./utils')

const {poseidonHash, poseidonHash2, bitsToNumber, toHex} = require('../../sacred-contracts-eth/lib/baseUtils')

const Account = require('./account')
const MerkleTree = require('fixed-merkle-tree')
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
  constructor({ minerContract, sacredTreesContract, merkleTreeHeight, provingKeys, utils }) {
    this.merkleTreeHeight = Number(merkleTreeHeight)
    this.provingKeys = provingKeys
    this.minerContract = minerContract
    this.sacredTreesContract = sacredTreesContract
    this.utils = utils
  }

  async init(rpc) {
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
      .map((e) => BigInt(e.returnValues.commitment))
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
      pathIndices,
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
    const currencyIndex = Account.getCurrencyIndex(note.currency)
    const apAmount = BigInt(rate).mul(note.withdrawalBlock.sub(note.depositBlock))
    const tx = await (await this.minerContract.getAaveInterestsAmount(currencyIndex, toHex(note.rewardNullifier), toHex(apAmount))).wait();
    const amountEvent = tx.events.find(item => item.event === 'AaveInterestsAmount')
    let aaveInterestAmount = BigInt(amountEvent.args.amount.toString());
    
    let apAmounts = account.getApAmountList()
    let aaveInterestAmounts = account.getAaveInterestList()
    apAmounts[currencyIndex] = apAmounts[currencyIndex].add(apAmount.sub(BigInt(fee)));
    aaveInterestAmounts[currencyIndex] = aaveInterestAmounts[currencyIndex].add(aaveInterestAmount);
    const newAccount = new Account({ apAmounts, aaveInterestAmounts })

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

    const accountIndex = accountTree.indexOf(account.commitment, (a, b) => BigInt(a) === BigInt(b))
    const accountPath = accountIndex !== -1 ? accountTree.path(accountIndex) : zeroAccount
    const accountTreeUpdate = this._updateTree(accountTree, newAccount.commitment)
    const encryptedAccount = packEncryptedMessage(newAccount.encrypt(publicKey))
    const extDataHash = getExtRewardArgsHash({ relayer, encryptedAccount })
    const input = {
      /*Public*/
      rate: toHex(rate),
      fee: toHex(fee),
      instance: toHex(note.instance),
      apAmount: toHex(apAmount),
      aaveInterestAmount: toHex(aaveInterestAmount),
      rewardNullifier: toHex(note.rewardNullifier),
      extDataHash: toHex(extDataHash),
      currencyIndex: toHex(currencyIndex),
      inputRoot: toHex(accountTreeUpdate.oldRoot),
      inputNullifierHash: toHex(account.nullifierHash),
      outputRoot: toHex(accountTreeUpdate.newRoot),
      outputPathIndices: bitsToNumber(accountTreeUpdate.pathIndices),
      outputCommitment: toHex(newAccount.commitment),
      depositRoot: toHex(depositTree.root()),
      withdrawalRoot: toHex(withdrawalTree.root()),
      /*Private*/
      noteSecret: toHex(note.secret),
      noteNullifier: toHex(note.nullifier),
      noteNullifierHash: toHex(note.nullifierHash),
      inputApAmounts: account.getApAmountList(),
      inputAaveInterestAmounts: account.getAaveInterestList(),
      inputSecret: toHex(account.secret),
      inputNullifier: toHex(account.nullifier),
      inputPathElements: accountPath.pathElements.map(item => toHex(item)),
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      outputApAmounts: newAccount.getApAmountList(),
      outputAaveInterestAmounts: newAccount.getAaveInterestList(),
      outputSecret: toHex(newAccount.secret),
      outputNullifier: toHex(newAccount.nullifier),
      outputPathElements: accountTreeUpdate.pathElements.map(item => toHex(item)),
      depositBlock: toHex(note.depositBlock),
      depositPathIndices: bitsToNumber(depositPath.pathIndices),
      depositPathElements: depositPath.pathElements.map(item => toHex(item)),
      withdrawalBlock: toHex(note.withdrawalBlock),
      withdrawalPathIndices: bitsToNumber(withdrawalPath.pathIndices),
      withdrawalPathElements: withdrawalPath.pathElements.map(item => toHex(item)),
    }

    console.log('Generating SNARK proof')
    const {a, b, c} = await this.utils.generateGroth16Proof(input, this.provingKeys.rewardWasmPath, this.provingKeys.rewardZkeyFilePath);
    console.log('Submitting reward transaction')

    const args = {
      rate: input.rate,
      fee: input.fee,
      instance: toHex(input.instance, 20),
      apAmount: input.apAmount,
      aaveInterestAmount: input.aaveInterestAmount,
      rewardNullifier: input.rewardNullifier,
      extDataHash: input.extDataHash,
      currencyIndex: input.currencyIndex,
      depositRoot: input.depositRoot,
      withdrawalRoot: input.withdrawalRoot,
      extData: {
        relayer: toHex(relayer, 20),
        encryptedAccount,
      },
      account: {
        inputRoot: input.inputRoot,
        inputNullifierHash: input.inputNullifierHash,
        outputRoot: input.outputRoot,
        outputPathIndices: input.outputPathIndices,
        outputCommitment: input.outputCommitment,
      },
    }

    return {
      a,b,c,
      args,
      account: newAccount,
    }
  }

  async withdraw({ currency, account, apAmount, aaveInterestAmount, recipient, publicKey, fee = 0, relayer = 0, accountCommitments = null }) {
    const instance = this.utils.getSacredInstanceAddress(this.utils.getNetId(), currency, amount)
    const currencyIndex = Account.getCurrencyIndex(currency)
    let apAmounts = account.getApAmountList()
    let aaveInterestAmounts = account.getAaveInterestList()
    apAmounts[currencyIndex] = apAmounts[currencyIndex].sub(apAmount.sub(BigInt(fee)));
    aaveInterestAmounts[currencyIndex] = aaveInterestAmounts[currencyIndex].sub(aaveInterestAmount);
    const newAccount = new Account({ apAmounts, aaveInterestAmounts })
    accountCommitments = accountCommitments || (await this._fetchAccountCommitments())
    const accountTree = new MerkleTree(this.merkleTreeHeight, accountCommitments, {
      hashFunction: poseidonHash2,
    })
    const accountIndex = accountTree.indexOf(account.commitment, (a, b) => BigInt(a).eq(BigInt(b)))
    if (accountIndex === -1) {
      throw new Error('The accounts tree does not contain such account commitment')
    }
    const accountPath = accountTree.path(accountIndex)
    const accountTreeUpdate = this._updateTree(accountTree, newAccount.commitment)

    const encryptedAccount = packEncryptedMessage(newAccount.encrypt(publicKey))
    const extDataHash = getExtWithdrawArgsHash({ fee, recipient, relayer, encryptedAccount })

    const input = {
      // public
      apAmount: tohex(BigInt(apAmount).add(BigInt(fee))),
      aaveInterestAmount: toHex(aaveInterestAmount),
      extDataHash: toHex(extDataHash),
      currencyIndex: toHex(currencyIndex),
      inputRoot: toHex(accountTreeUpdate.oldRoot),
      outputRoot: toHex(accountTreeUpdate.newRoot),
      inputNullifierHash: toHex(account.nullifierHash),
      outputPathIndices: bitsToNumber(accountTreeUpdate.pathIndices),
      outputCommitment: toHex(newAccount.commitment),
      // private
      inputApAmounts: account.getApAmountList(),
      inputAaveInterestAmounts: account.getAaveInterestList(),
      inputSecret: toHex(account.secret),
      inputNullifier: toHex(account.nullifier),
      inputPathIndices: bitsToNumber(accountPath.pathIndices),
      inputPathElements: accountPath.pathElements.map(item => toHex(item)),
      outputApAmounts: newAccount.getApAmountList(),
      outputAaveInterestAmounts: newAccount.getAaveInterestList(),
      outputSecret: toHex(newAccount.secret),
      outputNullifier: toHex(newAccount.nullifier),
      outputPathElements: accountTreeUpdate.pathElements.map(item => toHex(item)),
    }

    console.log('Generating SNARK proof')
    const {a, b, c} = await this.utils.generateGroth16Proof(input, this.provingKeys.withdrawWasmPath, this.provingKeys.withdrawZkeyFilePath);
    console.log('Submitting reward withdrawal transaction')

    const args = {
      instance: toHex(instance),
      apAmount: input.apAmount,
      aaveInterestAmount: input.aaveInterestAmount,
      extDataHash: input.extDataHash,
      extData: {
        fee: toHex(fee),
        recipient: toHex(recipient, 20),
        relayer: toHex(relayer, 20),
        encryptedAccount,
      },
      account: {
        inputRoot: input.inputRoot,
        inputNullifierHash: input.inputNullifierHash,
        outputRoot: input.outputRoot,
        outputPathIndices: input.outputPathIndices,
        outputCommitment: input.outputCommitment,
      },
    }

    return {
      a, b, c,
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
      oldRoot: toHex(accountTreeUpdate.oldRoot),
      newRoot: toHex(accountTreeUpdate.newRoot),
      leaf: toHex(commitment),
      pathIndices: bitsToNumber(accountTreeUpdate.pathIndices),
      pathElements: accountTreeUpdate.pathElements,
    }

    const {a, b, c} = await this.utils.generateGroth16Proof(input, this.provingKeys.treeUpdateWasmPath, this.provingKeys.treeUpdateZkeyFilePath);
    const args = {
      oldRoot: input.oldRoot,
      newRoot: input.newRoot,
      leaf: input.leaf,
      pathIndices: input.pathIndices,
    }

    return {
      a, b, c,
      args,
    }
  }
}

module.exports = Controller
