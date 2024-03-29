/* global task, ethers */
require('@nomiclabs/hardhat-waffle')
require("@nomiclabs/hardhat-etherscan")
require('dotenv').config({ path: '../.env' })
// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task('accounts', 'Prints the list of accounts', async () => {
  const accounts = await ethers.getSigners()

  for (const account of accounts) {
    console.log(account.address)
  }
})

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config = {
  defaultNetwork: process.env.NETWORK,
  solidity: {
    version: '0.8.9',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      blockGasLimit: 9500000,
    },
  },
  mocha: {
    timeout: 600000,
  },
  etherscan: {
    apiKey: {}
  }
}

if (process.env.NETWORK) {
  config.networks[process.env.NETWORK] = {
    url: process.env.RPC_URL,
    accounts: [process.env.PRIVATE_KEY],
  }
  let netName = process.env.NETWORK
  if(netName === "mumbai") {
    netName = "polygonMumbai"
  }
  config.etherscan.apiKey[netName] = process.env.ETHERSCAN_API_KEY
}
module.exports = config
