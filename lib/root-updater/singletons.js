require('dotenv').config()
const sacredTreesAbi = require('../../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const config = require('../../sacred-token/config')
const { ensToAddr } = require('../../src/utils')
let sacredTrees

async function getProvider() {
  const provider = ethers.provider
  const testing = ["hardhat", "localhost"].includes(hre.network.name);

  if (testing) {
    const accounts = await ethers.getSigners();
    wallet = accounts[0];
  } else {
    wallet = new ethers.Wallet(privateKey, provider)  
  }
  return wallet
}

async function getSacredTrees() {
  if (!sacredTrees) {
    sacredTrees = new ethers.Contract(ensToAddr(config.sacredTrees.address), sacredTreesAbi.abi, await getProvider())
  }
  return sacredTrees
}

module.exports = {
  getSacredTrees
}
