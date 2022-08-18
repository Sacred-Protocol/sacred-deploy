require('dotenv').config()
const MerkleTree = require('fixed-merkle-tree')
const { action} = require('./utils')
const {poseidonHash, poseidonHash2, toHex} = require('../../sacred-contracts-eth/lib/baseUtils')
const treeCli = require('../../sacred-trees/src/index');

const { SMALL_BATCH_SIZE_ROOT_UPDATE } = process.env
const INSERT_BATCH_SIZE = parseInt(SMALL_BATCH_SIZE_ROOT_UPDATE) ? 2 : 256 //it should match with nLeaves in BatchTreeUpdate.circon

async function updateTree(sacredTrees, committedEvents, pendingEvents, type) {
  const leaves = committedEvents.map((e) => poseidonHash([e.instance, e.hash, e.block]))
  const tree = new MerkleTree(20, leaves, { hashFunction: poseidonHash2 })
  const rootMethod = type === action.DEPOSIT ? 'depositRoot' : 'withdrawalRoot'
  const rootOrigin = await sacredTrees[rootMethod]()
  const root = toHex(rootOrigin)
  if (BigInt(root) != tree.root()) {
     throw new Error(`Invalid ${type} root! Contract: ${root}, local: ${toHex(tree.root())}`)
  }
  while (pendingEvents.length >= INSERT_BATCH_SIZE) {
    const chunk = pendingEvents.splice(0, INSERT_BATCH_SIZE)
    console.log('Generating snark proof')
    const { input, args } = treeCli.batchTreeUpdate(tree, chunk)
    const basePath = INSERT_BATCH_SIZE === 256 ? './sacred-trees-snarks/BatchTreeUpdate' : './sacred-trees-snarks-light/BatchTreeUpdate'
    const proof = await treeCli.prove(input, basePath)

    console.log('Sending update tx')
    const method = type === action.DEPOSIT ? 'updateDepositTree' : 'updateWithdrawalTree'
    await sacredTrees[method](proof, ...args)
    // const txData = await sacredTrees.populateTransaction[method](proof, ...args)
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
