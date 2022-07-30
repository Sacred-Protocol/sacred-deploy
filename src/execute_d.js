require('dotenv').config()
const utils = require('../lib/utils')
const fs = require('fs');
const { updateAddressTable} = require('../lib/deployUtils')
const instancesInfo = require('../config.json')
const addressTable = require('../address.json')
const ethSacredAbi = require('../abi/ethSacred.json')
const erc20Abi = require('../abi/erc20.abi.json')
const erc20SacredAbi = require('../artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json')
const withdrawCircuit = require('../lib/sacred-eth-build/circuits/withdraw.json')
const withdrawProvidingKey = fs.readFileSync('lib/sacred-eth-build/circuits/withdraw_proving_key.bin').buffer

const {  RPC_URL } = process.env

async function main() {
  await utils.init({instancesInfo, erc20Contract: erc20Abi, RPC_URL})

  updateAddressTable(addressTable)
  const signers = await ethers.getSigners();
  owner = signers[0];
  await utils.setup({
    ethSacredAbi, 
    erc20SacredAbi, 
    withdrawCircuit,
    withdrawProvidingKey
  });

  for(let i = 0; i < 2; i++) {
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
      const result = await utils.deposit({currency:'eth', amount:0.1});
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
        const withdrawBlockNumber = await utils.withdraw({ deposit: data.deposit, currency: data.currency, amount:data.amount, recipient: owner.address, relayerURL: null });
        console.log("withdrawBlockNum = ", withdrawBlockNumber);
        noteString = "";
      } catch(e) {
        console.log("Withdrawing was failed! retrying!")
      }
    }
  } 
}

main()

