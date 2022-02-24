## Dependencies

1. node 12
2. yarn
3. zkutil (`brew install rust && cargo install zkutil`) (needed only for circuit compilation and setup)


##  How to deploy it

### Related Repositories

1. SubModules
- https://github.com/Sacred-Finance/sacred-anonymity-mining
- https://github.com/Sacred-Finance/sacred-token
- https://github.com/Sacred-Finance/sacred-trees
- https://github.com/Sacred-Finance/sacred-governance

2. Sacred Pool
https://github.com/Sacred-Finance/sacred-contracts-eth

### Deploy Sacred Pool first
- Clone Repository
```
git clone sacred-contracts-eth
cd sacred-contracts-eth
```
- Copy .env.example and setup
`ETH_AMOUNT`: denomination amount for a sacred pool, it's WEI value for one of 0.1, 1, 10 and 100ETH  
`OPERATOR_FEE`: default is 50(0.5%), the value range is 0, 1(0.01%) ~ 1000(10%)  
`LENDING_POOL_ADDRESS_PROVIDER`: AAVE LendingPoolAddressesProvider Contract Address  
`WETH_GATEWAY`: AAVE WETHGateway contract address  
`WETH_TOKEN `: aWETH token address  
Please check Aave document for LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY and WETH_TOKEN  
https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses  
- `yarn build` 
- `yarn migrate:kovan`
if you want to deploy it on mumbai, 
`yarn migrate:mumbai`

- Default ETH_AMOUNT is 0.1ETH, if you want to deploy it for another ETH unit, need to update ETH_AMOUNT in .env, and please repeat the deploy process
- Fill config.js with the deployed instance addresses.

### Deploy Others
- Clone Sacred-Deploy
```
git clone https://github.com/Sacred-Finance/sacred-deploy.git
```
- Pull sub modules
``` 
cd sacred-deploy
git submodule update --init --recursive
```
- Fill config.js with the deployed instance addresses.
- Setup .env  
`RPC_URL, NET_ID, NETWORK, SALT`  
(we can improve source code to detect NET_ID and NETWORK from RPC_URL so that simply file evn settings)  
You should change SALT value if you want to have fresh deployed contracts.  
salt is a factor of address generation algorithm of deploying contracts through SingletonFactory contract.
`WETH_TOKEN`  
aWETH token address  
Please check Aave document, https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses  
`MINIMUM_INTERESTS`  
If Aave interests from depositing into Aave pool is smaller than this limit, it doesn't send the interests to the user.  
- Enable Sacred-Tree's circuit compilation(Optional)
Please uncomment #yarn circuit in build.sh

```cd sacred-trees
yarn
#yarn circuit
```
Sacred-Tree's circuit compilation requires 50+G RAM and high performance CPU.  
If you have precompiled one, don't need to enable it.  

- Download Prebuilt Sacred-Tree's circuit data  
Please download it and copy it into sacred-trees-snarks.
(We need to upload it somewhere so that anyone can download it to use and write automated script for downloading it while deploying)

- yarn deploy  
it will generate address.json that contains contract addresses.  

## How to create cli-tool
Please execute `./create-cli.sh` after deployed contracts.  
It'll create cli-tool folder and copy abi, circuit data, and js files which are requried to access contracts into cli-tool folder.  
Furthermore, please refer ReadMe of sacred-cli-tools, https://github.com/Sacred-Finance/sacred-cli-tools  
