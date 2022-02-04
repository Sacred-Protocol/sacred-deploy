/* global task, ethers */
require('@nomiclabs/hardhat-waffle')
require('dotenv').config()
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
    version: '0.6.12',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: process.env.RPC_URL,
        timeout: 120000000000,
        // blockNumber: 12552123
      },
      blockGasLimit: 20000000000,
      timeout: 12000000,
      gas: "auto",
    },
    kovan: {
      url: process.env.RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
      blockGasLimit: 20000000000,
    },
    mumbai: {
      url: process.env.RPC_URL,
      blockGasLimit: 20000000000,
      accounts: [process.env.PRIVATE_KEY],
    },
    matic: {
      url: process.env.RPC_URL,
      blockGasLimit: 20000000000,
      gasPrice: 100000000000000,
      accounts: [process.env.PRIVATE_KEY],
    },
  },
  mocha: {
    timeout: 600000,
  },
}

module.exports = config
