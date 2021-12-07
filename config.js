require('dotenv').config()

module.exports = {
  deployments: {
    netId1: {
      eth: {
        instanceAddress: {
          '0.01' : '0x449EfDAdB9Dd5143a429A661c9161b01eDdaD81b',
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
          '0.01' : '0x449EfDAdB9Dd5143a429A661c9161b01eDdaD81b',
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
          '0.01' : '0x449EfDAdB9Dd5143a429A661c9161b01eDdaD81b',
          '0.1': '0x9567Ca1cf1B2bcdc88086d4a40De2C7399419DD3',
          '1': '0x9567Ca1cf1B2bcdc88086d4a40De2C7399419DD3',
          '10': '0x9567Ca1cf1B2bcdc88086d4a40De2C7399419DD3',
          '100': '0x9567Ca1cf1B2bcdc88086d4a40De2C7399419DD3'
        },
        symbol: 'ETH',
        decimals: 18
      }
    }
  }
}
