const { toWei } = require('web3-utils')

module.exports = {
  governance: { address: 'governance.contract.sacredcash.eth' },
  governanceImpl: { address: 'governance-impl.contract.sacredcash.eth' },
  miningV2: {
    address: 'mining-v2.contract.sacredcash.eth',
    initialBalance: toWei('25000'),
    rates: [
      { currency: "eth", amount: 0.1, value: '10' },
      { currency: "eth", amount: 1,   value: '20' },
      { currency: "eth", amount: 10,  value: '50' },
      { currency: "eth", amount: 100, value: '400' },
      { currency: "dai", amount: 200,    value: '10' },
      { currency: "dai", amount: 2000,   value: '20' },
      { currency: "dai", amount: 20000,  value: '50' },
      { currency: "dai", amount: 200000, value: '400' },
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

