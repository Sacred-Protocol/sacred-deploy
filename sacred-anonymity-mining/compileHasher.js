// Generates Hasher artifact at compile-time using Truffle's external compiler
// mechanism
const path = require('path')
const fs = require('fs')
const {poseidonContract} = require('circomlibjs')

// where Truffle will expect to find the results of the external compiler
// command
const outputPath = path.join(__dirname, 'build', 'contracts')
const outputPath1 = path.join(outputPath, 'Hasher.json')

if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true })
}

function main() {
  const contract = {
    contractName: 'Hasher',
    abi: poseidonContract.generateABI(1),
    bytecode: poseidonContract.createCode(1),
  }

  fs.writeFileSync(outputPath1, JSON.stringify(contract, null, 2))
}

main()
