/* global artifacts, web3, contract */
const { expect } = require('chai');
const { waffle, ethers } = require("hardhat");
const { BigNumber } = require('ethers')
const { toBN } = require('web3-utils')
const { deployContracts } = require('./execute')
const fs = require('fs')
const rootUpdaterEvents = require('../lib/root-updater/events')
const { updateTree } = require('../lib/root-updater/update')
const { action } = require('../lib/root-updater/utils')
const config = require('../sacred-token/config')
const Controller = require('../sacred-anonymity-mining/src/controller')
const Account = require('../sacred-anonymity-mining/src/account')
const Note = require('../sacred-anonymity-mining/src/note')
const addressTable = require('../address.json')
const utils = require('./utils')
const sacredProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const sacredTreesAbi = require('../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const sacredAbi = require('../sacred-token/artifacts/contracts/SACRED.sol/SACRED.json')
const rewardSwapAbi = require('../sacred-anonymity-mining/artifacts/contracts/RewardSwap.sol/RewardSwap.json')
const minerAbi = require('../sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const ethSacredAbi = require('../abi/ethSacred.json')
const buildGroth16 = require('websnark/src/groth16')
const {
  toFixedHex,
  unpackEncryptedMessage
} = require('../sacred-anonymity-mining/src/utils')
const { getEncryptionPublicKey } = require('eth-sig-util');

const provingKeys = {
  rewardCircuit: require('../sacred-anonymity-mining/build/circuits/Reward.json'),
  withdrawCircuit: require('../sacred-anonymity-mining/build/circuits/Withdraw.json'),
  treeUpdateCircuit: require('../sacred-anonymity-mining/build/circuits/TreeUpdate.json'),
  rewardProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Reward_proving_key.bin').buffer,
  withdrawProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Withdraw_proving_key.bin').buffer,
  treeUpdateProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/TreeUpdate_proving_key.bin').buffer,
}

const { PRIVATE_KEY } = process.env

async function upateRoot(type) {
  const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(type)
  await updateTree(committedEvents, pendingEvents, type)
}

describe('Testing SacredAnanomityMining', () => {
  const RATE = BigNumber.from(10)
  const levels = 20

  let miner
  let sacred
  let rewardSwap
  let sacredTrees
  let sacredProxy
    
  let controller
  let wallet

  let noteString
  let depositBlockNum;
  let withdrawBlockNum;

  let proof, args, account

  const privateKey = PRIVATE_KEY
  const publicKey = getEncryptionPublicKey(privateKey)

  before(async () => {
    await deployContracts();
    utils.updateAddressTable(addressTable)
    
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

    sacredTrees = new ethers.Contract(utils.ensToAddr(config.sacredTrees.address), sacredTreesAbi.abi, wallet)
    sacredProxy = new ethers.Contract(utils.ensToAddr(config.sacredProxy.address), sacredProxyAbi.abi, wallet)
    sacred = new ethers.Contract(utils.ensToAddr(config.sacred.address), sacredAbi.abi, wallet)
    rewardSwap = new ethers.Contract(utils.ensToAddr(config.rewardSwap.address), rewardSwapAbi.abi, wallet)
    miner = new ethers.Contract(utils.ensToAddr(config.miningV2.address), minerAbi.abi, wallet)

    let sacredInstance = new ethers.Contract(utils.getSacredInstanceAddress(NET_ID, 'eth', 0.1), ethSacredAbi, wallet)
    await utils.init({sender: owner.address, proxyContractObj: sacredProxy, instanceContractObj: sacredInstance});
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

  describe('#constructor', () => {
    it('should initialize', async () => {
      const tokenFromContract = await rewardSwap.sacred()
      expect(tokenFromContract).to.equal(sacred.address)
      const rewardSwapFromContract = await miner.rewardSwap()
      expect(rewardSwapFromContract).to.equal(rewardSwap.address)
      const rateFromContract = await miner.rates(utils.getSacredInstanceAddress(NET_ID, 'eth', 0.1))
      expect(rateFromContract).to.equal(BigNumber.from(RATE))
    })
  })

  describe('#Deposit And Withdraw', () => {
    it('should work', async () => {
      for(let i = 0; i < 0; i++) {
        let ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
        console.log('Before Deposit: User ETH balance is ', ethbalance);
        //Deposit
        const result = await utils.deposit({netId: NET_ID, currency:'eth', amount:0.1});
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
        let data = utils.parseNote(noteString);
        withdrawBlockNum = await utils.withdraw({netId: NET_ID, deposit: data.deposit, currency: data.currency, amount:data.amount, recipient: owner.address, relayerURL: null });
        console.log('Withdraw block number is ', withdrawBlockNum);
        ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
        console.log('After Withdraw: User ETH balance is ', ethbalance);
      }
    })
  })

  describe('#Update Root of SacredTree', () => {
    it('should work', async () => {
      await upateRoot(action.DEPOSIT)
      await upateRoot(action.WITHDRAWAL)
    }).timeout(3000000);
  })

  describe('#reward', () => {
    it('should work', async () => {
      const zeroAccount = new Account()
      const accountCount = await miner.accountCount()
      expect(zeroAccount.amount.toString()).to.equal("0")

      depositBlockNum = 29123355
      withdrawBlockNum = 29123383
      noteString = "sacred-eth-0.1-42-0xe54ce0efdc2c21c52967457acb8c8d2adc5b76a6b66ea6388675b776a1728d6dd237e671315002d5617b753f220e2e644b7bdd6e87ad0595a7786fc82663"
      const note = Note.fromString(noteString, utils.getSacredInstanceAddress(NET_ID, 'eth', 0.1), depositBlockNum, withdrawBlockNum)

      const eventsDeposit = await rootUpdaterEvents.getEvents(action.DEPOSIT)
      const eventsWithdraw = await rootUpdaterEvents.getEvents(action.WITHDRAWAL)
      const result = await controller.reward({ account: zeroAccount, note, publicKey, fee:0, relayer:0, accountCommitments: null, depositDataEvents: eventsDeposit.committedEvents, withdrawalDataEvents: eventsWithdraw.committedEvents})
      proof = result.proof
      args = result.args
      account = result.account
      const tx = await (await miner['reward(bytes,(uint256,uint256,address,bytes32,bytes32,bytes32,bytes32,(address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](proof, args)).wait();

      const newAccountEvent = tx.events.find(item => item.event === 'NewAccount')

      expect(newAccountEvent.event).to.equal('NewAccount')
      expect(newAccountEvent.args.commitment).to.equal(toFixedHex(account.commitment))
      expect(newAccountEvent.args.index).to.equal(accountCount)
      expect(newAccountEvent.args.nullifier).to.equal(toFixedHex(zeroAccount.nullifierHash))

      const encryptedAccount = newAccountEvent.args.encryptedAccount
      const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
      expect(account.amount.toString()).to.equal(account2.amount.toString())
      expect(account.secret.toString()).to.equal(account2.secret.toString())
      expect(account.nullifier.toString()).to.equal(account2.nullifier.toString())
      expect(account.commitment.toString()).to.equal(account2.commitment.toString())

      const accountCountAfter = await miner.accountCount()
      expect(accountCountAfter).to.equal(accountCount.add(BigNumber.from(1)))
      const rootAfter = await miner.getLastAccountRoot()
      expect(rootAfter).to.equal(args.account.outputRoot)
      const rewardNullifierAfter = await miner.rewardNullifiers(toFixedHex(note.rewardNullifier))
      expect(rewardNullifierAfter).to.equal(true)
      const accountNullifierAfter = await miner.accountNullifiers(toFixedHex(zeroAccount.nullifierHash))
      expect(accountNullifierAfter).to.equal(true)

      expect(account.amount.toString()).to.equal(BigNumber.from(note.withdrawalBlock - note.depositBlock).mul(RATE).toString())

    }).timeout(3000000);
  })

  describe('#withdraw', () => {
    it('should work', async () => {
      const accountNullifierBefore = await miner.accountNullifiers(toFixedHex(account.nullifierHash))
      expect(accountNullifierBefore).to.equal(false)

      const recipient = owner.address
      const amount = account.amount
      const withdrawSnark = await controller.withdraw({ account, amount, recipient, publicKey })
      const balanceBefore = await sacred.balanceOf(recipient)
      const tx = await (await miner['withdraw(bytes,(uint256,bytes32,(uint256,address,address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](withdrawSnark.proof, withdrawSnark.args)).wait()
      const balanceAfter = await sacred.balanceOf(recipient)
      const increasedBalance = balanceAfter.sub(balanceBefore)
      expect(increasedBalance.gt(0)).to.equal(true)
      const newAccountEvent = tx.events.find(item => item.event === 'NewAccount')
      expect(newAccountEvent.event).to.equal('NewAccount')
      expect(newAccountEvent.args.commitment).to.equal(toFixedHex(withdrawSnark.account.commitment))
      expect(newAccountEvent.args.nullifier).to.equal(toFixedHex(account.nullifierHash))
      const encryptedAccount = newAccountEvent.args.encryptedAccount
      const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
      expect(withdrawSnark.account.amount.toString()).to.equal(account2.amount.toString())
      expect(withdrawSnark.account.secret.toString()).to.equal(account2.secret.toString())
      expect(withdrawSnark.account.nullifier.toString()).to.equal(account2.nullifier.toString())
      expect(withdrawSnark.account.commitment.toString()).to.equal(account2.commitment.toString())
    })
  })

})