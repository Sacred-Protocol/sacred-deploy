require("dotenv").config();
const { expect } = require('chai');
const fs = require('fs')
const utils = require('../lib/utils')
const erc20Abi = require('../artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json')
const config = require('../config.json')
const ethSacredAbi = require('../artifacts/contracts/ETHSacred.sol/ETHSacred.json')
const erc20SacredAbi = require('../artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json')
const withdrawCircuit = require('../build/circuits/withdraw.json')
const withdrawProvidingKey = fs.readFileSync('./build/circuits/withdraw_proving_key.bin').buffer

const { RPC_URL } = process.env
let owner;

describe('Test Sacred Contracts', () => {
  // Deploy and setup the contracts
  before(async () => {
    // get the signers
    const signers = await ethers.getSigners();
    owner = signers[0];
    await utils.init({instancesInfo:config, erc20Contract: erc20Abi.abi, rpc: RPC_URL})
  });

  describe('Test Deposit, Withdraw', () => {
    // we'll always need the user ETH balance to be greater than 3 ETH, because we use 2 ETH as the base amount for token conversions e.t.c
    it('Deposit/Withdraw', async () => {
      let ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
      console.log('User ETH balance is ', ethbalance);

      const currency = "eth"
      const amount = 0.1
      await utils.setup({
        ethSacredAbi: ethSacredAbi.abi, 
        erc20SacredAbi: erc20SacredAbi.abi, 
        withdrawCircuit, 
        withdrawProvidingKey
      });
      const { noteString, } = await utils.deposit({currency, amount});
      const { netId, deposit } = utils.baseUtils.parseNote(noteString)
      expect(""+netId).to.equal(utils.getNetId())
      const refund = '0'
      await utils.withdraw({deposit, currency, amount, recipient: owner.address, refund });

      ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
      console.log('User ETH balance is ', ethbalance);
    });
  });

});