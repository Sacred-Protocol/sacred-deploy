require('dotenv').config()
const { getSacredTrees } = require('./singletons')
const { action, getExplorer, poseidonHash, poseidonHash2, toFixedHex } = require('./utils')
const ethers = require('ethers')
const BigNumber = ethers.BigNumber
const treeCli = require('../../sacred-trees/src/index');
const MerkleTree = require('fixed-merkle-tree')

const INSERT_BATCH_SIZE = 256 //it should match with nLeaves in BatchTreeUpdate.circon

async function updateTree(committedEvents, pendingEvents, type) {
  const leaves = committedEvents.map((e) => poseidonHash([e.instance, e.hash, e.block]))
  const tree = new MerkleTree(20, leaves, { hashFunction: poseidonHash2 })
  const rootMethod = type === action.DEPOSIT ? 'depositRoot' : 'withdrawalRoot'
  const sacredTrees = await getSacredTrees()
  const rootOrigin = await sacredTrees[rootMethod]()
  const root = toFixedHex(rootOrigin)
  if (!BigNumber.from(root).eq(tree.root())) {
     throw new Error(`Invalid ${type} root! Contract: ${BigNumber.from(root).toHexString()}, local: ${tree.root().toHexString()}`)
  }
  while (pendingEvents.length >= INSERT_BATCH_SIZE) {
    const chunk = pendingEvents.splice(0, INSERT_BATCH_SIZE)

    console.log('Generating snark proof')
    const { input, args } = treeCli.batchTreeUpdate(tree, chunk)
    const proof = await treeCli.prove(input, './sacred-trees-snarks/BatchTreeUpdate')

    console.log('Sending update tx')
    const method = type === action.DEPOSIT ? 'updateDepositTree' : 'updateWithdrawalTree'
    await sacredTrees[method](proof, ...args)
    // const txData = await getSacredTrees().populateTransaction[method](proof, ...args)
    // const tx = txManager.createTx(txData)

    // const receiptPromise = tx
    //   .send()
    //   .on('transactionHash', (hash) => console.log(`Transaction: ${getExplorer(netId)}/tx/${hash}`))
    //   .on('mined', (receipt) => console.log('Mined in block', receipt.blockNumber))
    //   .on('confirmations', (n) => console.log(`Got ${n} confirmations`))

    // await receiptPromise // todo optional
  }
}

module.exports = {
  updateTree,
}
