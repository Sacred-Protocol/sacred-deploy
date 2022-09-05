require('dotenv').config({ path: '../.env' })
const verifyData = require('../verifyData.json')

async function main() {

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