require('dotenv').config({ path: '../.env' })
const fs = require('fs')
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { toWei } = require('web3-utils')
const baseUtils = require('../../sacred-contracts-eth/lib/baseUtils')
const deployedInfo = require('../../config.json')

const { RPC_URL } = process.env
async function main() {
  await baseUtils.init(RPC_URL)
  const provider = await baseUtils.getProvider()
  const { chainId } = await provider.getNetwork()

  const SacredToken = await ethers.getContractFactory("SACRED")
  const sacredToken = await SacredToken.deploy(process.env.AIRDROP_RECEIVER, toWei(process.env.AMOUNT))
  await sacredToken.deployed()
  const balance = await sacredToken.balanceOf(process.env.AIRDROP_RECEIVER)
  deployedInfo.sacredToken["" + chainId] = sacredToken.address
  console.log("SacredToken deployed to:", sacredToken.address)
  expect(balance).to.equal(toWei(process.env.AMOUNT));
  console.log("Deployed Amounts:", process.env.AMOUNT)
  await fs.writeFileSync('../config.json', JSON.stringify(deployedInfo, null, '  '))
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })