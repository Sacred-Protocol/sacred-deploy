require('dotenv').config()
const { ethers } = require("hardhat")
const sacredTreesAbi = require('../../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const config = require('../../sacred-token/config')
const { ensToAddr } = require('../../src/utils')
const { PRIVATE_KEY } = process.env
let sacredTrees
let wallet

async function getSigner() {
  if(wallet) {
    return wallet
  }
  if(ethers.provider && typeof hre !== 'undefined') {
    const testing = ["hardhat", "localhost"].includes(hre.network.name);
    if (testing) {
      const accounts = await ethers.getSigners();
      wallet = accounts[0];
    } else {
      wallet = new ethers.Wallet(PRIVATE_KEY, provider)
    }
  } else {
    let provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
    wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  }
  return wallet
}

async function getSacredTrees() {
  if (!sacredTrees) {
    sacredTrees = new ethers.Contract(ensToAddr(config.sacredTrees.address), sacredTreesAbi.abi, await getSigner())
  }
  return sacredTrees
}

module.exports = {
  getSacredTrees
}
