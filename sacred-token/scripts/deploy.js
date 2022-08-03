require('dotenv').config()
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { toWei } = require('web3-utils')

async function main() {
  const SacredToken = await ethers.getContractFactory("SACRED")
  const sacredToken = await SacredToken.deploy(process.env.AIRDROP_RECEIVER, toWei(process.env.AMOUNT))
  await sacredToken.deployed()
  const balance = await sacredToken.balanceOf(process.env.AIRDROP_RECEIVER)
  console.log("SacredToken deployed to:", sacredToken.address)
  expect(balance).to.equal(toWei(process.env.AMOUNT));
  console.log("Deployed Amounts:", process.env.AMOUNT)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })