
const action = Object.freeze({ DEPOSIT: 'deposit', WITHDRAWAL: 'withdrawal' })

const prefix = {
  1: '',
  5: 'goerli.',
  42: 'kovan.',
}

const getExplorer = (netId) => `https://${prefix[netId]}etherscan.io`

module.exports = {
  getExplorer,
  action,
}
