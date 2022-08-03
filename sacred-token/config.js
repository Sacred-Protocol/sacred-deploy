const { toWei } = require('web3-utils')

module.exports = {
  governance: { address: 'governance.contract.sacredcash.eth' },
  governanceImpl: { address: 'governance-impl.contract.sacredcash.eth' },
  miningV2: {
    address: 'mining-v2.contract.sacredcash.eth',
    initialBalance: toWei('25000'),
    rates: [
      { instance: 'eth-01.sacredcash.eth', value: '10' },
      { instance: 'eth-1.sacredcash.eth', value: '20' },
      { instance: 'eth-10.sacredcash.eth', value: '50' },
      { instance: 'eth-100.sacredcash.eth', value: '400' },
    ],
  },
  rewardSwap: { address: 'reward-swap.contract.sacredcash.eth', poolWeight: 1e11 },
  sacredTrees: { address: 'sacred-trees.contract.sacredcash.eth'},
  sacredTreesImpl: { address: 'sacred-trees-impl.contract.sacredcash.eth'},
  sacredProxy: { address: 'sacred-proxy.contract.sacredcash.eth' },
  sacredEchoer: { address: 'sacred-echoer.contract.sacredcash.eth' },
  aaveInterestsProxy: { address: 'aave-interests-proxy.contract.sacredcash.eth'},
  rewardVerifier: { address: 'reward-verifier.contract.sacredcash.eth' },
  treeUpdateVerifier: { address: 'tree-update-verifier.contract.sacredcash.eth' },
  withdrawVerifier: { address: 'withdraw-verifier.contract.sacredcash.eth' },
  poseidonHasher1: { address: 'poseidon1.contract.sacredcash.eth' },
  poseidonHasher2: { address: 'poseidon2.contract.sacredcash.eth' },
  poseidonHasher3: { address: 'poseidon3.contract.sacredcash.eth' },
  deployer: { address: 'deployer.contract.sacredcash.eth' },
}

