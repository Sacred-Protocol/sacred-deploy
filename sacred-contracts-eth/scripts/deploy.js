require('dotenv').config({ path: '../.env' })
const { ethers } = require("hardhat")
const fs = require('fs')
const baseUtils = require('../lib/baseUtils')
const config = require('../../config.json')
const { MERKLE_TREE_HEIGHT, ETH_AMOUNTS, OPERATOR_FEE, LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY } = process.env
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

  const ERC20Sacred = await ethers.getContractFactory(
    "ERC20Sacred",
    {
      libraries: {
        Hasher: hasher.address
      }
    }
  );

  //Deploy SacredInstances(ETH)
  const currencies = Object.keys(config.pools["" + chainId])
  for(const currency of currencies) {
    console.log("Deploying Pools for", currency.toUpperCase())
    let info = config.pools["" + chainId][currency]
    if (!info.aToken) {
      console.log("Missing aToken address for", currency)
      return
    }

    if (!info.decimals) {
      console.log("Missing decimals for", currency)
      return
    }
    const amounts = Object.keys(info.instanceAddress)
    if (currency == "eth") {
      for (const amount of amounts) {
        const weiAmount = ethers.utils.parseEther(amount)
        const sacred = await(await ETHSacred
          .deploy(verifier.address, weiAmount, MERKLE_TREE_HEIGHT, LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY, info.aToken, wallet.address, OPERATOR_FEE))
          .deployed();
        info.instanceAddress[amount] = sacred.address
        console.log("ETHSacred instance deployed:", currency, amount, sacred.address)
      }
    } else {
      if (!info.token) {
        console.log("Missing token address for", currency)
        return
      }
      for (const amount of amounts) {
        const weiAmount = ethers.utils.parseUnits(amount, info.decimals)
        const sacred = await(await ERC20Sacred
          .deploy(verifier.address, weiAmount, MERKLE_TREE_HEIGHT, LENDING_POOL_ADDRESS_PROVIDER, info.aToken, wallet.address, info.token, OPERATOR_FEE))
          .deployed();
        info.instanceAddress[amount] = sacred.address
        console.log("ERC20Sacred instance deployed:", currency, amount, sacred.address)
      }
    }
  }

  await fs.writeFileSync('../config.json', JSON.stringify(config, null, '  '))
  console.log("Deployed Contract's addresses are saved into config.json!")
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })