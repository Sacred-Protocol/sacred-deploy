/* global ethers */
const { expect } = require('chai')
const { toFixedHex, poseidonHash2, randomBN } = require('../src/utils')
const MerkleTree = require('fixed-merkle-tree')
const controller = require('../src/index')

async function register(note, sacredTrees, from) {
  await sacredTrees
    .connect(from)
    .register(
      note.instance,
      toFixedHex(note.commitment),
      toFixedHex(note.nullifierHash),
      note.depositBlock,
      note.withdrawalBlock,
    )
}

const levels = 20
const CHUNK_TREE_HEIGHT = 1

const instances = [
  '0x1111000000000000000000000000000000001111',
  '0x2222000000000000000000000000000000002222',
  '0x3333000000000000000000000000000000003333',
  '0x4444000000000000000000000000000000004444',
]

const blocks = ['0xaaaaaaaa', '0xbbbbbbbb', '0xcccccccc', '0xdddddddd']

describe('SacredTrees', function () {
  let tree
  let operator
  let sacredProxy
  let verifier
  let sacredTrees
  let sacredTreesV1
  let notes
  let depositDataEventFilter
  const depositEvents = []
  const withdrawalEvents = []

  beforeEach(async function () {
    tree = new MerkleTree(levels, [], { hashFunction: poseidonHash2 })
    ;[operator, sacredProxy] = await ethers.getSigners()

    const BatchTreeUpdateVerifier = await ethers.getContractFactory('BatchTreeUpdateVerifier')
    verifier = await BatchTreeUpdateVerifier.deploy()

    const SacredTreesV1 = await ethers.getContractFactory('SacredTreesV1Mock')
    sacredTreesV1 = await SacredTreesV1.deploy(0, 0, tree.root(), tree.root())
    notes = []
    for (let i = 0; i < 2 ** CHUNK_TREE_HEIGHT; i++) {
      notes[i] = {
        instance: instances[i % instances.length],
        depositBlock: blocks[i % blocks.length],
        withdrawalBlock: 2 + i + i * 4 * 60 * 24,
        commitment: randomBN(),
        nullifierHash: randomBN(),
      }
      await register(notes[i], sacredTreesV1, sacredProxy)
      depositEvents[i] = {
        hash: toFixedHex(notes[i].commitment),
        instance: toFixedHex(notes[i].instance, 20),
        block: toFixedHex(notes[i].depositBlock, 4),
      }
      withdrawalEvents[i] = {
        hash: toFixedHex(notes[i].nullifierHash),
        instance: toFixedHex(notes[i].instance, 20),
        block: toFixedHex(notes[i].withdrawalBlock, 4),
      }
    }
    const SacredTrees = await ethers.getContractFactory('SacredTreesMock')
    sacredTrees = await SacredTrees.deploy(operator.address, sacredTreesV1.address, {
      depositsFrom: 1,
      depositsStep: 1,
      withdrawalsFrom: 2,
      withdrawalsStep: 2,
    })
    await sacredTrees.initialize(sacredProxy.address, verifier.address)
    depositDataEventFilter = sacredTrees.filters.DepositData()
  })

  describe('#updateDepositTree', () => {
    it('should check hash', async () => {
      const { args } = controller.batchTreeUpdate(tree, depositEvents)
      const solHash = await sacredTrees.updateDepositTreeMock(...args.slice(1))
      expect(solHash).to.be.equal(args[0])
    })

    it('should prove snark', async () => {
      const { input, args } = controller.batchTreeUpdate(tree, depositEvents)
      const proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await sacredTrees.updateDepositTree(proof, ...args)

      const updatedRoot = await sacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())
    })

    it('should work for non-empty tree', async () => {
      let { input, args } = controller.batchTreeUpdate(tree, depositEvents)
      let proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await sacredTrees.updateDepositTree(proof, ...args)
      let updatedRoot = await sacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())
      //
      for (let i = 0; i < notes.length; i++) {
        await register(notes[i], sacredTrees, sacredProxy)
      }
      ;({ input, args } = controller.batchTreeUpdate(tree, depositEvents))
      proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await sacredTrees.updateDepositTree(proof, ...args)
      updatedRoot = await sacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())
    })

    it('should work with events from contracts', async () => {
      let { input, args } = controller.batchTreeUpdate(tree, depositEvents)
      let proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await sacredTrees.updateDepositTree(proof, ...args)
      let updatedRoot = await sacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())

      const migratedEvents = await sacredTrees.queryFilter(depositDataEventFilter)
      migratedEvents.forEach((e, i) => {
        expect(e.args.index).to.be.equal(i)
      })
      //
      for (let i = 0; i < notes.length; i++) {
        await register(notes[i], sacredTrees, sacredProxy)
      }
      let registeredEvents = await sacredTrees.queryFilter(depositDataEventFilter)
      registeredEvents = registeredEvents.map((e) => ({
        hash: toFixedHex(e.args.hash),
        instance: toFixedHex(e.args.instance, 20),
        block: toFixedHex(e.args.block, 4),
      }))
      ;({ input, args } = controller.batchTreeUpdate(tree, registeredEvents.slice(0, notes.length)))
      proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await sacredTrees.updateDepositTree(proof, ...args)
      updatedRoot = await sacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())
    })
    it('should work for batch+N filled v1 tree', async () => {
      const batchSize = 2 ** CHUNK_TREE_HEIGHT
      for (let i = batchSize; i < batchSize + 2; i++) {
        notes.push({
          instance: instances[i % instances.length],
          depositBlock: blocks[i % blocks.length],
          withdrawalBlock: 2 + i + i * 4 * 60 * 24,
          commitment: randomBN(),
          nullifierHash: randomBN(),
        })
        await register(notes[i], sacredTreesV1, sacredProxy)
      }

      const SacredTrees = await ethers.getContractFactory('SacredTreesMock')
      const newSacredTrees = await SacredTrees.deploy(operator.address, sacredTreesV1.address, {
        depositsFrom: 1,
        depositsStep: 1,
        withdrawalsFrom: 2,
        withdrawalsStep: 2,
      })
      await newSacredTrees.initialize(sacredProxy.address, verifier.address)

      // load first batchSize deposits
      let { input, args } = controller.batchTreeUpdate(tree, depositEvents)
      let proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await newSacredTrees.updateDepositTree(proof, ...args)
      let updatedRoot = await newSacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())

      // register 2 * `notes.length` new deposits on the new trees
      for (let i = 0; i < notes.length; i++) {
        await register(notes[i], newSacredTrees, sacredProxy)
      }
      for (let i = 0; i < notes.length; i++) {
        await register(notes[i], newSacredTrees, sacredProxy)
      }

      // get 2 extra events from v1 tress
      let events = notes.slice(batchSize).map((note) => ({
        hash: toFixedHex(note.commitment),
        instance: toFixedHex(note.instance, 20),
        block: toFixedHex(note.depositBlock, 4),
      }))

      let registeredEvents = await newSacredTrees.queryFilter(depositDataEventFilter)
      registeredEvents = registeredEvents.slice(batchSize) // cut processed deposits from v1
      events = events.concat(
        registeredEvents.slice(0, batchSize - 2).map((e) => ({
          hash: toFixedHex(e.args.hash),
          instance: toFixedHex(e.args.instance, 20),
          block: toFixedHex(e.args.block, 4),
        })),
      )
      //
      ;({ input, args } = controller.batchTreeUpdate(tree, events))
      proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await newSacredTrees.updateDepositTree(proof, ...args)
      updatedRoot = await newSacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())

      events = registeredEvents.slice(batchSize - 2, 2 * batchSize - 2).map((e) => ({
        hash: toFixedHex(e.args.hash),
        instance: toFixedHex(e.args.instance, 20),
        block: toFixedHex(e.args.block, 4),
      }))
      ;({ input, args } = controller.batchTreeUpdate(tree, events))
      proof = await controller.prove(input, './artifacts/circuits/BatchTreeUpdate')
      await newSacredTrees.updateDepositTree(proof, ...args)
      updatedRoot = await newSacredTrees.depositRoot()
      expect(updatedRoot).to.be.equal(tree.root())
    })
    it('should reject for partially filled tree')
    it('should reject for outdated deposit root')
    it('should reject for incorrect insert index')
    it('should reject for overflows of newRoot')
    it('should reject for invalid sha256 args')
  })

  describe('#getRegisteredDeposits', () => {
    it('should work', async () => {
      for (let i = 0; i < 2 ** CHUNK_TREE_HEIGHT; i++) {
        notes[i] = {
          instance: instances[i % instances.length],
          depositBlock: blocks[i % blocks.length],
          withdrawalBlock: 2 + i + i * 4 * 60 * 24,
          commitment: randomBN(),
          nullifierHash: randomBN(),
        }
        await register(notes[i], sacredTrees, sacredProxy)
      }

      const abi = new ethers.utils.AbiCoder()
      const count = await sacredTrees.depositsLength()
      const _deposits = await sacredTrees.getRegisteredDeposits()
      expect(count).to.be.equal(notes.length * 2)
      _deposits.forEach((hash, i) => {
        if (i < notes.length) {
          expect(hash).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000')
        } else {
          const index = i - notes.length
          const encodedData = abi.encode(
            ['address', 'bytes32', 'uint256'],
            [notes[index].instance, toFixedHex(notes[index].commitment), notes[index].depositBlock],
          )
          const leaf = ethers.utils.keccak256(encodedData)

          expect(leaf).to.be.equal(hash)
        }
      })
      // res.length.should.be.equal(1)
      // res[0].should.be.true
      // await sacredTrees.updateRoots([note1DepositLeaf], [])

      // res = await sacredTrees.getRegisteredDeposits()
      // res.length.should.be.equal(0)

      // await registerDeposit(note2, sacredTrees)
      // res = await sacredTrees.getRegisteredDeposits()
      // // res[0].should.be.true
    })
  })

  describe('#getRegisteredWithdrawals', () => {
    it('should work', async () => {
      for (let i = 0; i < 2 ** CHUNK_TREE_HEIGHT; i++) {
        notes[i] = {
          instance: instances[i % instances.length],
          depositBlock: blocks[i % blocks.length],
          withdrawalBlock: 2 + i + i * 4 * 60 * 24,
          commitment: randomBN(),
          nullifierHash: randomBN(),
        }
        await register(notes[i], sacredTrees, sacredProxy)
      }

      const abi = new ethers.utils.AbiCoder()
      const count = await sacredTrees.withdrawalsLength()
      const _withdrawals = await sacredTrees.getRegisteredWithdrawals()
      expect(count).to.be.equal(notes.length * 2)
      _withdrawals.forEach((hash, i) => {
        if (i < notes.length) {
          expect(hash).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000')
        } else {
          const index = i - notes.length
          const encodedData = abi.encode(
            ['address', 'bytes32', 'uint256'],
            [notes[index].instance, toFixedHex(notes[index].nullifierHash), notes[index].withdrawalBlock],
          )
          const leaf = ethers.utils.keccak256(encodedData)

          expect(leaf).to.be.equal(hash)
        }
      })
    })
  })
})
