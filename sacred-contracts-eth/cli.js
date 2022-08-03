#!/usr/bin/env node
// Temporary demo client
// Works in node.js

require('dotenv').config()
const utils = require('./lib/utils')
const fs = require('fs')
const program = require('commander')
const erc20Abi = require('./artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json')
const config = require('./config.json')
const ethSacredAbi = require('./artifacts/contracts/ETHSacred.sol/ETHSacred.json')
const erc20SacredAbi = require('./artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json')
const withdrawCircuit = require('./build/circuits/withdraw.json')
const withdrawProvidingKey = fs.readFileSync('./build/circuits/withdraw_proving_key.bin').buffer

const { PRIVATE_KEY, RPC_URL } = process.env

async function main() {
  program
    .option('-r, --rpc <URL>', 'The RPC, CLI should interact with', '')
    .option('-R, --relayer <URL>', 'Withdraw via relayer')
  program
    .command('deposit <currency> <amount>')
    .description('Submit a deposit of specified currency and amount from default eth account and return the resulting note. The currency is one of (ETH|). The amount depends on currency, see config.js file.')
    .action(async (currency, amount) => {
      await utils.init({instancesInfo: config, erc20Contract: erc20Abi.abi, rpc: program.rpc || RPC_URL})
      currency = currency.toLowerCase()
      await utils.setup({
        ethSacredAbi: ethSacredAbi.abi, 
        erc20SacredAbi: erc20SacredAbi.abi, 
        withdrawCircuit, 
        withdrawProvidingKey
      });
      await utils.deposit({currency, amount});
    })
  program
    .command('withdraw <note> <recipient> [ETH_purchase]')
    .description('Withdraw a note to a recipient account using relayer or specified private key. You can exchange some of your deposit`s tokens to ETH during the withdrawal by specifing ETH_purchase (e.g. 0.01) to pay for gas in future transactions. Also see the --relayer option.')
    .action(async (noteString, recipient, refund) => {
      await utils.init({instancesInfo: config, erc20Contract: erc20Abi.abi, rpc:program.rpc || RPC_URL})
      const { currency, amount, netId, deposit } = utils.baseUtils.parseNote(noteString)
      if(netId == utils.getNetId()) {
        await utils.setup({
          ethSacredAbi: ethSacredAbi.abi, 
          erc20SacredAbi: erc20SacredAbi.abi, 
          withdrawCircuit, 
          withdrawProvidingKey
        });
        await utils.withdraw({deposit, currency, amount, recipient, relayerURL: program.relayer, refund });
      } else {
        console.log("netId of the note doesn't match with RPC!")
      }
    })
  program
    .command('sacredtest <currency> <amount> <recipient>')
    .description('Perform an automated test. It deposits and withdraws one ETH. Uses Kovan Testnet.')
    .action(async (currency, amount, recipient) => {
      await utils.init({instancesInfo: config, erc20Contract: erc20Abi.abi, rpc:program.rpc || RPC_URL})
      currency = currency.toLowerCase()
      await utils.setup({
        ethSacredAbi: ethSacredAbi.abi, 
        erc20SacredAbi: erc20SacredAbi.abi, 
        withdrawCircuit, 
        withdrawProvidingKey
      });
      const { noteString, } = await utils.deposit({currency, amount});
      const { netId, deposit } = utils.baseUtils.parseNote(noteString)
      if(netId == utils.getNetId()) {
        const refund = '0'
        await utils.withdraw({deposit, currency, amount, recipient, relayerURL: program.relayer, refund });
      } else {
        console.log("netId of the note doesn't match with RPC!")
      }
    })
  program
    .command('balance <address> [token_address]')
    .description('Check ETH and ERC20 balance')
    .action(async (address, tokenAddress) => {
      await utils.init({instancesInfo: config, erc20Contract: erc20Abi.abi, rpc:program.rpc || RPC_URL})
      await utils.printETHBalance({ address, name: '' })
      if (tokenAddress) {
        await utils.printERC20Balance({ address, name: '', tokenAddress })
      }
    })
  program
    .command('compliance <note>')
    .description('Shows the deposit and withdrawal of the provided note. This might be necessary to show the origin of assets held in your withdrawal address.')
    .action(async (noteString) => {
      await utils.init({instancesInfo: config, erc20Contract: erc20Abi.abi, rpc:program.rpc || RPC_URL})
      const { currency, amount, netId, deposit } = utils.baseUtils.parseNote(noteString)
      await utils.setup({
        ethSacredAbi: ethSacredAbi.abi, 
        erc20SacredAbi: erc20SacredAbi.abi, 
        withdrawCircuit, 
        withdrawProvidingKey
      });
      const depositInfo = await utils.loadDepositData({ deposit })
      const depositDate = new Date(depositInfo.timestamp * 1000)
      console.log('\n=============Deposit=================')
      console.log('Deposit     :', amount, currency)
      console.log('Date        :', depositDate.toLocaleDateString(), depositDate.toLocaleTimeString())
      console.log('From        :', `https://${utils.getCurrentNetworkName()}etherscan.io/address/${depositInfo.from}`)
      console.log('Transaction :', `https://${utils.getCurrentNetworkName()}etherscan.io/tx/${depositInfo.txHash}`)
      console.log('Commitment  :', depositInfo.commitment)
      if (deposit.isSpent) {
        console.log('The note was not spent')
      }

      const withdrawInfo = await utils.loadWithdrawalData({ amount, currency, deposit })
      const withdrawalDate = new Date(withdrawInfo.timestamp * 1000)
      console.log('\n=============Withdrawal==============')
      console.log('Withdrawal  :', withdrawInfo.amount, currency)
      console.log('Relayer Fee :', withdrawInfo.fee, currency)
      console.log('Date        :', withdrawalDate.toLocaleDateString(), withdrawalDate.toLocaleTimeString())
      console.log('To          :', `https://${utils.getCurrentNetworkName()}etherscan.io/address/${withdrawInfo.to}`)
      console.log('Transaction :', `https://${utils.getCurrentNetworkName()}etherscan.io/tx/${withdrawInfo.txHash}`)
      console.log('Nullifier   :', withdrawInfo.nullifier)
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
