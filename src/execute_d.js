require('dotenv').config()
const fs = require('fs')
const { ethers } = require("hardhat")
const utils = require('../sacred-contracts-eth/lib/utils')
const { ensToAddr, updateAddressTable} = require('../lib/deployUtils')
const instancesInfo = require('../config.json')
const config = require('../sacred-token/config')
const addressTable = require('../address.json')
const ethSacredAbi = require('../abi/ETHSacred.json')
const erc20Abi = require('../abi/erc20.abi.json')
const erc20SacredAbi = require('../abi/ERC20Sacred.json')
const sacredProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const provingKeys = {
  wasmPath: "./sacred-contracts-eth/build/circuits/withdraw_js/withdraw.wasm",
  zkeyFilePath: "./sacred-contracts-eth/build/circuits/withdraw_0001.zkey",
}

const {  RPC_URL } = process.env

async function main() {
  await utils.init({ instancesInfo, erc20Contract: erc20Abi, rpc:RPC_URL })
  const wallet = utils.getWalllet()
  updateAddressTable(addressTable)
  const sacredProxy = new ethers.Contract(ensToAddr(config.sacredProxy.address), sacredProxyAbi.abi, wallet)
 
  await utils.setup({
    ethSacredAbi: ethSacredAbi.abi,
    erc20SacredAbi: erc20SacredAbi.abi,
    sacredProxyContract: sacredProxy,
    wasmPath: provingKeys.wasmPath,
    zkeyFilePath: provingKeys.zkeyFilePath
  });
  const tokenAddress = instancesInfo.pools[`${utils.getNetId()}`]["dai"].token
  for(let i = 0; i < 256; i++) {
    //Deposit
    console.log("Count Number:", i);
    fs.writeFile('result.txt', '' + i, function (err) {
      
    });
    let ethbalance = 0;
    try {
      utils.printERC20Balance({address: wallet.address, name:"dai", tokenAddress})
      //ethbalance = Number(ethers.utils.formatEther(await wallet.getBalance()));
      //console.log('User ETH balance is ', ethbalance);
    } catch {
      i--;
      continue;
    }

    let noteString = "";
    try {
      const result = await utils.deposit({currency:'dai', amount:200});
      console.log("depositBlockNum = ", result.blockNumber);
      noteString = result.noteString;
    } catch(e) {
      console.log("Deposit was failed! retrying!", e)
      i--;
      continue;
    }
        
    //Withdraw
    while(noteString !== "") {
      try {
        const { currency, amount, netId, deposit } = utils.baseUtils.parseNote(noteString)
        const withdrawBlockNumber = await utils.withdraw({ deposit, currency, amount, recipient: wallet.address, relayerURL: null });
        console.log("withdrawBlockNum = ", withdrawBlockNumber);
        noteString = "";
      } catch(e) {
        console.log("Withdrawing was failed! retrying!")
      }
    }
  } 
}

main()

