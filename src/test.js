/* global artifacts, web3, contract */
const { expect } = require('chai');
const { ethers } = require("hardhat");
const { BigNumber } = require('ethers')
const { encrypt, decrypt, getEncryptionPublicKey } = require('eth-sig-util')
const instancesInfo = require('../config.json')
const rootUpdaterEvents = require('../lib/root-updater/events')
const { updateTree } = require('../lib/root-updater/update')
const { action } = require('../lib/root-updater/utils')
const config = require('../sacred-token/config')
const Controller = require('../sacred-anonymity-mining/src/controller')
const Account = require('../sacred-anonymity-mining/src/account')
const Note = require('../sacred-anonymity-mining/src/note')
const { updateAddressTable } = require('../lib/deployUtils')
const { ensToAddr } = require('../lib/deployUtils')
const utils = require('../sacred-contracts-eth/lib/utils')
const { packEncryptedMessage, unpackEncryptedMessage } = require('../sacred-anonymity-mining/src/utils')
const { toHex, randomBN } = require('../sacred-contracts-eth/lib/baseUtils')
const sacredProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const sacredEchoerAbi = require('../sacred-anonymity-mining/artifacts/contracts/utils/Echoer.sol/Echoer.json')
const aaveInterestsProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/AaveInterestsProxy.sol/AaveInterestsProxy.json')
const sacredTreesAbi = require('../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const sacredAbi = require('../sacred-token/artifacts/contracts/SACRED.sol/SACRED.json')
const rewardSwapAbi = require('../sacred-anonymity-mining/artifacts/contracts/RewardSwap.sol/RewardSwap.json')
const minerAbi = require('../sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const ethSacredAbi = require('../abi/ETHSacred.json')
const erc20SacredAbi = require('../abi/ERC20Sacred.json')
const erc20Abi = require('../abi/erc20.abi.json')
const addressTable = require('../address.json')

const provingKeys = {
  wasmPath: "./sacred-contracts-eth/build/circuits/withdraw_js/withdraw.wasm",
  zkeyFilePath: "./sacred-contracts-eth/build/circuits/withdraw_0001.zkey",
  rewardWasmPath: "./sacred-anonymity-mining/build/circuits/Reward_js/Reward.wasm",
  rewardZkeyFilePath: "./sacred-anonymity-mining/build/circuits/Reward_0001.zkey",
  withdrawWasmPath: "./sacred-anonymity-mining/build/circuits/Withdraw_js/Withdraw.wasm",
  withdrawZkeyFilePath: "./sacred-anonymity-mining/build/circuits/Withdraw_0001.zkey",
  treeUpdateWasmPath: "./sacred-anonymity-mining/build/circuits/TreeUpdate_js/TreeUpdate.wasm",
  treeUpdateZkeyFilePath: "./sacred-anonymity-mining/build/circuits/TreeUpdate_0001.zkey",
}

const { PRIVATE_KEY, RPC_URL, MINIMUM_INTERESTS, IMPERSONATE_ACCOUNT } = process.env

async function updateRoot(sacredTrees, type) {
  const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(sacredTrees, type)
  await updateTree(sacredTrees, committedEvents, pendingEvents, type)
}

async function getBlockNumbers(sacredTrees, type, noteString) {
  const events = await rootUpdaterEvents.getSacredTreesEvents(sacredTrees, type, 0, 'latest')
  const { deposit } = utils.baseUtils.parseNote(noteString)
  const item = events.find(function (x) {
    if (type === action.WITHDRAWAL) {
      return x.hash === toHex(deposit.nullifierHash)
    } else if (type === action.DEPOSIT) {
      return x.hash === toHex(deposit.commitment)
    } else {
      return false
    }
  })
  let blockNum = -1
  if (item) {
    blockNum = item.block
  }
  return blockNum
}

async function getFormatedBalance(tokenAddress, _wallet) {
  let balance = 0
  if(tokenAddress) {
    const erc20 = new ethers.Contract(tokenAddress, erc20Abi, _wallet)
    const decimals = await erc20.decimals()
    balance = ethers.utils.formatUnits(await erc20.balanceOf(_wallet.address), decimals)
  } else {
    balance = ethers.utils.formatEther(await _wallet.getBalance())
  }
  return balance
}

async function deposit(currency, amount, _wallet) {
    const tokenAddress = instancesInfo.pools[`${utils.getNetId()}`][currency].token
    let balance = await getFormatedBalance(tokenAddress, _wallet)
    console.log(`Before Deposit: User ${currency} balance is `, balance);
    const result = await utils.deposit({ currency, amount });
    console.log('Deposit block number is ', result.blockNumber);
    balance = await getFormatedBalance(tokenAddress, _wallet)
    console.log(`After Deposit: User ${currency} balance is `, balance);
    return result
}

async function withdraw(noteString, _wallet) {
  const { deposit, currency, amount } = utils.baseUtils.parseNote(noteString);
  const tokenAddress = instancesInfo.pools[`${utils.getNetId()}`][currency].token
  let balance = await getFormatedBalance(tokenAddress, _wallet)
  console.log(`Before Withdraw: User ${currency} balance is `, balance);
  const blockNumber = await utils.withdraw({ deposit, currency, amount, recipient: _wallet.address, relayerURL: null });
  console.log('Withdraw block number is ', blockNumber);
  balance = await getFormatedBalance(tokenAddress, _wallet)
  console.log(`After Withdraw: User ${currency} balance is `, balance);
  return blockNumber
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
  let depositBlockNum
  let withdrawBlockNum
  let sacredTokenAddress

  let proof, args, account

  const privateKey = PRIVATE_KEY
  const publicKey = getEncryptionPublicKey(privateKey)

  before(async () => {
    await utils.init({ instancesInfo, erc20Contract: erc20Abi, RPC_URL, accountToInpersonate: IMPERSONATE_ACCOUNT })
    updateAddressTable(addressTable)
    wallet = utils.getWalllet()

    sacredTokenAddress = instancesInfo.sacredToken["" + utils.getNetId()]

    sacredTrees = new ethers.Contract(ensToAddr(config.sacredTrees.address), sacredTreesAbi.abi, wallet)
    sacredProxy = new ethers.Contract(ensToAddr(config.sacredProxy.address), sacredProxyAbi.abi, wallet)
    sacredEchoer = new ethers.Contract(ensToAddr(config.sacredEchoer.address), sacredEchoerAbi.abi, wallet)
    sacred = new ethers.Contract(sacredTokenAddress, sacredAbi.abi, wallet)
    rewardSwap = new ethers.Contract(ensToAddr(config.rewardSwap.address), rewardSwapAbi.abi, wallet)
    miner = new ethers.Contract(ensToAddr(config.miningV2.address), minerAbi.abi, wallet)

    await utils.setup({
      ethSacredAbi: ethSacredAbi.abi,
      erc20SacredAbi: erc20SacredAbi.abi,
      sacredProxyContract: sacredProxy,
      wasmPath: provingKeys.wasmPath,
      zkeyFilePath: provingKeys.zkeyFilePath
    });

    controller = new Controller({
      minerContract: miner,
      sacredTreesContract: sacredTrees,
      merkleTreeHeight: levels,
      provingKeys,
      utils
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
    it('It should work for ETH', async () => {
      for (let i = 0; i < 2; i++) {
        let result = await deposit("eth", 0.1, wallet)
        noteString = result.noteString
        depositBlockNum = result.blockNumber
        //Withdraw
        withdrawBlockNum = await withdraw(noteString, wallet)
      }
    })

    /*it('It should work for DAI', async () => {
      for (let i = 0; i < 2; i++) {
        let result = await deposit("dai", 200, wallet)
        noteString = result.noteString
        depositBlockNum = result.blockNumber
        //Withdraw
        withdrawBlockNum = await withdraw(noteString, wallet)
      }
    })
    */
  })

  describe('#Update Root of SacredTree', () => {
    it('should work', async () => {
      await updateRoot(sacredTrees, action.DEPOSIT)
      await updateRoot(sacredTrees, action.WITHDRAWAL)
    }).timeout(3000000);
  })

  describe('#reward', () => {
    it('should work', async () => {
      //noteString = "sacred-eth-0.1-4-0x702dea4c5b3aaefb219b9d5d066bd6f37467391bec008ab03408c9d7b7560e1d69a9d59df9364c4b9485b3c0e58ea0a52f22bc22e947a1fc0f2c72adc343"
      const { currency, amount } = utils.baseUtils.parseNote(noteString);
      const currencyIndex = Account.getCurrencyIndex(currency)
      const zeroAccount = new Account()
      const accountCount = await miner.accountCount()
      zeroAccount.getApAmountList().forEach(value => {
        expect(value.toString()).to.equal("0")
      })
      console.log("Note: ", noteString)
      depositBlockNum = await getBlockNumbers(sacredTrees, action.DEPOSIT, noteString)
      withdrawBlockNum = await getBlockNumbers(sacredTrees, action.WITHDRAWAL, noteString)
      console.log("depositBlockNumber:", depositBlockNum)
      console.log("withdrawBlockNumber:", withdrawBlockNum)
      const note = Note.fromString(noteString, utils.getSacredInstanceAddress(utils.getNetId(), currency, amount), depositBlockNum, withdrawBlockNum)
      const shareTracks = await miner.shareTrack(currencyIndex)
      const totalShares = await miner.totalShareSnapshots(currencyIndex, toHex(note.rewardNullifier), 0)
      const interests = await miner.totalShareSnapshots(currencyIndex, toHex(note.rewardNullifier), 1)
      expect(totalShares.gt(BigNumber.from(0))).to.equal(true)
      expect(interests.gt(BigNumber.from(0))).to.equal(true)
      expect(shareTracks.totalShares.gte(totalShares)).to.equal(true)
      const eventsDeposit = await rootUpdaterEvents.getEvents(sacredTrees, action.DEPOSIT)
      const eventsWithdraw = await rootUpdaterEvents.getEvents(sacredTrees, action.WITHDRAWAL)
      const result = await controller.reward({ account: zeroAccount, note, publicKey, fee: 0, relayer: 0, accountCommitments: null, depositDataEvents: eventsDeposit.committedEvents, withdrawalDataEvents: eventsWithdraw.committedEvents })
      account = result.account
      const tx = await (await miner['reward(uint256[2],uint256[2][2],uint256[2],(uint256,uint256,address,uint256,uint256,bytes32,bytes32,uint256,bytes32,bytes32,(address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](
        result.a, 
        result.b, 
        result.c, 
        result.args, 
        { gasLimit: 500000000 })).wait();
      const newAccountEvent = tx.events.find(item => item.event === 'NewAccount')
      expect(newAccountEvent.event).to.equal('NewAccount')
      expect(newAccountEvent.args.commitment).to.equal(toHex(account.commitment))
      expect(newAccountEvent.args.index).to.equal(accountCount)
      expect(newAccountEvent.args.nullifier).to.equal(toHex(zeroAccount.nullifierHash))

      const encryptedAccount = newAccountEvent.args.encryptedAccount
      const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
      
      expect(account.getApAmount(currency).toString()).to.equal(account2.getApAmount(currency).toString())
      expect(account.getAaveInterest(currency).toString()).to.equal(account2.getAaveInterest(currency).toString())
      expect(account.secret.toString()).to.equal(account2.secret.toString())
      expect(account.nullifier.toString()).to.equal(account2.nullifier.toString())
      expect(account.commitment.toString()).to.equal(account2.commitment.toString())

      const accountCountAfter = await miner.accountCount()
      expect(accountCountAfter).to.equal(accountCount.add(BigNumber.from(1)))
      const rootAfter = await miner.getLastAccountRoot()
      expect(rootAfter).to.equal(result.args.account.outputRoot)
      const rewardNullifierAfter = await miner.rewardNullifiers(toHex(note.rewardNullifier))
      expect(rewardNullifierAfter).to.equal(true)
      const accountNullifierAfter = await miner.accountNullifiers(toHex(zeroAccount.nullifierHash))
      expect(accountNullifierAfter).to.equal(true)

      expect(account.getApAmount(currency).toString()).to.equal(BigNumber.from(note.withdrawalBlock - note.depositBlock).mul(RATE).toString())

    }).timeout(3000000);
  })

  describe('#withdraw', () => {
    it('should work', async () => {
      const accountNullifierBefore = await miner.accountNullifiers(toHex(account.nullifierHash))
      expect(accountNullifierBefore).to.equal(false)
      const currency = "eth"
      const recipient = wallet.address
      const preETHBalance = await ethers.provider.getBalance(recipient);
      const withdrawSnark = await controller.withdraw({currency, account, apAmount: account.getApAmount(currency), aaveInterestAmount: account.getAaveInterest(currency), recipient, publicKey })
      const balanceBefore = await sacred.balanceOf(recipient)
      const tx = await (await miner['withdraw(uint256[2],uint256[2][2],uint256[2],(uint256,uint256,bytes32,uint256,(uint256,address,address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](
        withdrawSnark.a, 
        withdrawSnark.b, 
        withdrawSnark.c, 
        withdrawSnark.args)).wait()

      const gasUsed = BigInt(tx.cumulativeGasUsed) * BigInt(tx.effectiveGasPrice);

      const balanceAfter = await sacred.balanceOf(recipient)
      const increasedBalance = balanceAfter.sub(balanceBefore)
      console.log("Received SacredTokens:", increasedBalance)
      expect(increasedBalance.gt(0)).to.equal(true)

      const ethBalance = await ethers.provider.getBalance(recipient);
      const receivedAaveInterests = ethBalance.add(gasUsed).sub(preETHBalance)
      console.log("Received ETH", receivedAaveInterests)
      if (account.aaveInterestAmount.gt(BigInt(MINIMUM_INTERESTS))) {
        expect(receivedAaveInterests.gt(0)).to.equal(true)
      }

      const newAccountEvent = tx.events.find(item => item.event === 'NewAccount')
      expect(newAccountEvent.event).to.equal('NewAccount')
      expect(newAccountEvent.args.commitment).to.equal(toHex(withdrawSnark.account.commitment))
      expect(newAccountEvent.args.nullifier).to.equal(toHex(account.nullifierHash))
      const encryptedAccount = newAccountEvent.args.encryptedAccount
      const account2 = Account.decrypt(privateKey, unpackEncryptedMessage(encryptedAccount))
      expect(withdrawSnark.account.getApAmount(currency).toString()).to.equal(account2.getApAmount(currency).toString())
      expect(withdrawSnark.account.getAaveInterest(currency).toString()).to.equal(account2.getAaveInterest(currency).toString())
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
        miner.updateShares(ethers.constants.AddressZero, true, toHex(nullifier))
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
      await expect(
        sacredProxy.initialize(ethers.constants.AddressZero)
      ).to.be.revertedWith('Not authorized');

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
        sacredTrees.registerDeposit(instanceAddr, toHex(randomBN(31)))
      ).to.be.revertedWith('Not authorized');

      await expect(
        sacredTrees.registerWithdrawal(instanceAddr, toHex(randomBN(31)))
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
