#!/usr/bin/env node
// Temporary demo client
// Works with node.js

require('dotenv').config()
const { ethers } = require("hardhat")
const utils = require('./lib/utils')
const instancesInfo = require('./config.json')
const { ensToAddr } = require('./lib/deployUtils')
const ethSacredAbi = require('./abi/ethSacred.json')
const erc20SacredAbi = require('./abi/erc20Sacred.json')
const erc20Abi = require('./abi/erc20.abi.json')
const rootUpdaterEvents = require('./lib/root-updater/events')
const { updateTree } = require('./lib/root-updater/update')
const { action } = require('./lib/root-updater/utils')
const config = require('./sacred-token/config')
const { BigNumber } = require('ethers')
const Account = require('./sacred-anonymity-mining/src/account')
const Controller = require('./sacred-anonymity-mining/src/controller')
const Note = require('./sacred-anonymity-mining/src/note')
const sacredProxyAbi = require('./sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const sacredTreesAbi = require('./sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const sacredAbi = require('./sacred-token/artifacts/contracts/SACRED.sol/SACRED.json')
const minerAbi = require('./sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const { toFixedHex, unpackEncryptedMessage } = require('./sacred-anonymity-mining/src/utils')
const buildGroth16 = require('websnark/src/groth16')
const { getEncryptionPublicKey } = require('eth-sig-util');
const fs = require('fs')
const program = require('commander')
const { util } = require('chai')
const levels = 20
const { PRIVATE_KEY, NETWORK, SACRED_TOKEN, RPC_URL } = process.env
const addressTable = require('./'+NETWORK+'/address.json')

const provingKeys = {
  sacredEthWithdrawCircuit: require('../lib/sacred-eth-build/circuits/withdraw.json'),
  rewardCircuit: require('./sacred-anonymity-mining/build/circuits/Reward.json'),
  withdrawCircuit: require('./sacred-anonymity-mining/build/circuits/Withdraw.json'),
  treeUpdateCircuit: require('./sacred-anonymity-mining/build/circuits/TreeUpdate.json'),
  rewardProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Reward_proving_key.bin').buffer,
  withdrawProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/Withdraw_proving_key.bin').buffer,
  treeUpdateProvingKey: fs.readFileSync('./sacred-anonymity-mining/build/circuits/TreeUpdate_proving_key.bin').buffer,
  sacredEthWithdrawProvidingKey: fs.readFileSync('lib/sacred-eth-build/circuits/withdraw_proving_key.bin').buffer
}

utils.updateAddressTable(addressTable)

let miner
let sacred
let sacredTrees
let sacredProxy
let controller
let wallet

async function init(rpc) {
  await utils.init({instancesInfo, erc20Contract: erc20Abi, rpc})
  wallet = utils.getWalllet()
  sacredTrees = new ethers.Contract(ensToAddr(config.sacredTrees.address), sacredTreesAbi.abi, wallet)
  sacredProxy = new ethers.Contract(ensToAddr(config.sacredProxy.address), sacredProxyAbi.abi, wallet)
  sacred = new ethers.Contract(SACRED_TOKEN, sacredAbi.abi, wallet)
  miner = new ethers.Contract(ensToAddr(config.miningV2.address), minerAbi.abi, wallet)
  let groth16 = await buildGroth16()
  controller = new Controller({
    minerContract: miner,
    sacredTreesContract: sacredTrees,
    merkleTreeHeight: levels,
    provingKeys,
    groth16
  })

  await utils.setup({
    ethSacredAbi, 
    erc20SacredAbi, 
    sacredProxyContract: sacredProxy,
    withdrawCircuit: provingKeys.sacredEthWithdrawCircuit, 
    withdrawProvidingKey: provingKeys.sacredEthWithdrawProvidingKey
  });

  rootUpdaterEvents.setProvider(utils.getProvider())
  await controller.init(rpc)
}

async function updateRoot(type) {
  const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(sacredTrees, type)
  await updateTree(sacredTrees, committedEvents, pendingEvents, type)
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

async function main() {
  program
    .option('-r, --rpc <URL>', 'The RPC, CLI should interact with')
    .option('-R, --relayer <URL>', 'Withdraw via relayer')
    .option('-k, --privatekey <privateKey>', 'Private Key') 
  program
    .command('deposit <currency> <amount>')
    .description('Submit a deposit of specified currency and amount from default eth account and return the resulting note. The currency is one of (ETH|). The amount depends on currency, see config.js file.')
    .action(async (currency, amount) => {
      await init(program.rpc || RPC_URL)
      currency = currency.toLowerCase()
      const result = await utils.deposit({currency, amount});
    })
  program
    .command('withdraw <note> <recipient> [ETH_purchase]')
    .description('Withdraw a note to a recipient account using relayer or specified private key. You can exchange some of your deposit`s tokens to ETH during the withdrawal by specifing ETH_purchase (e.g. 0.01) to pay for gas in future transactions. Also see the --relayer option.')
    .action(async (noteString, recipient, refund) => {
      await init(program.rpc || RPC_URL)
      const { currency, amount, netId, deposit } = utils.baseUtils.parseNote(noteString)
      await utils.withdraw({deposit, currency, amount, recipient, relayerURL: program.relayer, refund });
    })
  program
    .command('sacredtest <currency> <amount> <recipient>')
    .description('Perform an automated test. It deposits and withdraws one ETH. Uses Kovan Testnet.')
    .action(async (currency, amount, recipient) => {
      await init(program.rpc || RPC_URL)
      currency = currency.toLowerCase()
      const { noteString, } = await utils.deposit({currency, amount});
      const { _netId, deposit } = utils.baseUtils.parseNote(noteString)
      const refund = '0'
      await utils.withdraw({netId, deposit, currency, amount, recipient, relayerURL: program.relayer, refund });
    })
  program
    .command('updatetree <operation>')
    .description('Perform batch update root of SacredTree. operation indicates deposit or withdraw')
    .action(async (operation) => {
      await init(program.rpc || RPC_URL)
      operation = operation.toLowerCase()
      if (operation === "deposit") {
        await updateRoot(action.DEPOSIT)
      } else if (operation === "withdraw") {
        await updateRoot(action.WITHDRAWAL)
      } else {
        console.log('Please specify operation as deposit or withdraw')
      }
    })
  program
    .command('showpendings <operation>')
    .description('Perform batch update root of SacredTree. operation indicates deposit or withdraw')
    .action(async (operation) => {
      await init(program.rpc || RPC_URL)
      operation = operation.toLowerCase()
      if (operation === "deposit") {
        const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(action.DEPOSIT)
        console.log("Committed Deposits:", committedEvents.length)
        console.log("Pending Deposits:", pendingEvents.length)
      } else if (operation === "withdraw") {
        const { committedEvents, pendingEvents } = await rootUpdaterEvents.getEvents(action.WITHDRAWAL)
        console.log("Committed Withdrawals:", committedEvents.length)
        console.log("Pending Withdrawals:", pendingEvents.length)
      } else {
        console.log('Please specify operation as deposit or withdraw')
      }
    })
  program
    .command('calcap <note>')
    .description('Calculate AP amount.')
    .action(async (note) => {
      await init(program.rpc || RPC_URL)
      const depositBlock = await getBlockNumbers(action.DEPOSIT, note)
      const withdrawalBlock = await getBlockNumbers(action.WITHDRAWAL, note)
      if(depositBlock < 0) {
        console.log("The note isn't included in deposit transactions")
      }
      if(withdrawalBlock < 0) {
        console.log("The note isn't included in withdrawal transactions")
      }
      if(depositBlock > 0 && withdrawalBlock > 0) {
        const { currency, amount, netId, deposit } = utils.baseUtils.parseNote(note)
        const rate = await miner.rates(utils.getSacredInstanceAddress(netId, currency, amount))
        const apAmount = BigNumber.from(withdrawalBlock - depositBlock).mul(rate)
        console.log("AP amount: ", apAmount.toString())
      }
    })
  program
    .command('reward <note>')
    .description('It claiming reward. With executing this, you can get your encoded account that contains your AP.')
    .action(async (note) => {
      await init(program.rpc || RPC_URL)
      const zeroAccount = new Account()
      const depositBlock = await getBlockNumbers(action.DEPOSIT, note)
      const withdrawalBlock = await getBlockNumbers(action.WITHDRAWAL, note)
      if(depositBlock < 0) {
        console.log("The note isn't included in deposit transactions")
      }
      if(withdrawalBlock < 0) {
        console.log("The note isn't included in withdrawal transactions")
      }
      if(depositBlock > 0 && withdrawalBlock > 0) {
        const { currency, amount, netId, deposit } = utils.baseUtils.parseNote(note)
        const _note = Note.fromString(note, utils.getSacredInstanceAddress(netId, currency, amount), depositBlock, withdrawalBlock)
        const eventsDeposit = await rootUpdaterEvents.getEvents(action.DEPOSIT)
        const eventsWithdraw = await rootUpdaterEvents.getEvents(action.WITHDRAWAL)
        const publicKey = getEncryptionPublicKey(program.privateKey || PRIVATE_KEY)
        const result = await controller.reward({ account: zeroAccount, note: _note, publicKey, fee:0, relayer:program.relayer, accountCommitments: null, depositDataEvents: eventsDeposit.committedEvents, withdrawalDataEvents: eventsWithdraw.committedEvents})
        const account = result.account
        const tx = await (await miner['reward(bytes,(uint256,uint256,address,uint256,uint256,bytes32,bytes32,bytes32,bytes32,(address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](result.proof, result.args, {gasLimit: 500000})).wait();
        const newAccountEvent = tx.events.find(item => item.event === 'NewAccount')
        const encryptedAccount = newAccountEvent.args.encryptedAccount
        console.log("Claimed Ap Amount: ", account.apAmount.toString())
        console.log("Estimated AaveInterest Amount: ", account.aaveInterestAmount.toString())
        console.log("Encrypted Account: ", encryptedAccount)
      }
    })
  program
    .command('rewardswap <account> <recipient>')
    .description('It swaps your AP that is included in your account to ETH.')
    .action(async (account, recipient) => {
      await init(program.rpc || RPC_URL)
      const publicKey = getEncryptionPublicKey(program.privateKey || PRIVATE_KEY)
      const decryptedAccount = Account.decrypt(program.privateKey || PRIVATE_KEY, unpackEncryptedMessage(account))
      const apAmount = decryptedAccount.apAmount
      const aaveInterestAmount = decryptedAccount.aaveInterestAmount
      const withdrawSnark = await controller.withdraw({ account: decryptedAccount, apAmount, aaveInterestAmount, recipient, publicKey })
      const balanceBefore = await sacred.balanceOf(recipient)
      console.log("Balance Before RewardSwap:", balanceBefore)
      const tx = await (await miner['withdraw(bytes,(uint256,uint256,bytes32,(uint256,address,address,bytes),(bytes32,bytes32,bytes32,uint256,bytes32)))'](withdrawSnark.proof, withdrawSnark.args)).wait()
      const balanceAfter = await sacred.balanceOf(recipient)
      console.log("Balance After RewardSwap:", balanceAfter)
    })
  try {
    await program.parseAsync(process.argv)
    process.exit(0)
  } catch (e) {
    console.log('Error:', e)
    process.exit(1)
  }
}

main()

