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
    compilers: [
      {
        version: "0.6.12",
      },
      {
        version: '0.8.9',
      },
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
  },
  mocha: {
    timeout: 600000,
  },
}

if (process.env.NETWORK) {
  if(process.env.NETWORK !== "hardhat") {
    config.networks[process.env.NETWORK] = {
      url: process.env.RPC_URL,
      accounts: [process.env.PRIVATE_KEY],
    }
  } else {
    config.networks["hardhat"] = {
      forking: {
        url: process.env.RPC_URL,
        timeout: 120000000000,
      },
      blockGasLimit: 30000000,
    }
  }
}
module.exports = config
