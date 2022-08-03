/* global artifacts */
require('dotenv').config({ path: '../.env' })
const ETHSacred = artifacts.require('ETHSacred')
const Verifier = artifacts.require('Verifier')
const hasherContract = artifacts.require('Hasher')


module.exports = function(deployer, network, accounts) {
  return deployer.then(async () => {
    const { MERKLE_TREE_HEIGHT, ETH_AMOUNTS, OPERATOR_FEE, LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY, WETH_TOKEN } = process.env
    const ethAmounts = ETH_AMOUNTS.split(",");
    const verifier = await Verifier.deployed()
    const hasherInstance = await hasherContract.deployed()
    let addresses = []
    for(var i = 0; i < ethAmounts.length; i++) {
      let amount = ethAmounts[i];
      console.log("Deploying ETHSacred instance: ", amount)
      await ETHSacred.link(hasherContract, hasherInstance.address)
      const sacred = await deployer.deploy(
        ETHSacred, 
        verifier.address, 
        amount, 
        MERKLE_TREE_HEIGHT, 
        LENDING_POOL_ADDRESS_PROVIDER,
        WETH_GATEWAY,
        WETH_TOKEN,
        accounts[0], 
        OPERATOR_FEE)
      addresses[i] = sacred.address
    }
    for(var i = 0; i < ethAmounts.length; i++) {
      let amount = ethAmounts[i];
      console.log('' + amount + ' - ETHSacred\'s address ', addresses[i])
    }
  })
}