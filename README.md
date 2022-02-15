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
Please execute `./cli-setup.sh` after deployed contracts.
It'll create cli-tool folder and copy abi, circuit data, and js files which are requried to access contracts into cli-tool folder.
You should run `yarn install` in cli-tool folder and execute cli commands per following commands.

## How to use cli-tool
### options  
`-r, --rpc <URL>`

The RPC, CLI should interact with, default: http://localhost:8545

`-R, --relayer <URL>`

Withdraw via relayer

`-k, --privatekey <privateKey>`

Private Key


### Available commands  
`deposit <currency> <amount>`

Submit a deposit of specified currency and amount from default eth account and return the resulting note. 
The currency is one of (ETH|). The amount depends on currency, see config.js file.

`withdraw <note> <recipient>`

Withdraw a note to a recipient account using relayer or specified private key. You can exchange some of your deposit\`s tokens to ETH during the withdrawal by specifing ETH_purchase (e.g. 0.1) to pay for gas in future transactions. Also see the --relayer option.

`sacredtest <currency> <amount> <recipient>`

Perform an automated test. It deposits and withdraws amount ETH. Uses Kovan Testnet.

`updatetree <operation>`
  
It performs batchUpdateRoot for deposits/withdrawal roots of SacredTrees
operation can be diposit/withdraw

`showpendings <operation>`

It shows how many number of deposit/withdraw event are pending in SacredTrees
operation can be diposit/withdraw

`calcap <note>`

It shows calculated AP amount based on deposit / withdrawal block number

`reward <note> <recipient>`

It claiming reward and returns your AAVE interests to the recipient address.  
With executing this, you can get your encoded account that contains your AP.  

`rewardswap <account> <recipient>`

It swaps your AP that is included in your account to ETH.





