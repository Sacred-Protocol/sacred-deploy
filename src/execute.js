require('dotenv').config()
const utils = require('./utils');
const actions = require('../actions.json')
const abi = require('../abi/deployer.abi.json')
const config = require('../sacred-token/config')
const ethSacredAbi = require('../abi/ethSacred.json')
const addressTable = require('../address.json')
const prefix = {
  1: '',
  42: 'kovan.',
  5: 'goerli.',
}
const { PRIVATE_KEY, NET_ID, RPC_URL } = process.env
const explorer = `https://${prefix[NET_ID]}etherscan.io`

async function deployContracts() {
  const privateKey = PRIVATE_KEY
  //const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
  const provider = ethers.provider
  const testing = ["hardhat", "localhost"].includes(hre.network.name);
  let wallet
  if (testing) {
    const accounts = await ethers.getSigners();
    wallet = accounts[0];
  } else {
    wallet = new ethers.Wallet(privateKey, provider)  
  }

  utils.updateAddressTable(addressTable)

  const deployer = new ethers.Contract(actions.deployer, abi, wallet)
  const deployerProxy = new ethers.Contract(actions.actions[0].expectedAddress, actions.actions[0].abi, wallet)
  let gasUsed = BigInt(0)
  for (const action of actions.actions) {
    let code = await provider.getCode(action.expectedAddress)
    if (code && code !== '0x') {
      console.log(`${action.contract} is already deployed`)
      continue
    }
    console.log(`Deploying ${action.contract} to ${action.domain} (${action.expectedAddress})`)
    const dep = deployer
    //const dep = action === actions.actions[0] ? deployer : deployerProxy
    const tx = await dep.deploy(action.bytecode, actions.salt, {gasLimit: 5000000})
    console.log(`TX hash ${explorer}/tx/${tx.hash}`)
    try {
      const receipt = await tx.wait()
      const _gasUsed = BigInt(receipt.cumulativeGasUsed) * BigInt(receipt.effectiveGasPrice);
      gasUsed = gasUsed + _gasUsed
      code = await provider.getCode(action.expectedAddress)
      if (code && code !== '0x') {
        console.log(`Deployed ${action.contract} to ${explorer}/address/${action.expectedAddress}\n`)
      } else {
        console.log(`Failed to deploy ${action.contract}\n`)
        return
      }
    } catch (e) {
      console.error(`Failed to deploy ${action.contract}, sending debug tx`)
      const tx = await wallet.sendTransaction({ gasLimit: 8e6, data: action.bytecode })
      console.log(`TX hash ${explorer}/tx/${tx.hash}`)
      await tx.wait()
      console.log('Mined, check revert reason on etherscan')
      return
      // throw new Error(`Failed to deploy ${action.contract}`)
    }
  }

  for (const action of actions.actions.filter((a) => !!a.initArgs)) {
    let code = await provider.getCode(action.expectedAddress)
    if (code && code !== '0x') {
      console.log(`Initializing ${action.contract}`)
      const deployedContract = new ethers.Contract(action.expectedAddress, action.abi, wallet)
      const receipt = await (await deployedContract.initialize(...action.initArgs)).wait()
      const _gasUsed = BigInt(receipt.cumulativeGasUsed) * BigInt(receipt.effectiveGasPrice);
      gasUsed = gasUsed + _gasUsed
    }
  }

  const instances = [0.1, 1, 10, 100]
  for(let i = 0; i < instances.length; i++) {
    let sacredInstance = new ethers.Contract(utils.getSacredInstanceAddress(NET_ID, 'eth', instances[i]), ethSacredAbi, wallet)
    const receipt = await (await sacredInstance.setAaveInterestsProxy(utils.ensToAddr(config.aaveInterestsProxy.address))).wait()
    const _gasUsed = BigInt(receipt.cumulativeGasUsed) * BigInt(receipt.effectiveGasPrice);
    gasUsed = gasUsed + _gasUsed
  }

  console.log("Total used gas: ", gasUsed.toString())
}

async function main() {
  await deployContracts()
}

main()

module.exports = {
  deployContracts
}
