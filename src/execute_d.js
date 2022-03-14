require('dotenv').config()
const utils = require('./utils');
const addressTable = require('../address.json')
const sacredProxyAbi = require('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const ethSacredAbi = require('../abi/ethSacred.json')
const config = require('../sacred-token/config')

const prefix = {
  1: '',
  42: 'kovan.',
  5: 'goerli.',
}

const { PRIVATE_KEY, NET_ID } = process.env

const explorer = `https://${prefix[NET_ID]}etherscan.io`

async function main() {
  const privateKey = PRIVATE_KEY
  const provider = await utils.getProvider()
  const testing = ["hardhat", "localhost"].includes(hre.network.name);
  let wallet
  if (testing) {
    const accounts = await ethers.getSigners();
    wallet = accounts[0];
  } else {
    wallet = new ethers.Wallet(privateKey, provider)  
  }

  utils.updateAddressTable(addressTable)
  const signers = await ethers.getSigners();
  owner = signers[0];
  let sacredProxy = new ethers.Contract(utils.ensToAddr(config.sacredProxy.address), sacredProxyAbi.abi, wallet)
  let sacredInstance = new ethers.Contract(utils.getSacredInstanceAddress(NET_ID, 'eth', 0.1), ethSacredAbi, wallet)
  await utils.init({sender: owner.address, proxyContractObj: sacredProxy, instanceContractObj: sacredInstance});

  //let data = utils.parseNote("sacred-eth-0.1-42-0xee629fa29dde919e355858d37342abda5b3aaafc3ed41a4014dac56a90f499fcfd77720b4f91059fd9b18795084afe8bf8cf0cff92a3e82810a5f572f49c");
  // let data = utils.parseNote("sacred-eth-0.1-42-0x68a17bc354fc0fc164e10e1ad51dce8329a180b4b1bd31f39a3ca9ab6be2d10805a53aa9b938be2d067b1cd879907bc3560187a35aaa29648a805a787b42");
  // await utils.withdraw({netdId: NET_ID, deposit: data.deposit, currency: data.currency, amount:data.amount, recipient: owner.address, relayerURL: null });
  let fs = require('fs');
  for(let i = 0; i < 256; i++) {
    //Deposit
    console.log("Count Number:", i);
    fs.writeFile('result.txt', '' + i, function (err) {
      
    });
    let ethbalance = 0;
    try {
      ethbalance = Number(ethers.utils.formatEther(await owner.getBalance()));
      console.log('User ETH balance is ', ethbalance);
    } catch {
      i--;
      continue;
    }

    let noteString = "";
    try {
      const result = await utils.deposit({netId: NET_ID, currency:'eth', amount:0.1});
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
        let data = utils.parseNote(noteString);
        const withdrawBlockNumber = await utils.withdraw({netId: NET_ID, deposit: data.deposit, currency: data.currency, amount:data.amount, recipient: owner.address, relayerURL: null });
        console.log("withdrawBlockNum = ", withdrawBlockNumber);
        noteString = "";
      } catch(e) {
        console.log("Withdrawing was failed! retrying!")
      }
    }
  } 
}

main()

