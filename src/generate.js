require('dotenv').config()
const fs = require('fs')
const ethers = require('ethers')
const { formatEther } = ethers.utils
const config = require('../sacred-token/config')
const get = require('get-value')
const { deploy, getContractData, zeroMerkleRoot, ensToAddr } = require('./utils')

const { DEPLOYER, SALT, AIRDROP_CHUNK_SIZE } = process.env

const airdrop = getContractData('../sacred-token/artifacts/contracts/Airdrop.sol/Airdrop.json')
const deployer = getContractData('../deployer/artifacts/contracts/Deployer.sol/Deployer.json')
const sacred = getContractData('../sacred-token/artifacts/contracts/SACRED.sol/SACRED.json')
const vesting = getContractData('../sacred-token/artifacts/contracts/Vesting.sol/Vesting.json')
const voucher = getContractData('../sacred-token/artifacts/contracts/Voucher.sol/Voucher.json')
const governance = getContractData('../sacred-governance/artifacts/contracts/Governance.sol/Governance.json')
const governanceProxy = getContractData('../sacred-governance/artifacts/contracts/LoopbackProxy.sol/LoopbackProxy.json')
const miner = getContractData('../sacred-anonymity-mining/artifacts/contracts/Miner.sol/Miner.json')
const rewardSwap = getContractData('../sacred-anonymity-mining/artifacts/contracts/RewardSwap.sol/RewardSwap.json')
const sacredTrees = getContractData('../sacred-anonymity-mining/artifacts/sacred-trees/contracts/SacredTrees.sol/SacredTrees.json')
// const sacredProxy = getContractData('../sacred-anonymity-mining/artifacts/contracts/SacredProxy.json')
// const poseidonHasher2 = getContractData('../sacred-anonymity-mining/artifacts/contracts/Hasher2.json')
// const poseidonHasher3 = getContractData('../sacred-anonymity-mining/artifacts/contracts/Hasher3.json')
const rewardVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/RewardVerifier.sol/RewardVerifier.json')
const withdrawVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/WithdrawVerifier.sol/WithdrawVerifier.json')
const treeUpdateVerifier = getContractData('../sacred-anonymity-mining/artifacts/contracts/verifiers/TreeUpdateVerifier.sol/TreeUpdateVerifier.json')

const actions = []

actions.push(
  deploy({
    domain: config.deployer.address,
    contract: deployer,
    args: ['0x0000000000000000000000000000000000000000'],
    dependsOn: [],
    title: 'Deployment proxy',
    description:
      'This a required contract to initialize all other contracts. It is simple wrapper around EIP-2470 Singleton Factory that emits an event of contract deployment. The wrapper also validates if the deployment was successful.',
  }),
)

// Deploy Governance implementation
actions.push(
  deploy({
    domain: config.governance.address,
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
    args: [ensToAddr(config.governance.address), config.sacred.pausePeriod],
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
    args: [ensToAddr(config.governance.address), initData],
    dependsOn: [config.deployer.address, config.governance.address],
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

// // Deploy PoseidonHasher2
// actions.push(
//   deploy({
//     domain: config.poseidonHasher2.address,
//     contract: poseidonHasher2,
//     title: 'Poseidon hasher 2',
//     description: 'Poseidon hash function for 2 arguments',
//   }),
// )

// // Deploy PoseidonHasher3
// actions.push(
//   deploy({
//     domain: config.poseidonHasher3.address,
//     contract: poseidonHasher3,
//     title: 'Poseidon hasher 3',
//     description: 'Poseidon hash function for 3 arguments',
//   }),
// )

// // Deploy SacredProxy
// const instances = config.miningV2.rates.map((rate) => ensToAddr(rate.instance))
// actions.push(
//   deploy({
//     domain: config.sacredProxy.address,
//     contract: sacredProxy,
//     args: [ensToAddr(config.sacredTrees.address), ensToAddr(config.governance.address), instances],
//     title: 'SacredCash Proxy',
//     description:
//       'Proxy contract for sacred.cash deposits and withdrawals that records block numbers for mining',
//   }),
// )

// Deploy SacredTrees
actions.push(
  deploy({
    domain: config.sacredTrees.address,
    contract: sacredTrees,
    args: [
      ensToAddr(config.governance.address)
    ],
    title: 'SacredTrees',
    description: 'Merkle tree with information about sacred cash deposits and withdrawals',
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
      ensToAddr(config.rewardSwap.address),
      ensToAddr(config.governance.address),
      ensToAddr(config.sacredTrees.address),
      [
        ensToAddr(config.rewardVerifier.address),
        ensToAddr(config.withdrawVerifier.address),
        ensToAddr(config.treeUpdateVerifier.address),
      ],
      zeroMerkleRoot,
      rates,
    ],
    title: 'Miner',
    description: 'Mining contract for Anonymity Points',
  }),
)

// Set args for RewardSwap Initialization
actions[rewardSwapActionIndex].initArgs = [
  ensToAddr(config.miningV2.address)
]

// Deploy Voucher
actions.push(
  deploy({
    domain: config.voucher.address,
    contract: voucher,
    args: [
      ensToAddr(config.sacred.address),
      ensToAddr(config.governance.address),
      config.voucher.duration * 2592000, // 60 * 60 * 24 * 30
    ],
    title: 'Voucher',
    description: 'SacredCash voucher contract for early adopters',
  }),
)
const voucherActionIndex = actions.length - 1

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
  distribution
]

// Starting AirDrop
const airdropActions = []
const list = fs
  .readFileSync('./airdrop/airdrop.csv')
  .toString()
  .split('\n')
  .map((a) => a.split(','))
  .filter((a) => a.length === 2)
  .map((a) => ({ to: a[0], amount: ethers.BigNumber.from(a[1]) }))

const total = list.reduce((acc, a) => acc.add(a.amount), ethers.BigNumber.from(0))
const expectedAirdrop = ethers.BigNumber.from(config.sacred.distribution.airdrop.amount)
if (total.gt(expectedAirdrop)) {
  console.log(
    `Total airdrop amount ${formatEther(total)} is greater than expected ${formatEther(expectedAirdrop)}`,
  )
  process.exit(1)
}
console.log('Airdrop amount:', formatEther(total))
console.log('Airdrop expected:', formatEther(expectedAirdrop))

let i = 0
while (list.length) {
  i++
  const chunk = list.splice(0, AIRDROP_CHUNK_SIZE)
  const total = chunk.reduce((acc, a) => acc.add(a.amount), ethers.BigNumber.from(0))
  airdropActions.push(
    deploy({
      amount: total.toString(),
      contract: airdrop,
      args: [ensToAddr(config.voucher.address), chunk],
      dependsOn: [config.deployer.address, config.voucher.address],
      title: `Airdrop Voucher ${i}`,
      description: 'Early adopters voucher coupons',
    }),
  )
}

// Set args for Voucher Initialization
const airdrops = airdropActions.map((a) => ({ to: a.expectedAddress, amount: a.amount }))
actions[voucherActionIndex].initArgs = [
  airdrops
]

// Write output
const result = {
  deployer: DEPLOYER,
  salt: SALT,
  actions: actions.concat(airdropActions),
}
fs.writeFileSync('actions.json', JSON.stringify(result, null, '  '))
console.log('Created actions.json')
