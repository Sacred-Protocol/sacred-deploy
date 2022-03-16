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
const erc20Abi = require('../abi/erc20.abi.json')
const buildGroth16 = require('websnark/src/groth16')
const {
  toFixedHex,
  unpackEncryptedMessage
} = require('../sacred-anonymity-mining/src/utils')
const { getEncryptionPublicKey } = require('eth-sig-util');
const exp = require('constants');

const provingKeys = {
  rewardCircuit: require('../sacred-anonymity-mining/build/circuits/Reward.json'),
  withdrawCircuit: require('../sacred-anonymity-mining/build/circuits/Withdraw.json'),
  treeUpdateCircuit: require('../sacred-anonymity-mining/build/circuits/TreeUpdate.json'),
  rewardProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Reward_proving_key.bin').buffer,
  withdrawProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Withdraw_proving_key.bin').buffer,
  treeUpdateProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/TreeUpdate_proving_key.bin').buffer,
}

const { PRIVATE_KEY, NET_ID, WETH_TOKEN } = process.env

async function upateRoot(type) {
  const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(type)
  await updateTree(committedEvents, pendingEvents, type)
}

async function getBlockNumbers(type, noteString) {
  const events = await rootUpdaterEvents.getSacredTreesEvents(type, 0, 'latest')
  const { currency, amount, netId, deposit } = utils.parseNote(noteString)
  const note = Note.fromString(noteString, utils.getSacredInstanceAddress(netId, currency, amount), 0, 0)
  const item = events.find(function(x) {
    if(type === action.WITHDRAWAL) {
      return x.hash === toFixedHex(note.nullifierHash)
    } else if(type === action.DEPOSIT){
      return x.hash === toFixedHex(note.commitment)
    } else {
      return false
    }
  })
  let blockNum = -1
  if(item) {
    blockNum = item.block
  }
  return blockNum
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
      minerContract: miner,
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
        // //increase time
        // const sevenDays = 7 * 24 * 60 * 60;
        // await ethers.provider.send('evm_increaseTime', [sevenDays]);
        // await ethers.provider.send('evm_mine');

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
      //await upateRoot(action.DEPOSIT)
      //await upateRoot(action.WITHDRAWAL)
    }).timeout(3000000);
  })

  describe('#reward', () => {
    it('should work', async () => {
      const zeroAccount = new Account()
      const accountCount = await miner.accountCount()
      expect(zeroAccount.apAmount.toString()).to.equal("0")

      //noteString = "sacred-eth-0.1-4-0x24bbf35ba15cc02afdc461f6099fe3db878835c1b9381a13f0979a601f9be2da1fb1830ae947378fe6c4bd4fb64115e690661b4fdb23f4d6043aa83a785f" deposit only
      noteString = "sacred-eth-0.1-4-0xfda502c179c6fa4ad6a28d6176be1f1966707920498371539f29a01eb294c92b93eb49767958e4fc07d08aad439b9cce63d924616701e23f71c8b287e86e"
      depositBlockNum = await getBlockNumbers(action.DEPOSIT, noteString)
      withdrawBlockNum = await getBlockNumbers(action.WITHDRAWAL, noteString)
      console.log("depositBlockNumber:", depositBlockNum)
      console.log("withdrawBlockNumber:", withdrawBlockNum)
      const note = Note.fromString(noteString, utils.getSacredInstanceAddress(NET_ID, 'eth', 0.1), depositBlockNum, withdrawBlockNum)
      const shareTracks = await miner.shareTrack()
      const totalShares = await miner.totalShareSnapshots(toFixedHex(note.rewardNullifier), 0)
      const interests = await miner.totalShareSnapshots(toFixedHex(note.rewardNullifier), 1)
      expect(totalShares.gt(BigNumber.from(0))).to.equal(true)
      expect(interests.gt(BigNumber.from(0))).to.equal(true)
      expect(shareTracks.totalShares.gte(totalShares)).to.equal(true)
      const eventsDeposit = await rootUpdaterEvents.getEvents(action.DEPOSIT)
      const eventsWithdraw = await rootUpdaterEvents.getEvents(action.WITHDRAWAL)
      const result = await controller.reward({ account: zeroAccount, note, publicKey, fee:0, relayer:0, accountCommitments: null, depositDataEvents: eventsDeposit.committedEvents, withdrawalDataEvents: eventsWithdraw.committedEvents})
      proof = result.proof
      args = result.args
      account = result.account
      const tx = await (await miner['reward(bytes,(uint256,uint256,address,uint256,uint256,bytes32,bytes32,bytes32,bytes32,(address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](proof, args, {gasLimit: 500000000})).wait();
      const newAccountEvent = tx.events.find(item => item.event === 'NewAccount')

      expect(newAccountEvent.event).to.equal('NewAccount')
      expect(newAccountEvent.args.commitment).to.equal(toFixedHex(account.commitment))
      expect(newAccountEvent.args.index).to.equal(accountCount)
      expect(newAccountEvent.args.nullifier).to.equal(toFixedHex(zeroAccount.nullifierHash))

      const encryptedAccount = newAccountEvent.args.encryptedAccount
      const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
      expect(account.apAmount.toString()).to.equal(account2.apAmount.toString())
      expect(account.aaveInterestAmount.toString()).to.equal(account2.aaveInterestAmount.toString())
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

      expect(account.apAmount.toString()).to.equal(BigNumber.from(note.withdrawalBlock - note.depositBlock).mul(RATE).toString())

    }).timeout(3000000);
  })

  describe('#withdraw', () => {
    it('should work', async () => {
      const accountNullifierBefore = await miner.accountNullifiers(toFixedHex(account.nullifierHash))
      expect(accountNullifierBefore).to.equal(false)

      const recipient = owner.address
      const aToken = new ethers.Contract(WETH_TOKEN, erc20Abi, wallet)
      const prevAaveTokenAmount = await aToken.balanceOf(recipient)
      const withdrawSnark = await controller.withdraw({ account, apAmount: account.apAmount, aaveInterestAmount: account.aaveInterestAmount, recipient, publicKey })
      const balanceBefore = await sacred.balanceOf(recipient)
      const tx = await (await miner['withdraw(bytes,(uint256,uint256,bytes32,(uint256,address,address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](withdrawSnark.proof, withdrawSnark.args)).wait()
      const balanceAfter = await sacred.balanceOf(recipient)
      const increasedBalance = balanceAfter.sub(balanceBefore)
      expect(increasedBalance.gt(0)).to.equal(true)

      const aaveTokenAmount = await aToken.balanceOf(recipient)
      console.log("Received ATokens", aaveTokenAmount - prevAaveTokenAmount)

      const newAccountEvent = tx.events.find(item => item.event === 'NewAccount')
      expect(newAccountEvent.event).to.equal('NewAccount')
      expect(newAccountEvent.args.commitment).to.equal(toFixedHex(withdrawSnark.account.commitment))
      expect(newAccountEvent.args.nullifier).to.equal(toFixedHex(account.nullifierHash))
      const encryptedAccount = newAccountEvent.args.encryptedAccount
      const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
      expect(withdrawSnark.account.apAmount.toString()).to.equal(account2.apAmount.toString())
      expect(withdrawSnark.account.aaveInterestAmount.toString()).to.equal(account2.aaveInterestAmount.toString())
      expect(withdrawSnark.account.secret.toString()).to.equal(account2.secret.toString())
      expect(withdrawSnark.account.nullifier.toString()).to.equal(account2.nullifier.toString())
      expect(withdrawSnark.account.commitment.toString()).to.equal(account2.commitment.toString())
    })
  })

})