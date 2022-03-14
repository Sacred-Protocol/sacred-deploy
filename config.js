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
          '0.1': '0x19A00D7ed42e80f3fD6AA70F98ca5D967efeBDB4',
          '1': '0x79fF36Ca369b77c4bEd720145957C21b562A737f',
          '10': '0x4e0AD597BC5ee2751c317A5581325AcBD0675683',
          '100': '0x786c3d908B3F009B3336e9228E85E1D052aBa49C'
        },
        symbol: 'ETH',
        decimals: 18
      }
    },
    netId4: {
      eth: {
        instanceAddress: {
          '0.1': '0x13742E4Ed90B6ff8B73A763670ae6FAbb250767c',
          '1': '0x6944D64CC1487a2715EE35aef617f8767DF0815e',
          '10': '0xacAc54F75481f6b9A0aEEd56cFeC4919D358DA18',
          '100': '0xB686582F130c772938cCe587ea0820a2542aD864'
        },
        symbol: 'ETH',
        decimals: 18
      }
    }
  }
}
