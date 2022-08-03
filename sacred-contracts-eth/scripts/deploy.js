require('dotenv').config()
const { ethers } = require("hardhat")
const fs = require('fs')
const baseUtils = require('../lib/baseUtils')
const config = require('../config.json')
const { MERKLE_TREE_HEIGHT, ETH_AMOUNTS, OPERATOR_FEE, LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY, WETH_TOKEN } = process.env
const { PRIVATE_KEY, RPC_URL } = process.env

async function main() {

  await baseUtils.init(RPC_URL)
  const provider = await baseUtils.getProvider()
  const { chainId } = await provider.getNetwork()
  const testing = ["hardhat", "localhost"].includes(hre.network.name);
  let wallet
  if (testing) {
    const accounts = await ethers.getSigners();
    wallet = accounts[0];
  } else {
    wallet = new ethers.Wallet(PRIVATE_KEY, provider)
  }
  
  //Deploy Verifier Contract
  const Verifier = await ethers.getContractFactory('Verifier');
  const verifier = await (await Verifier.deploy()).deployed();
  console.log('Verifier Contract Deployed: ', verifier.address)

  //Deploy Hasher Contract
  const Hasher = await ethers.getContractFactory('Hasher');
  const hasher = await (await Hasher.deploy()).deployed();
  console.log('Hasher Contract Deployed: ', hasher.address)
  const ETHSacred = await ethers.getContractFactory(
    "ETHSacred",
    {
      libraries: {
        Hasher: hasher.address
      }
    }
  );

  //Deploy SacredInstances(ETH)
  const ethAmounts = ETH_AMOUNTS.split(",");
  let addresses = []
  for(var i = 0; i < ethAmounts.length; i++) {
    let amount = ethAmounts[i];
    console.log("Deploying ETHSacred instance: ", ethers.utils.formatEther(amount))
    const sacred = await (await ETHSacred
      .deploy(verifier.address, amount, MERKLE_TREE_HEIGHT, LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY, WETH_TOKEN, wallet.address, OPERATOR_FEE))
      .deployed();
    addresses[i] = sacred.address
  }

  for(var i = 0; i < ethAmounts.length; i++) {
    let amount = ethAmounts[i];
    let currencyAmount = ethers.utils.formatEther(amount)
    let amountKey = "" + parseFloat(currencyAmount)
    config.deployments["netId" + chainId]["eth"].instanceAddress[amountKey] = addresses[i]
    console.log('' + currencyAmount + ' - ETHSacred\'s address ', addresses[i])
  }

  fs.writeFileSync('./config.json', JSON.stringify(config, null, '  '))
  console.log("Deployed Contract's addresses are saved into config.json!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })