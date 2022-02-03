require('dotenv').config()

module.exports = {
  deployments: {
    netId1: {
      eth: {
        instanceAddress: {
          '0.1': '0x9567Ca1cf1B2bcdc88086d4a40De2C7399419DD3',
          '1': '0x0e77E2720871438979052Aa39684F007A13754A0',
          '10': '0x17B21990Cf231aD2Ce277497ba22809008dbFe34',
          '100': '0x1303358E141102f26f424988e4ab5e232b339CF8'
        },
        symbol: 'ETH',
        decimals: 18
      },
      dai: {
        instanceAddress: {
          '100': undefined,
          '1000': undefined,
          '10000': undefined,
          '100000': undefined
        },
        tokenAddress: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
        symbol: 'DAI',
        decimals: 18
      },
    },
    netId42: {
      eth: {
        instanceAddress: {
          '0.1': '0x9567Ca1cf1B2bcdc88086d4a40De2C7399419DD3',
          '1': '0x0e77E2720871438979052Aa39684F007A13754A0',
          '10': '0x17B21990Cf231aD2Ce277497ba22809008dbFe34',
          '100': '0x1303358E141102f26f424988e4ab5e232b339CF8'
        },
        symbol: 'ETH',
        decimals: 18
      },
      dai: {
        instanceAddress: {
          '100': undefined,
          '1000': undefined,
          '10000': undefined,
          '100000': undefined
        },
        tokenAddress: '0x4F96Fe3b7A6Cf9725f59d353F723c1bDb64CA6Aa',
        symbol: 'DAI',
        decimals: 18
      },
    },
    netId80001: {
      eth: {
        instanceAddress: {
          '0.1': '0x7579EBDB311340b214E8A51F015398f2e3c43a66',
          '1': '0xDb74E7527dFDE41fC2476f65980c2480Db0cD1e7',
          '10': '0x28B3575Eec625131851aCd8F5f4591a2093d1A61',
          '100': '0xbF31Adb795C19AF45d9e95930E5324F9082F0098'
        },
        symbol: 'ETH',
        decimals: 18
      }
    },
    netId137: {
      eth: {
        instanceAddress: {
          '0.1': '0x40AB833132aE28D8C1b304d6C78B13234ADC6cb2',
          '1': '0x40AB833132aE28D8C1b304d6C78B13234ADC6cb2',
          '10': '0x40AB833132aE28D8C1b304d6C78B13234ADC6cb2',
          '100': '0x40AB833132aE28D8C1b304d6C78B13234ADC6cb2'
        },
        symbol: 'ETH',
        decimals: 18
      }
    }
  }
}
