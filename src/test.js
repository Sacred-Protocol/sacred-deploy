/* global artifacts, web3, contract */
const { expect } = require('chai');
const { ethers } = require("hardhat");
const fs = require('fs')
const { BigNumber } = require('ethers')
const { toBN } = require('web3-utils')
const { encrypt, decrypt, getEncryptionPublicKey } = require('eth-sig-util')
const instancesInfo = require('../config.json')
const rootUpdaterEvents = require('../lib/root-updater/events')
const { updateTree } = require('../lib/root-updater/update')
const { action } = require('../lib/root-updater/utils')
const config = require('../sacred-token/config')
const Controller = require('../sacred-anonymity-mining/src/controller')
const Account = require('../sacred-anonymity-mining/src/account')
const Note = require('../sacred-anonymity-mining/src/note')
const { updateAddressTable} = require('../lib/deployUtils')
const { ensToAddr } = require('../lib/deployUtils')
const utils = require('../lib/utils')
const { toFixedHex, randomBN, packEncryptedMessage, unpackEncryptedMessage } = require('../sacred-anonymity-mining/src/utils')
const sacredProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const sacredEchoerAbi = require('../sacred-anonymity-mining/artifacts/contracts/utils/Echoer.sol/Echoer.json')
const aaveInterestsProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/AaveInterestsProxy.sol/AaveInterestsProxy.json')
const sacredTreesAbi = require('../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const sacredAbi = require('../sacred-token/artifacts/contracts/SACRED.sol/SACRED.json')
const rewardSwapAbi = require('../sacred-anonymity-mining/artifacts/contracts/RewardSwap.sol/RewardSwap.json')
const minerAbi = require('../sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const ethSacredAbi = require('../abi/ethSacred.json')
const erc20SacredAbi = require('../abi/erc20Sacred.json')
const erc20Abi = require('../abi/erc20.abi.json')
const buildGroth16 = require('websnark/src/groth16')
const addressTable = require('../address.json')

const provingKeys = {
  sacredEthWithdrawCircuit: require('../lib/sacred-eth-build/circuits/withdraw.json'),
  rewardCircuit: require('../sacred-anonymity-mining/build/circuits/Reward.json'),
  withdrawCircuit: require('../sacred-anonymity-mining/build/circuits/Withdraw.json'),
  treeUpdateCircuit: require('../sacred-anonymity-mining/build/circuits/TreeUpdate.json'),
  rewardProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Reward_proving_key.bin').buffer,
  withdrawProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Withdraw_proving_key.bin').buffer,
  treeUpdateProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/TreeUpdate_proving_key.bin').buffer,
  sacredEthWithdrawProvidingKey: fs.readFileSync('lib/sacred-eth-build/circuits/withdraw_proving_key.bin').buffer
}

const { PRIVATE_KEY, RPC_URL, MINIMUM_INTERESTS, SACRED_TOKEN} = process.env

async function updateRoot(sacredTrees, type) {
  const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(sacredTrees, type)
  await updateTree(sacredTrees, committedEvents, pendingEvents, type)
}

async function getBlockNumbers(type, noteString) {
  const events = await rootUpdaterEvents.getSacredTreesEvents(type, 0, 'latest')
  const { currency, amount, netId, deposit } = utils.baseUtils.parseNote(noteString)
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
  let sacredEchoer
    
  let controller
  let wallet

  let noteString
  let depositBlockNum;
  let withdrawBlockNum;

  let proof, args, account

  const privateKey = PRIVATE_KEY
  const publicKey = getEncryptionPublicKey(privateKey)

  before(async () => {
    await utils.init({instancesInfo, erc20Contract: erc20Abi, RPC_URL})
    updateAddressTable(addressTable)
    wallet = utils.getWalllet()

    sacredTrees = new ethers.Contract(ensToAddr(config.sacredTrees.address), sacredTreesAbi.abi, wallet)
    sacredProxy = new ethers.Contract(ensToAddr(config.sacredProxy.address), sacredProxyAbi.abi, wallet)
    sacredEchoer = new ethers.Contract(ensToAddr(config.sacredEchoer.address), sacredEchoerAbi.abi, wallet)
    sacred = new ethers.Contract(SACRED_TOKEN, sacredAbi.abi, wallet)
    rewardSwap = new ethers.Contract(ensToAddr(config.rewardSwap.address), rewardSwapAbi.abi, wallet)
    miner = new ethers.Contract(ensToAddr(config.miningV2.address), minerAbi.abi, wallet)
    
    await utils.setup({
      ethSacredAbi, 
      erc20SacredAbi, 
      sacredProxyContract: sacredProxy,
      withdrawCircuit: provingKeys.sacredEthWithdrawCircuit, 
      withdrawProvidingKey: provingKeys.sacredEthWithdrawProvidingKey
    });

    let groth16 = await buildGroth16()
    controller = new Controller({
      minerContract: miner,
      sacredTreesContract: sacredTrees,
      merkleTreeHeight: levels,
      provingKeys,
      groth16
    })
    rootUpdaterEvents.setProvider(utils.getProvider())
    await controller.init()
  })

  describe('#Check RewardSwap initialized', () => {
    it('should has initial amount of SacredTokens', async () => {
      const balance = await sacred.balanceOf(ensToAddr(config.rewardSwap.address))
      expect(balance.gt(0)).to.equal(true)
    })
  })

  describe('#Backup/Restore Account Key On-Chain', () => {
    it('should store encrypted account key on-chain', async () => {
      const genRanHex = size => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
      const accountKey = genRanHex(40)
      const encryptedAccount = encrypt(publicKey, { data: accountKey.toString('base64') }, 'x25519-xsalsa20-poly1305')
      const encryptedMessage = packEncryptedMessage(encryptedAccount)
      const tx = await (await sacredEchoer.echo(encryptedMessage)).wait()
      const accountBackupEvent = tx.events.find(item => item.event === 'Echo')
      const encryptedMessage2 = accountBackupEvent.args.data
      const encryptedAccount2 = unpackEncryptedMessage(encryptedMessage2)
      const accountKey2 = decrypt(encryptedAccount2, PRIVATE_KEY)
      expect(accountKey).to.equal(accountKey2)
    })
  })

  describe('#constructor', () => {
    it('should initialize', async () => {
      const tokenFromContract = await rewardSwap.sacred()
      expect(tokenFromContract).to.equal(sacred.address)
      const rewardSwapFromContract = await miner.rewardSwap()
      expect(rewardSwapFromContract).to.equal(rewardSwap.address)
      const rateFromContract = await miner.rates(utils.getSacredInstanceAddress(utils.getNetId(), 'eth', 0.1))
      expect(rateFromContract).to.equal(BigNumber.from(RATE))
    })
  })

  describe('#Deposit And Withdraw', () => {
    it('should work', async () => {
      for(let i = 0; i < 2; i++) {
        let ethbalance = Number(ethers.utils.formatEther(await wallet.getBalance()));
        console.log('Before Deposit: User ETH balance is ', ethbalance);
        //Deposit
        const result = await utils.deposit({currency:'eth', amount:0.1});
        noteString = result.noteString;
        depositBlockNum = result.blockNumber;
        console.log('Deposit block number is ', depositBlockNum);
        ethbalance = Number(ethers.utils.formatEther(await wallet.getBalance()));
        console.log('After Deposit: User ETH balance is ', ethbalance);
        //Withdraw
        const {deposit, currency, amount} = utils.baseUtils.parseNote(noteString);
        withdrawBlockNum = await utils.withdraw({deposit, currency, amount, recipient: wallet.address, relayerURL: null });
        console.log('Withdraw block number is ', withdrawBlockNum);
        ethbalance = Number(ethers.utils.formatEther(await wallet.getBalance()));
        console.log('After Withdraw: User ETH balance is ', ethbalance);
      }
    })
  })

  describe('#Update Root of SacredTree', () => {
    it('should work', async () => {
      await updateRoot(sacredTrees, action.DEPOSIT)
      await updateRoot(sacredTrees, action.WITHDRAWAL)
    }).timeout(3000000);
  })

  describe('#reward', () => {
    it('should work', async () => {
      const zeroAccount = new Account()
      const accountCount = await miner.accountCount()
      expect(zeroAccount.apAmount.toString()).to.equal("0")

      //noteString = "sacred-eth-0.1-4-0x972bc50762e104fab8970831442cb7e1d53244b03940be5d7d840323c7ff635b67b61a8620afe1f187714f1b9e7aa0d5fe5bb7ca7e95ecc9919c0ee814e5"
      console.log("Note: ", noteString)
      depositBlockNum = await getBlockNumbers(action.DEPOSIT, noteString)
      withdrawBlockNum = await getBlockNumbers(action.WITHDRAWAL, noteString)
      console.log("depositBlockNumber:", depositBlockNum)
      console.log("withdrawBlockNumber:", withdrawBlockNum)
      const note = Note.fromString(noteString, utils.getSacredInstanceAddress(utils.getNetId(), 'eth', 0.1), depositBlockNum, withdrawBlockNum)
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

      const recipient = wallet.address
      const preETHBalance = await ethers.provider.getBalance(recipient);
      const withdrawSnark = await controller.withdraw({ account, apAmount: account.apAmount, aaveInterestAmount: account.aaveInterestAmount, recipient, publicKey })
      const balanceBefore = await sacred.balanceOf(recipient)
      const tx = await (await miner['withdraw(bytes,(uint256,uint256,bytes32,(uint256,address,address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](withdrawSnark.proof, withdrawSnark.args)).wait()
      
      const gasUsed = BigInt(tx.cumulativeGasUsed) * BigInt(tx.effectiveGasPrice);

      const balanceAfter = await sacred.balanceOf(recipient)
      const increasedBalance = balanceAfter.sub(balanceBefore)
      console.log("Received SacredTokens:", increasedBalance)
      expect(increasedBalance.gt(0)).to.equal(true)
      
      const ethBalance = await ethers.provider.getBalance(recipient);
      const receivedAaveInterests = ethBalance.add(gasUsed).sub(preETHBalance)
      console.log("Received ETH", receivedAaveInterests)
      if(account.aaveInterestAmount.gt(toBN(MINIMUM_INTERESTS))) {
        expect(receivedAaveInterests.gt(0)).to.equal(true)
      }

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

  describe('#privilege Check', () => {
    it('AaveInterestProxy', async () => {
      const aaveInterestProxy = new ethers.Contract(ensToAddr(config.aaveInterestsProxy.address), aaveInterestsProxyAbi.abi, wallet)
      await expect(
        aaveInterestProxy.withdraw(10, wallet.address)
      ).to.be.revertedWith('Not authorized');
      })

    it('RewardSwap', async () => {
      //RewardSwap
      await expect(
        rewardSwap.setPoolWeight(0)
      ).to.be.revertedWith('Only Miner contract can call');

      await expect(
        rewardSwap.swap(wallet.address, 10)
      ).to.be.revertedWith('Only Miner contract can call');
    })

    it('Miner', async () => {
      //Miner
      await expect(
        miner.setMinimumInterests(0)
      ).to.be.revertedWith('Only governance can perform this action');

      const nullifier = randomBN(31)
      await expect(
        miner.updateShares(ethers.constants.AddressZero, true, toFixedHex(nullifier))
      ).to.be.revertedWith('Not authorized');

      await expect(
        miner.setAaveInterestFee(0)
      ).to.be.revertedWith('Only governance can perform this action');
      
      const rates = config.miningV2.rates.map((rate) => ({
        instance: ensToAddr(rate.instance),
        value: rate.value,
      }))

      await expect(
        miner.setRates(rates)
      ).to.be.revertedWith('Only governance can perform this action');

      await expect(
        miner.setVerifiers([
          ensToAddr(config.rewardVerifier.address),
          ensToAddr(config.withdrawVerifier.address),
          ensToAddr(config.treeUpdateVerifier.address),
        ])
      ).to.be.revertedWith('Only governance can perform this action');
      
      await expect(
        miner.setSacredTreesContract(ethers.constants.AddressZero)
      ).to.be.revertedWith('Only governance can perform this action');

      await expect(
        miner.setAaveInterestsProxyContract(ethers.constants.AddressZero)
      ).to.be.revertedWith('Only governance can perform this action');
    })

    it('SacredProxy', async () => {
      //SacredProxy
      const oldMinerAddress = await sacredProxy.miner();
      await (await sacredProxy.initialize(ethers.constants.AddressZero)).wait();
      const newMinerAddress = await sacredProxy.miner();
      expect(oldMinerAddress).to.equal(newMinerAddress);

      const instances = config.miningV2.rates.map((rate) => ({
        addr: ensToAddr(rate.instance),
        instance: {
          isERC20: false,
          token: ethers.constants.AddressZero,
          state: 2 //"MINEABLE"
        },
      }))
      await expect(
        sacredProxy.updateInstance(instances[0])
      ).to.be.revertedWith('Not authorized');

      await expect(
        sacredProxy.rescueTokens(ethers.constants.AddressZero, wallet.address, 10)
      ).to.be.revertedWith('Not authorized');
    
    })
    
    it('sacredTrees', async () => {
      //sacredTrees
      const instanceAddr = utils.getSacredInstanceAddress(utils.getNetId(), 'eth', 0.1)
      await expect(
        sacredTrees.registerDeposit(instanceAddr, toFixedHex(randomBN(31)))
      ).to.be.revertedWith('Not authorized');

      await expect(
        sacredTrees.registerWithdrawal(instanceAddr, toFixedHex(randomBN(31)))
      ).to.be.revertedWith('Not authorized');

      await expect(
        sacredTrees.setSacredProxyContract(ethers.constants.AddressZero)
      ).to.be.revertedWith('Only governance can perform this action');

      await expect(
        sacredTrees.setVerifierContract(ethers.constants.AddressZero)
      ).to.be.revertedWith('Only governance can perform this action');
    })
  })
})
