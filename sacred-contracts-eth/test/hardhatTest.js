require("dotenv").config({ path: '../.env' });
const { expect } = require('chai');
const fs = require('fs')
const utils = require('../lib/utils')
const erc20Abi = require('../artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json')
const config = require('../config.json')
const ethSacredAbi = require('../artifacts/contracts/ETHSacred.sol/ETHSacred.json')
const erc20SacredAbi = require('../artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json')
const withdrawCircuit = require('../build/circuits/withdraw.json')
const withdrawProvidingKey = fs.readFileSync('./build/circuits/withdraw_proving_key.bin').buffer

const { RPC_URL, MERKLE_TREE_HEIGHT, LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY, WETH_TOKEN, OPERATOR_FEE } = process.env
let owner;

describe('Test Sacred Contracts', () => {
  // Deploy and setup the contracts
  before(async () => {
    // get the signers
    const signers = await ethers.getSigners();
    owner = signers[0];
    await utils.init({instancesInfo:config, erc20Contract: erc20Abi.abi, rpc: RPC_URL})
  });

  // describe('Test Deploy', () => {
  //   //Deploy Verifier Contract
  //   const Verifier = await ethers.getContractFactory('Verifier');
  //   const verifier = await (await Verifier.deploy()).deployed();

  //   //Deploy Hasher Contract
  //   const Hasher = await ethers.getContractFactory('Hasher');
  //   const hasher = await (await Hasher.deploy()).deployed();
  //   const ETHSacred = await ethers.getContractFactory(
  //     "ETHSacred",
  //     {
  //       libraries: {
  //         Hasher: hasher.address
  //       }
  //     }
  //   );

  //   //Deploy SacredInstances(ETH)
  //   const sacred = await (await ETHSacred
  //     .deploy(verifier.address, 100000000000000000, MERKLE_TREE_HEIGHT, LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY, WETH_TOKEN, owner.address, OPERATOR_FEE))
  //     .deployed();
  //   let fee = await sacred.fee()
  //   expect(fee).to.equal(OPERATOR_FEE)

  //   await(await sacred.setFee(0)).wait()
  //   fee = await sacred.fee()
  //   expect(fee).to.equal(0)

  //   await(await sacred.setAaveInterestsProxy(ethers.constants.AddressZero)).wait()
  //   const aaveInterestsProxy = await sacred.aaveInterestsProxy()
  //   expect(aaveInterestsProxy).to.equal(ethers.constants.AddressZero)

  //   await(await sacred.transferOwnership(ethers.constants.AddressZero)).wait()
  //   await(await sacred.setAaveInterestsProxy(ethers.constants.AddressZero)).wait()
  //   await(await sacred.renounceOwnership()).wait()

  //   await expect(sacred.setAaveInterestsProxy(ethers.constants.AddressZero))
  //       .to.be.revertedWith('Not authorized');

  //   await expect(sacred.setFee(0))
  //       .to.be.revertedWith('Not authorized');
  // });

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