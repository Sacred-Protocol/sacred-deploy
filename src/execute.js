require('dotenv').config()
const actions = require('../actions.json')
const abi = require('../abi/deployer.abi.json')

const prefix = {
  1: '',
  42: 'kovan.',
  5: 'goerli.',
}

const explorer = `https://${prefix[process.env.NET_ID]}etherscan.io`

async function deployContracts() {
  const privateKey = process.env.PRIVATE_KEY
  //const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL)
  const provider = ethers.provider
  const testing = ["hardhat", "localhost"].includes(hre.network.name);
  let wallet
  if (testing) {
    const accounts = await ethers.getSigners();
    wallet = accounts[0];
  } else {
    wallet = new ethers.Wallet(privateKey, provider)  
  }

  const deployer = new ethers.Contract(actions.deployer, abi, wallet)
  const deployerProxy = new ethers.Contract(actions.actions[0].expectedAddress, actions.actions[0].abi, wallet)

  for (const action of actions.actions.filter((a) => a.contract !== 'Airdrop.sol')) {
    let code = await provider.getCode(action.expectedAddress)
    if (code && code !== '0x') {
      console.log(`${action.contract} is already deployed`)
      continue
    }
    console.log(`Deploying ${action.contract} to ${action.domain} (${action.expectedAddress})`)
    const dep = action === actions.actions[0] ? deployer : deployerProxy
    const tx = await dep.deploy(action.bytecode, actions.salt, {gasLimit: 20000000})
    console.log(`TX hash ${explorer}/tx/${tx.hash}`)
    try {
      await tx.wait()
      console.log(`Deployed ${action.contract} to ${explorer}/address/${action.expectedAddress}\n`)
      if(action.initArgs) {
        const deployedContract = new ethers.Contract(action.expectedAddress, action.abi, wallet)
        await (await deployedContract.initialize(...action.initArgs)).wait()
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
}

async function main() {
  await deployContracts()
}

main()

module.exports = {
  deployContracts
}
