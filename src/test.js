/* global artifacts, web3, contract */
const { expect } = require('chai');
const { waffle, ethers } = require("hardhat");
const { BigNumber } = require('ethers')
const { deployContracts } = require('./execute')
const fs = require('fs')
const cli = require('./clitest');
const rootUpdaterEvents = require('../lib/root-updater/events')
const { updateTree } = require('../lib/root-updater/update')
const { action } = require('../lib/root-updater/utils')
//const { takeSnapshot, revertSnapshot, mineBlock } = require('../sacred-anonymity-mining/scripts/ganacheHelper')
const config = require('../sacred-token/config')
const Controller = require('../sacred-anonymity-mining/src/controller')
const Account = require('../sacred-anonymity-mining/src/account')
const Note = require('../sacred-anonymity-mining/src/note')
const addressTable = require('../address.json')
const { ensToAddr, updateAddressTable } = require('./utils')
const sacredProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const sacredTreesAbi = require('../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const sacredAbi = require('../sacred-token/artifacts/contracts/SACRED.sol/SACRED.json')
const rewardSwapAbi = require('../sacred-anonymity-mining/artifacts/contracts/RewardSwap.sol/RewardSwap.json')
const minerAbi = require('../sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const ethSacredAbi = require('../abi/ethSacred.json')
const MerkleTree = require('fixed-merkle-tree')
const buildGroth16 = require('websnark/src/groth16')
const {
  toFixedHex,
  poseidonHash,
  poseidonHash2,
  packEncryptedMessage,
  unpackEncryptedMessage,
  getExtWithdrawArgsHash,
} = require('../sacred-anonymity-mining/src/utils')
const { getEncryptionPublicKey } = require('eth-sig-util');
const { fromString } = require('../sacred-anonymity-mining/src/note');
const provingKeys = {
  rewardCircuit: require('../sacred-anonymity-mining/build/circuits/Reward.json'),
  withdrawCircuit: require('../sacred-anonymity-mining/build/circuits/Withdraw.json'),
  treeUpdateCircuit: require('../sacred-anonymity-mining/build/circuits/TreeUpdate.json'),
  rewardProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Reward_proving_key.bin').buffer,
  withdrawProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Withdraw_proving_key.bin').buffer,
  treeUpdateProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/TreeUpdate_proving_key.bin').buffer,
}

const { PRIVATE_KEY } = process.env

// Set time to beginning of a second
async function timeReset() {
  // const delay = 1000 - new Date().getMilliseconds()
  // await new Promise((resolve) => setTimeout(resolve, delay))
  // await mineBlock()
}

async function upateRoot(type) {
  const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(type)
  await updateTree(committedEvents, pendingEvents, type)
}

describe('Testing SacredAnanomityMining', () => {
  let miner
  let sacred
  let rewardSwap
  let sacredTrees
  let sacredProxy
  
  const RATE = BigNumber.from(10)
  const amount = BigNumber.from(15)
  // eslint-disable-next-line no-unused-vars
  //const sender = accounts[0]
  //const recipient = accounts[1]
  // eslint-disable-next-line no-unused-vars
  //const relayer = accounts[2]
  const levels = 20
  let snapshotId
  let controller
  //const privateKey = web3.eth.accounts.create().privateKey.slice(2)
  //const publicKey = getEncryptionPublicKey(privateKey)
  //const governance = accounts[9]
  let depositTree
  let withdrawalTree
  let wallet

  let noteString
  let depositBlockNum;
  let withdrawBlockNum;

  let note = new Note({
    instance: sacred,
    depositBlock: 10,
    withdrawalBlock: 10 + 4 * 60 * 24,
  })

  const privateKey = PRIVATE_KEY
  const publicKey = getEncryptionPublicKey(privateKey)

  before(async () => {
    await deployContracts();
    updateAddressTable(addressTable)
    
    const signers = await ethers.getSigners();
    owner = signers[0];

    const provider = ethers.provider
    const testing = ["hardhat", "localhost"].includes(hre.network.name);

    if (testing) {
      const accounts = await ethers.getSigners();
      wallet = accounts[0];
    } else {
      wallet = new ethers.Wallet(privateKey, provider)  
    }

    sacredTrees = new ethers.Contract(ensToAddr(config.sacredTrees.address), sacredTreesAbi.abi, wallet)
    sacredProxy = new ethers.Contract(ensToAddr(config.sacredProxy.address), sacredProxyAbi.abi, wallet)
    sacred = new ethers.Contract(ensToAddr(config.sacred.address), sacredAbi.abi, wallet)
    rewardSwap = new ethers.Contract(ensToAddr(config.rewardSwap.address), rewardSwapAbi.abi, wallet)
    miner = new ethers.Contract(ensToAddr(config.miningV2.address), minerAbi.abi, wallet)

    let sacredInstance = new ethers.Contract(ensToAddr('eth-01.sacredcash.eth'), ethSacredAbi, wallet)
    await cli.init({sender: owner.address, proxyContractObj: sacredProxy, instanceContractObj: sacredInstance});
    let groth16 = await buildGroth16()
    controller = new Controller({
      contract: miner,
      sacredTreesContract: sacredTrees,
      merkleTreeHeight: levels,
      provingKeys,
      groth16
    })
    await controller.init()
  })

  beforeEach(async () => {
    await timeReset()
  })

  describe('#constructor', () => {
    it('should initialize', async () => {
      const tokenFromContract = await rewardSwap.sacred()
      expect(tokenFromContract).to.equal(sacred.address)
      const rewardSwapFromContract = await miner.rewardSwap()
      expect(rewardSwapFromContract).to.equal(rewardSwap.address)
      const rateFromContract = await miner.rates(ensToAddr('eth-01.sacredcash.eth'))
      expect(rateFromContract).to.equal(BigNumber.from(RATE))
    })
  })

  describe('#Deposit And Withdraw', () => {
    it('should work', async () => {
      for(let i = 0; i < 0; i++) {
        let ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
        console.log('Before Deposit: User ETH balance is ', ethbalance);
        //Deposit
        const result = await cli.deposit({instance: addressTable['eth-01.sacredcash.eth'], currency:'eth', amount:0.1});
        noteString = result.noteString;
        depositBlockNum = result.blockNumber;
        console.log('Deposit block number is ', depositBlockNum);
        ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
        console.log('After Deposit: User ETH balance is ', ethbalance);
        //increase time
        const sevenDays = 7 * 24 * 60 * 60;
        await ethers.provider.send('evm_increaseTime', [sevenDays]);
        await ethers.provider.send('evm_mine');

        //Withdraw
        let data = cli.parseNote(noteString);
        withdrawBlockNum = await cli.withdraw({instance: addressTable['eth-01.sacredcash.eth'], deposit: data.deposit, currency: data.currency, amount:data.amount, recipient: owner.address, relayerURL: null });
        console.log('Withdraw block number is ', withdrawBlockNum);
        ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
        console.log('After Withdraw: User ETH balance is ', ethbalance);
      }
    })
  })

  // describe('#Withdraw', () => {
  //   it('should work', async () => {
  //     let ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
  //     console.log('Before Withdraw: User ETH balance is ', ethbalance);
  //     let data = cli.parseNote(noteString);
  //     withdrawBlockNum = await cli.withdraw({instance: addressTable['eth-01.sacredcash.eth'], deposit: data.deposit, currency: data.currency, amount:data.amount, recipient: owner.address, relayerURL: null });
  //     ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
  //     console.log('Withdraw block number is ', withdrawBlockNum);
  //     console.log('After Withdraw: User ETH balance is ', ethbalance);
  //   })
  // })

  describe('#reward', () => {
    it('should work', async () => {
      const zeroAccount = new Account()
      const accountCount = await miner.accountCount()
      //expect(zeroAccount.amount).to.equal(BigNumber.from(0))

      //###########################
      await upateRoot(action.DEPOSIT)
      await upateRoot(action.WITHDRAWAL)
      //###########################

      note = Note.fromString(noteString, addressTable['eth-01.sacredcash.eth'], depositBlockNum, withdrawBlockNum)
      const { proof, args, account } = await controller.reward({ account: zeroAccount, note, publicKey, fee:0, relayer:0})
      const tx = await (await miner['reward(bytes,(uint256,uint256,address,bytes32,bytes32,bytes32,bytes32,(address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](proof, args)).wait();
      console.log(tx)
      logs[0].event.should.be.equal('NewAccount')
      logs[0].args.commitment.should.be.equal(toFixedHex(account.commitment))
      logs[0].args.index.should.be.eq.BN(accountCount)

      logs[0].args.nullifier.should.be.equal(toFixedHex(zeroAccount.nullifierHash))

      const encryptedAccount = logs[0].args.encryptedAccount
      const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
      account.amount.should.be.eq.BN(account2.amount)
      account.secret.should.be.eq.BN(account2.secret)
      account.nullifier.should.be.eq.BN(account2.nullifier)
      account.commitment.should.be.eq.BN(account2.commitment)

      const accountCountAfter = await miner.accountCount()
      accountCountAfter.should.be.eq.BN(accountCount.add(BigNumber.from(1)))
      const rootAfter = await miner.getLastAccountRoot()
      rootAfter.should.be.equal(args.account.outputRoot)
      const rewardNullifierAfter = await miner.rewardNullifiers(toFixedHex(note.rewardNullifier))
      rewardNullifierAfter.should.be.true
      const accountNullifierAfter = await miner.accountNullifiers(toFixedHex(zeroAccount.nullifierHash))
      accountNullifierAfter.should.be.true

      account.amount.should.be.eq.BN(BigNumber.from(note.withdrawalBlock - note.depositBlock).mul(RATE))
    })
  })

  // describe('#withdraw', () => {
  //   let proof, args, account
  //   // prettier-ignore
  //   beforeEach(async () => {
  //     ({ proof, args, account } = await controller.reward({ account: new Account(), note, publicKey }))
  //     await miner.reward(proof, args)
  //   })

  //   it('should work', async () => {
  //     const accountNullifierBefore = await miner.accountNullifiers(toFixedHex(account.nullifierHash))
  //     accountNullifierBefore.should.be.false

  //     const accountCount = await miner.accountCount()
  //     const withdrawSnark = await controller.withdraw({ account, amount, recipient, publicKey })
  //     await timeReset()
  //     const expectedAmountInSacred = await rewardSwap.getExpectedReturn(amount)
  //     const balanceBefore = await sacred.balanceOf(recipient)
  //     const { logs } = await miner.withdraw(withdrawSnark.proof, withdrawSnark.args)
  //     const balanceAfter = await sacred.balanceOf(recipient)
  //     balanceAfter.should.be.eq.BN(balanceBefore.add(expectedAmountInSacred))

  //     const accountCountAfter = await miner.accountCount()
  //     accountCountAfter.should.be.eq.BN(accountCount.add(BigNumber.from(1)))
  //     const rootAfter = await miner.getLastAccountRoot()
  //     rootAfter.should.be.equal(withdrawSnark.args.account.outputRoot)
  //     const accountNullifierAfter = await miner.accountNullifiers(toFixedHex(account.nullifierHash))
  //     accountNullifierAfter.should.be.true

  //     logs[0].event.should.be.equal('NewAccount')
  //     logs[0].args.commitment.should.be.equal(toFixedHex(withdrawSnark.account.commitment))
  //     logs[0].args.index.should.be.eq.BN(accountCount)
  //     logs[0].args.nullifier.should.be.equal(toFixedHex(account.nullifierHash))

  //     const encryptedAccount = logs[0].args.encryptedAccount
  //     const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
  //     withdrawSnark.account.amount.should.be.eq.BN(account2.amount)
  //     withdrawSnark.account.secret.should.be.eq.BN(account2.secret)
  //     withdrawSnark.account.nullifier.should.be.eq.BN(account2.nullifier)
  //     withdrawSnark.account.commitment.should.be.eq.BN(account2.commitment)
  //   })
  // })

  // describe('#batchReward', () => {
  //   it('should work', async () => {
  //     let account = new Account()
  //     const claim = await controller.reward({ account, note, publicKey })
  //     await miner.reward(claim.proof, claim.args)

  //     const { proofs, args } = await controller.batchReward({
  //       account: claim.account,
  //       notes: notes.slice(1),
  //       publicKey,
  //     })
  //     await miner.batchReward(args)

  //     account = proofs.slice(-1)[0].account
  //     const amount = BigNumber.from(55)
  //     const rewardSnark = await controller.withdraw({ account, amount, recipient, publicKey })
  //     await timeReset()
  //     const balanceBefore = await sacred.balanceOf(recipient)
  //     const expectedAmountInSacred = await rewardSwap.getExpectedReturn(amount)
  //     await miner.withdraw(rewardSnark.proof, rewardSnark.args)
  //     const balanceAfter = await sacred.balanceOf(recipient)
  //     balanceAfter.should.be.eq.BN(balanceBefore.add(expectedAmountInSacred))
  //   })
  // })

  // describe('#isKnownAccountRoot', () => {
  //   it('should work', async () => {
  //     const claim1 = await controller.reward({ account: new Account(), note: note1, publicKey })
  //     await miner.reward(claim1.proof, claim1.args)

  //     const claim2 = await controller.reward({ account: new Account(), note: note2, publicKey })
  //     await miner.reward(claim2.proof, claim2.args)

  //     const tree = new MerkleTree(levels, [], { hashFunction: poseidonHash2 })
  //     await miner.isKnownAccountRoot(toFixedHex(tree.root()), 0).should.eventually.be.true

  //     tree.insert(claim1.account.commitment)
  //     await miner.isKnownAccountRoot(toFixedHex(tree.root()), 1).should.eventually.be.true

  //     tree.insert(claim2.account.commitment)
  //     await miner.isKnownAccountRoot(toFixedHex(tree.root()), 2).should.eventually.be.true

  //     await miner.isKnownAccountRoot(toFixedHex(tree.root()), 1).should.eventually.be.false
  //     await miner.isKnownAccountRoot(toFixedHex(tree.root()), 5).should.eventually.be.false
  //     await miner.isKnownAccountRoot(toFixedHex(1234), 1).should.eventually.be.false
  //     await miner.isKnownAccountRoot(toFixedHex(0), 0).should.eventually.be.false
  //     await miner.isKnownAccountRoot(toFixedHex(0), 5).should.eventually.be.false
  //   })
  // })

  // describe('#setRates', () => {
  //   it('should reject for invalid rates', async () => {
  //     const bigNum = BigNumber.from(2).pow(BigNumber.from(128))
  //     await miner
  //       .setRates([{ instance: sacred, value: bigNum.toString() }], { from: governance })
  //       .should.be.rejectedWith('Incorrect rate')
  //   })
  // })

  afterEach(async () => {
    //await revertSnapshot(snapshotId.result)
    // eslint-disable-next-line require-atomic-updates
    //snapshotId = await takeSnapshot()
  })
})