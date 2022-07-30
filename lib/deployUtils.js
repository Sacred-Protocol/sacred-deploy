require('dotenv').config()
const config = require('../sacred-token/config')
const path = require('path')
const { getCreate2Address } = require('@ethersproject/address')
const { keccak256 } = require('@ethersproject/solidity')
const { ethers } = require("hardhat");

const { DEPLOYER, SALT } = process.env

let addressTable = {}

function init(configData) {
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
      init(data)
    }
  }
}

function setAddress(key, address) {
  addressTable[key] = address
}

function getAddressTable() {
  return addressTable
}

function initAddressTable() {
  init(config)
}

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
  abi = ''
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
    abi: abi ? abi : contract.abi,
    expectedAddress: expAddr,
    title,
    description,
    dependsOn,
  }
}

function ensToAddr(ens) {
  return addressTable[ens]
}

function updateAddressTable(table) {
  addressTable = table
}

module.exports = {
  initAddressTable,
  deploy,
  getContractData,
  ensToAddr,
  updateAddressTable,
  setAddress,
  getAddressTable
}
