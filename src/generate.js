require('dotenv').config()
const fs = require('fs')
const { toWei } = require('web3-utils')
const config = require('../sacred-token/config')
const instancesInfo = require('../config.json')
const erc20Abi = require('../abi/erc20.abi.json')
const utils = require('../lib/utils')
const { deploy, getContractData, ensToAddr, getAddressTable, setAddress, initAddressTable } = require('../lib/deployUtils')
const { DEPLOYER, SALT, MINIMUM_INTERESTS, INTERESTS_FEE, SACRED_TOKEN, REWARDSWAP_MINING_CAP } = process.env

const governance = getContractData('../sacred-governance/artifacts/contracts/Governance.sol/Governance.json')
const governanceProxy = getContractData('../sacred-governance/artifacts/contracts/LoopbackProxy.sol/LoopbackProxy.json')
const miner = getContractData('../sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const rewardSwap = getContractData('../sacred-anonymity-mining/artifacts/contracts/RewardSwap.sol/RewardSwap.json')
const sacredTrees = getContractData('../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const adminUpgradeableProxy = getContractData('../sacred-trees/artifacts/contracts/AdminUpgradeableProxy.sol/AdminUpgradeableProxy.json')
const batchTreeUpdateVerifier = getContractData('../sacred-trees/artifacts/contracts/verifiers/BatchTreeUpdateVerifier.sol/BatchTreeUpdateVerifier.json')
const sacredProxy = getContractData('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const sacredEchoer = getContractData('../sacred-anonymity-mining/artifacts/contracts/utils/Echoer.sol/Echoer.json')
const aaveInterestsProxy = getContractData('../sacred-anonymity-mining/artifacts/contracts/AaveInterestsProxy.sol/AaveInterestsProxy.json')
const rewardVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/RewardVerifier.sol/RewardVerifier.json')
const withdrawVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/WithdrawVerifier.sol/WithdrawVerifier.json')
const treeUpdateVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/TreeUpdateVerifier.sol/TreeUpdateVerifier.json')
const poseidonHasher = getContractData('../sacred-anonymity-mining/build/contracts/Hasher.json')
const actions = []
const {  RPC_URL } = process.env

async function main() {

  await utils.init({instancesInfo, erc20Contract: erc20Abi, rpc: RPC_URL})
  let wallet = utils.getWalllet()
  const netId = utils.getNetId()
  console.log("owner address: ", wallet.address)
  initAddressTable()
  setAddress('eth-01.sacredcash.eth', utils.getSacredInstanceAddress(netId, "eth", 0.1))
  setAddress('eth-1.sacredcash.eth', utils.getSacredInstanceAddress(netId, "eth", 1))
  setAddress('eth-10.sacredcash.eth', utils.getSacredInstanceAddress(netId, "eth", 10))
  setAddress('eth-100.sacredcash.eth', utils.getSacredInstanceAddress(netId, "eth", 100))
  // Deploy Governance implementation
  actions.push(
    deploy({
      domain: config.governanceImpl.address,
      contract: governance,
      title: 'Governance implementation',
      description: 'Initial implementation of upgradable governance contract',
    }),
  )

  // Deploy Governance proxy
  const governanceContract = new ethers.utils.Interface(governance.abi)
  const initData = governanceContract.encodeFunctionData('initialize', [SACRED_TOKEN])
  actions.push(
    deploy({
      domain: config.governance.address,
      contract: governanceProxy,
      args: [ensToAddr(config.governanceImpl.address), initData],
      dependsOn: [config.governanceImpl.address],
      title: 'Governance Upgradable Proxy',
      description:
        'EIP-1167 Upgradable Proxy for Governance. It can only be upgraded through a proposal by SACRED holders',
    }),
  )

  // Deploy Verifiers
  actions.push(
    deploy({
      domain: config.rewardVerifier.address,
      contract: rewardVerifier,
      title: 'Reward Verifier',
      description: 'ZkSnark verifier smart contract for mining rewards',
    }),
  )
  actions.push(
    deploy({
      domain: config.withdrawVerifier.address,
      contract: withdrawVerifier,
      title: 'Withdraw Verifier',
      description: 'ZkSnark verifier smart contract for reward withdrawals',
    }),
  )
  actions.push(
    deploy({
      domain: config.treeUpdateVerifier.address,
      contract: treeUpdateVerifier,
      title: 'Tree Update Verifier',
      description: 'ZkSnark verifier smart contract for validation for account merkle tree updates',
    }),
  )

  // Deploy Echoer
  actions.push(
    deploy({
      domain: config.sacredEchoer.address,
      contract: sacredEchoer,
      title: 'Echoer',
      description: 'Echoer smart contract for on-chain backup system of AccountKey',
    }),
  )

  // Deploy RewardSwap
  actions.push(
    deploy({
      domain: config.rewardSwap.address,
      contract: rewardSwap,
      args: [
        wallet.address,
        SACRED_TOKEN,
        toWei(REWARDSWAP_MINING_CAP),
        config.miningV2.initialBalance,
        config.rewardSwap.poolWeight
      ],
      title: 'Reward Swap',
      description: 'AMM that allows to swap Anonymity Points to SACRED',
    }),
  )

  const rewardSwapActionIndex = actions.length - 1

  // Deploy BatchTreeUpdateVerifier
  actions.push(
    deploy({
      domain: "batchTreeUpdateVerifier.contract.sacredcash.eth",
      contract: batchTreeUpdateVerifier,
      args: [],
      title: 'BatchTreeUpdateVerifier',
      description: 'BatchTreeUpdateVerifier',
    }),
  )

  // Deploy SacredTreesImpl
  actions.push(
    deploy({
      domain: config.sacredTreesImpl.address,
      contract: sacredTrees,
      args: [
        wallet.address,
        ensToAddr(config.governance.address)
      ],
      title: 'SacredTreesImpl',
      description: 'Merkle tree with information about sacred cash deposits and withdrawals',
    }),
  )

  // Deploy SacredTrees
  actions.push(
    deploy({
      domain: config.sacredTrees.address,
      contract: adminUpgradeableProxy,
      args: [
        ensToAddr(config.sacredTreesImpl.address),
        ensToAddr(config.governance.address),
        ethers.utils.hexlify(ethers.utils.toUtf8Bytes(""))
      ],
      title: 'SacredTrees',
      description: 'Proxy to connect to SacredTreeImpl',
      abi: sacredTrees.abi
    }),
  )

  const sacredTreeActionIndex = actions.length - 1;

  // Deploy PoseidonHasher
  actions.push(
    deploy({
      domain: config.poseidonHasher1.address,
      contract: poseidonHasher,
      title: 'Poseidon hasher 1',
      description: 'Poseidon hash function for 1 arguments',
    }),
  )

  // Deploy SacredProxy
  //const instances = config.miningV2.rates.map((rate) => ensToAddr(rate.instance))
  //TornadoTreeV2 was deployed through proposalContract
  //https://etherscan.io/address/0x722122df12d4e14e13ac3b6895a86e84145b6967#code
  const instances = config.miningV2.rates.map((rate) => ({
    addr: ensToAddr(rate.instance),
    instance: {
      isERC20: false,
      token: ethers.constants.AddressZero,
      state: 2 //"MINEABLE"
    },
  }))

  actions.push(
    deploy({
      domain: config.sacredProxy.address,
      contract: sacredProxy,
      args: [
        wallet.address, 
        ensToAddr(config.sacredTrees.address), 
        ensToAddr(config.governance.address), 
        instances],
      title: 'SacredCash Proxy',
      description:
        'Proxy contract for sacred.cash deposits and withdrawals that records block numbers for mining',
    }),
  )

  const sacredProxyActionIndex = actions.length - 1;

  actions[sacredTreeActionIndex].initArgs = [
    ensToAddr(config.sacredProxy.address),
    ensToAddr("batchTreeUpdateVerifier.contract.sacredcash.eth"),
    "0x29f9a0a07a22ab214d00aaa0190f54509e853f3119009baecb0035347606b0a9"
  ];

  // Deploy AaveInterestsProxy
  actions.push(
    deploy({
      domain: config.aaveInterestsProxy.address,
      contract: aaveInterestsProxy,
      args: [wallet.address],
      title: 'AaveInterestsProxy',
      description: 'AaveInterestsProxy collect aave interests from ETHSacred instances',
    }),
  )

  // Deploy Miner
  const rates = config.miningV2.rates.map((rate) => ({
    instance: ensToAddr(rate.instance),
    value: rate.value,
  }))

  actions.push(
    deploy({
      domain: config.miningV2.address,
      contract: miner,
      args: [
        {
          rewardSwap: ensToAddr(config.rewardSwap.address),
          governance: ensToAddr(config.governance.address),
          sacredTrees: ensToAddr(config.sacredTrees.address),
          sacredProxy: ensToAddr(config.sacredProxy.address),
          aaveInterestsProxy: ensToAddr(config.aaveInterestsProxy.address)
        },
        [
          ensToAddr(config.rewardVerifier.address),
          ensToAddr(config.withdrawVerifier.address),
          ensToAddr(config.treeUpdateVerifier.address),
        ],
        ensToAddr(config.poseidonHasher1.address),
        utils.zeroMerkleRoot,
        rates,
        MINIMUM_INTERESTS,
        INTERESTS_FEE
      ],
      title: 'Miner',
      description: 'Mining contract for Anonymity Points',
    }),
  )

  // Set args for RewardSwap Initialization
  actions[rewardSwapActionIndex].initArgs = [
    ensToAddr(config.miningV2.address)
  ]

  // Set args for SacredProxy Initialization
  actions[sacredProxyActionIndex].initArgs = [
    ensToAddr(config.miningV2.address)
  ];

  // Write output
  const result = {
    deployer: DEPLOYER,
    salt: SALT,
    actions
  }

  fs.writeFileSync('actions.json', JSON.stringify(result, null, '  '))
  console.log('Created actions.json')

  fs.writeFileSync('address.json', JSON.stringify(getAddressTable(), null, '  '))
  console.log('Created address.json')

}

main()