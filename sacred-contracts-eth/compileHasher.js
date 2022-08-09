// Generates Hasher artifact at compile-time using Truffle's external compiler
// mechanism
const path = require('path')
const fs = require('fs')
const {poseidonContract} = require('circomlibjs')
const outputPath = path.join(__dirname, 'artifacts/contracts/MerkleTreeWithHistory.sol', 'Hasher.json')

function main () {
  const data = fs.readFileSync(outputPath)
  let contract = JSON.parse(data);
  contract.bytecode = poseidonContract.createCode(2);
  contract.abi = poseidonContract.generateABI(2);
  fs.writeFileSync(outputPath, JSON.stringify(contract, null, 2))
}

main()
