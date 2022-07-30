require('dotenv').config()
const { ensToAddr, updateAddressTable} = require('../lib/deployUtils')
const utils = require('../lib/utils')
const actions = require('../actions.json')
const abi = require('../abi/deployer.abi.json')
const config = require('../sacred-token/config')
const instancesInfo = require('../config.json')
const ethSacredAbi = require('../abi/ethSacred.json')
const erc20Abi = require('../abi/erc20.abi.json')
const addressTable = require('../address.json')
const { PRIVATE_KEY, RPC_URL } = process.env

async function deployContracts() {
  const privateKey = PRIVATE_KEY
  await utils.init({instancesInfo, erc20Contract: erc20Abi, RPC_URL})
  const explorer = `https://${utils.getCurrentNetworkName()}etherscan.io`

  let provider = utils.getProvider()
  let wallet = utils.getWalllet()
  updateAddressTable(addressTable)

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
    let sacredInstance = new ethers.Contract(utils.getSacredInstanceAddress(utils.getNetId(), 'eth', instances[i]), ethSacredAbi, wallet)
    const receipt = await (await sacredInstance.setAaveInterestsProxy(ensToAddr(config.aaveInterestsProxy.address))).wait()
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
