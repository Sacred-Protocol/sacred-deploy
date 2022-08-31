require('dotenv').config({ path: '../.env' })
const actions = require('../../actions.json')

async function main() {

  let verifyData = []
  const contracts = ["AaveInterestsProxy.sol", "Miner.sol", "RewardSwap.sol", "SacredProxy.sol"]
  actions.actions.forEach(action => {
    if(contracts.includes(action.contract)) {
      const contractName = action.contract.replace(".sol", "")
      verifyData.push({
        contract: `contracts/${action.contract}:${contractName}`,
        address: action.expectedAddress,
        constructorArguments: action.constructorArgs
      })
    }
  })

  for(let i = 0; i < verifyData.length; i++) {
    console.log("Processing Etherscan Verification:", verifyData[i].address)
    try {
      await hre.run("verify:verify", verifyData[i]);
    } catch (e) {
      console.log(e.message)
    }
  }
  
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })