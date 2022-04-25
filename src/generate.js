require('dotenv').config()
const fs = require('fs')
const ethers = require('ethers')
const config = require('../sacred-token/config')
const get = require('get-value')
const { deploy, getContractData, zeroMerkleRoot, ensToAddr, addressTable } = require('./utils')
const { DEPLOYER, SALT, WETH_TOKEN, MINIMUM_INTERESTS, INTERESTS_FEE } = process.env

const sacred = getContractData('../sacred-token/artifacts/contracts/SACRED.sol/SACRED.json')
const vesting = getContractData('../sacred-token/artifacts/contracts/Vesting.sol/Vesting.json')
const governance = getContractData('../sacred-governance/artifacts/contracts/Governance.sol/Governance.json')
const governanceProxy = getContractData('../sacred-governance/artifacts/contracts/LoopbackProxy.sol/LoopbackProxy.json')
const miner = getContractData('../sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const rewardSwap = getContractData('../sacred-anonymity-mining/artifacts/contracts/RewardSwap.sol/RewardSwap.json')
const sacredTrees = getContractData('../sacred-trees/artifacts/contracts/SacredTrees.sol/SacredTrees.json')
const adminUpgradeableProxy = getContractData('../sacred-trees/artifacts/contracts/AdminUpgradeableProxy.sol/AdminUpgradeableProxy.json')
const batchTreeUpdateVerifier = getContractData('../sacred-trees/artifacts/contracts/verifiers/BatchTreeUpdateVerifier.sol/BatchTreeUpdateVerifier.json')
const sacredProxy = getContractData('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.sol/SacredProxy.json')
const aaveInterestsProxy = getContractData('../sacred-anonymity-mining/artifacts/contracts/AaveInterestsProxy.sol/AaveInterestsProxy.json')
const rewardVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/RewardVerifier.sol/RewardVerifier.json')
const withdrawVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/WithdrawVerifier.sol/WithdrawVerifier.json')
const treeUpdateVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/TreeUpdateVerifier.sol/TreeUpdateVerifier.json')
const poseidonHasher = getContractData('../sacred-anonymity-mining/build/contracts/Hasher.json')
// const verifier2 = getContractData('../sacred-pool/artifacts/contracts/Verifier2.sol/Verifier2.json')
// const verifier16 = getContractData('../sacred-pool/artifacts/contracts/Verifier16.sol/Verifier16.json')
// const sacredPool = getContractData('../sacred-pool/artifacts/contracts/SacredPool.sol/SacredPool.json')
// const upgradeableProxy = getContractData(
//   '../sacred-pool/artifacts/contracts/CrossChainUpgradeableProxy.sol/CrossChainUpgradeableProxy.json',
// )

const actions = []

// Deploy Governance implementation
actions.push(
  deploy({
    domain: config.governanceImpl.address,
    contract: governance,
    title: 'Governance implementation',
    description: 'Initial implementation of upgradable governance contract',
  }),
)

// Deploy SACRED
actions.push(
  deploy({
    domain: config.sacred.address,
    contract: sacred,
    args: [config.sacred.pausePeriod],
    title: 'SACRED token',
    description: 'Sacred.cash governance token',
  }),
)
const sacredActionIndex = actions.length - 1

// Deploy Governance proxy
const governanceContract = new ethers.utils.Interface(governance.abi)
const initData = governanceContract.encodeFunctionData('initialize', [ensToAddr(config.sacred.address)])
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

// Deploy RewardSwap
actions.push(
  deploy({
    domain: config.rewardSwap.address,
    contract: rewardSwap,
    args: [
      ensToAddr(config.sacred.address),
      config.sacred.distribution.miningV2.amount,
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
    args: [ensToAddr(config.sacredTrees.address), ensToAddr(config.governance.address), instances],
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
      zeroMerkleRoot,
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

// Deploy Vestings
config.vesting.governance.beneficiary = actions.find(
  (a) => a.domain === 'governance.contract.sacredcash.eth',
).expectedAddress
const vestings = Object.values(config.vesting)
for (const [i, vest] of vestings.entries()) {
  actions.push(
    deploy({
      domain: vest.address,
      contract: vesting,
      args: [ensToAddr(config.sacred.address), vest.beneficiary, 0, vest.cliff, vest.duration],
      title: `Vesting ${i + 1} / ${vestings.length}`,
      description: `Vesting contract for ${vest.address}`,
    }),
  )
}

// Set args for RewardSwap Initialization
const distribution = Object.values(config.sacred.distribution).map(({ to, amount }) => ({
  to: ensToAddr(get(config, to).address),
  amount,
}))
console.log(distribution)
actions[sacredActionIndex].initArgs = [
  ensToAddr(config.governance.address), 
  distribution
]

// sacred-pool
// actions.push(
//   deploy({
//     domain: 'verifier2.contract.sacredcash.eth',
//     contract: verifier2,
//     title: 'Verifier2',
//     description: 'zkSNARK verifier contract for 2 input operations'
//   }),
// )

// actions.push(
//   deploy({
//     domain: 'verifier16.contract.sacredcash.eth',
//     contract: verifier16,
//     title: 'Verifier16',
//     description: 'zkSNARK verifier contract for 16 input operations'
//   }),
// )

// const tree = new MerkleTree(MERKLE_TREE_HEIGHT, [], { hashFunction: poseidonHash2 })
// const root = tree.root()
// actions.push(
//   deploy({
//     domain: 'sacredPool.contract.sacredcash.eth',
//     contract: sacredPool,
//     title: 'Sacred Pool implementation',
//     description: 'Sacred Pool proxy implementation',
//     dependsOn: [
//       'verifier2.contract.sacredcash.eth',
//       'verifier16.contract.sacredcash.eth',
//     ],
//     args: [
//       ensToAddr('verifier2.contract.sacredcash.eth'),
//       ensToAddr('verifier16.contract.sacredcash.eth')
//     ],
//   }),
// )
// const poolActionIndex = actions.length - 1
// actions[poolActionIndex].initArgs = [
//   toFixedHex(root)
// ]

// // Deploy Proxy
// const crossDomainMessenger = '0x4200000000000000000000000000000000000007'
// actions.push(
//   deploy({
//     domain: 'proxy.contract.sacredcash.eth',
//     contract: upgradeableProxy,
//     title: 'Cross-chain Upgradeable Proxy',
//     description: 'Upgradability proxy contract for Sacred Pool owned by SacredCash governance',
//     dependsOn: ['deployerL2.contract.sacredcash.eth', 'sacredPool.contract.sacredcash.eth'],
//     args: [
//       ensToAddr('sacredPool.contract.sacredcash.eth'),
//       ensToAddr(config.governance.address),
//       [],
//       crossDomainMessenger,
//     ],
//   }),
// )

// Write output
const result = {
  deployer: DEPLOYER,
  salt: SALT,
  actions
}

fs.writeFileSync('actions.json', JSON.stringify(result, null, '  '))
console.log('Created actions.json')

fs.writeFileSync('address.json', JSON.stringify(addressTable, null, '  '))
console.log('Created address.json')
