require('dotenv').config()
const config = require('../sacred-token/config')
const path = require('path')
const { getCreate2Address } = require('@ethersproject/address')
const { keccak256 } = require('@ethersproject/solidity')
const ethers = require('ethers')
const MerkleTree = require('fixed-merkle-tree')
const { poseidon } = require('circomlib')
const tokenConfig = require('../config')

const { DEPLOYER, SALT, NET_ID } = process.env

let addressTable = {}

function initAddressTable(configData) {
  let keys = Object.keys(configData)
  for (var i = 0; i < keys.length; ++i) {
    let data = configData[keys[i]]
    if(data instanceof Object) {
      if(data.address) {
        addressTable[data.address] = ""
      }
      if(data.instance) {
        addressTable[data.instance] = ""
      }
      initAddressTable(data)
    }
  }
 
}

initAddressTable(config)
addressTable['eth-01.tornadocash.eth'] = tokenConfig.deployments["netId" + NET_ID].eth.instanceAddress['0.1']
addressTable['eth-1.tornadocash.eth'] = tokenConfig.deployments["netId" + NET_ID].eth.instanceAddress['1']
addressTable['eth-10.tornadocash.eth'] = tokenConfig.deployments["netId" + NET_ID].eth.instanceAddress['10']
addressTable['eth-100.tornadocash.eth'] = tokenConfig.deployments["netId" + NET_ID].eth.instanceAddress['100']

const poseidonHash = (items) => poseidon(items)
const poseidonHash2 = (a, b) => poseidonHash([a, b])
const merkleTree = new MerkleTree(20, [], { hashFunction: poseidonHash2 })
const zeroMerkleRoot =
  '0x' +
  merkleTree
    .root()
    .toString(16)
    .padStart(32 * 2, '0')

function getContractData(contractPath) {
  const json = require(contractPath)
  return {
    bytecode: json.bytecode,
    abi: json.abi,
    name: path.basename(contractPath, '.json'),
  }
}

function getAddress(bytecode) {
  const initHash = keccak256(['bytes'], [bytecode])
  return getCreate2Address(DEPLOYER, SALT, initHash)
}

function deploy({
  domain,
  amount,
  contract,
  args,
  title = '',
  description = '',
  dependsOn = [config.deployer.address],
}) {
  console.log('Generating deploy for', contract.name)
  let bytecode = contract.bytecode
  if (args) {
    const c = new ethers.ContractFactory(contract.abi, contract.bytecode)
    bytecode = c.getDeployTransaction(...args).data
  }
  const expAddr = getAddress(bytecode)
  addressTable[domain] = expAddr
  return {
    domain,
    amount,
    contract: contract.name + '.sol',
    bytecode,
    abi: contract.abi,
    expectedAddress: expAddr,
    title,
    description,
    dependsOn,
  }
}

function ensToAddr(ens) {
  return addressTable[ens]
}

module.exports = {
  deploy,
  getContractData,
  zeroMerkleRoot,
  addressTable,
  ensToAddr
}
