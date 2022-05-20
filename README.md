# Dependencies

1. node 12
2. yarn
3. zkutil (`brew install rust && cargo install zkutil`) (needed only for circuit compilation and setup)


#  How to deploy it

## Related Repositories

### SubModules  
- https://github.com/Sacred-Finance/sacred-anonymity-mining
- https://github.com/Sacred-Finance/sacred-token
- https://github.com/Sacred-Finance/sacred-trees
- https://github.com/Sacred-Finance/sacred-governance

### Sacred Pool  
https://github.com/Sacred-Finance/sacred-contracts-eth

### Sacred Token
https://github.com/Sacred-Finance/sacred-trees 

## Deploy Sacred Pool first  
1. Clone Repository  
```
git clone https://github.com/Sacred-Finance/sacred-contracts-eth 
cd sacred-contracts-eth
```
2. Copy .env.example and setup
- `OPERATOR_FEE`: default is 50(0.5%), the value range is 0, 1(0.01%) ~ 1000(10%)  
- `LENDING_POOL_ADDRESS_PROVIDER`: PoolAddressesProvider-Aave address  
- `WETH_GATEWAY`: WETHGateway address  
- `WETH_TOKEN `: WETH-AToken-Aave address  
Please check Aave document for LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY and WETH_TOKEN  
https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses  
3. Build and deploy
```
yarn build
yarn migrate:kovan
```
if you want to deploy it on mumbai, `yarn migrate:mumbai`

4. Save addresses of deployed sacred instances.   
you'll need to update config.js of sacred-deploy with them.  
For example, you can see addresses of deployed contracts after deploy is completed.  
```
100000000000000000 - ETHSacred's address  0x648738de9Fbd601f3e75C564D22d8067bA96dFB0  
1000000000000000000 - ETHSacred's address  0xB03922dc5C2c4EE1A780486997eE7241365a4B65  
10000000000000000000 - ETHSacred's address  0x9EAecb8c3e9c30f548814fbC0415152e39ED60f0  
100000000000000000000 - ETHSacred's address  0xD4a312A57BBAf003d55DC121e0d49a63013Ed8ea  
```
5. Fill config.js with the deployed instance addresses.  

## Deploy SacredToken   
1. Clone Repository  
```
git clone https://github.com/Sacred-Finance/sacred-token 
cd sacred-token
```
2. Deploy SacredToken and save the address of deployed SacredToken  
Please follow deploy instruction of sacred-token repository 

## Deploy Others through Sacred-Deploy  
1. Clone Sacred-Deploy  
```
git clone https://github.com/Sacred-Finance/sacred-deploy.git
```
2. Pull sub modules  
``` 
cd sacred-deploy
git submodule update --init --recursive  
git submodule update --recursive --remote  
```
3. Update sacred-instance addresses with that you saved in config.js   
For example, for Rinkeby network, you setup for netId4 since chain Id of Rinkeby is 4.  
```
    netId4: {
      eth: {
        instanceAddress: {
          '0.1': '0xDAFE9299fc066FFa3DdE76cdC2D256a47dBD8749',
          '1': '0x07196A59255c77C864C3043F38f12e8914c37910',
          '10': '0xbf8472a2781644177b18844DB702eb5029B72D67',
          '100': '0x060a8e751C5904f86f1faA69b7a8B2bda3cd50Cc'
        },
        symbol: 'ETH',
        decimals: 18
      }
    }
```

4. Install packages (it's for building sacred-tree circuits)  
`sudo apt install build-essential`

5. Install zkutil  
Please follow readme of zkutil.  
https://github.com/poma/zkutil

6. Setup .env  
- `NETWORK`  
It's required to specify network where contracts are deployed.  
For example,   
```
NETWORK=matic  
NETWORK=mumbai  
NETWORK=rinkeby  
```
- `NET_ID`  
It's chain ID of the network you specified by NETWORK  
```
Mainnet: 1  
Kovan: 42  
Mumbai: 80001  
Rinkeby: 4  
```
- `RPC URLs`  
You need to set rpc urls for all networks.  

- `SALT`  
It's a kind of random factor that is required by Singleton Factory contract which deploys contracts.  
You need to changed this SALT value when you want to have your contracts fresh deployed.  
For example, you already deployed contracts with SALT=0x----0100000, but if you need to deploy contracts after some modification, you need to change SALT as 0x----0100001.  
Simply you can increase SALT whenever you want fresh deploy.  

- `SACRED_TOKEN`  
The address of deployed SacredToken  

- `REWARDSWAP_MINING_CAP`  
The amount of SacredTokens to be sent to RewardSwap contract for initial liquidity.  
You also have to charge this amount of SacredTokens to RewardSwap after deployed all contracts.  

- `SMALL_BATCH_SIZE_ROOT_UPDATE`  
Default is 1 which means light weight circuits for updating root of sacred-trees.  
In this mode, the batch size is 2 for updating the root of sacred-trees.  
If SMALL_BATCH_SIZE_ROOT_UPDATE is 0, it means the batch size is 256.  
For development or test, Please set SMALL_BATCH_SIZE_ROOT_UPDATE as 1, since building circuits(batch size=256) requires 50+G RAM and high performance CPU.  

- `MINIMUM_INTERESTS`  
If Aave interests from depositing into Aave pool is smaller than this limit, it doesn't send the interests to the user.  

7. Download Prebuilt Sacred-Tree's circuit data(Only if SMALL_BATCH_SIZE_ROOT_UPDATE is 0.)  
Please download it and copy it into sacred-trees-snarks.  
(We need to upload it somewhere so that anyone can download it to use and write automated script for downloading it while deploying)  

8. To Deploy contracts  
- Please let node.js use unliminited memory when compiling sacred-tree circuits  
```
sudo sysctl -w vm.max_map_count=655300
export NODE_OPTIONS='--max-old-space-size=54000'
```
- Please execute `yarn deploy`  

It'll also compile circuits for sacred-trees and you may face some errors while compiling circuits depends on your computer OS or CPU.  
If you have some errors, please modify sacred-trees/scripts/buildCircuits.sh like followings.  

```
if [ "$2" = "large" ]; then
  npx --node-arg="--stack-size=655000" circom -v -f -r artifacts/circuits/$1.r1cs -c artifacts/circuits/$1.cpp -s artifacts/circuits/$1.sym circuits/$1.circom
else
  npx --node-arg="--stack-size=655000" circom -v -r artifacts/circuits/$1.r1cs -w artifacts/circuits/$1.wasm -s artifacts/circuits/$1.sym circuits/$1.circom
```
If you're using MacOS, please modify sacred-trees/scripts/buildWitness.sh like followings.  

```
#!/bin/bash -e
# required dependencies: libgmp-dev nlohmann-json3-dev nasm g++
cd artifacts/circuits
node ../../node_modules/ffiasm/src/buildzqfield.js -q 21888242871839275222246405745257275088548364400416034343698204186575808495617 -n Fr
#nasm -felf64 fr.asm
nasm -fmacho64 --prefix _ fr.asm
cp ../../node_modules/circom_runtime/c/*.cpp ./
cp ../../node_modules/circom_runtime/c/*.hpp ./
g++ -pthread main.cpp calcwit.cpp utils.cpp fr.cpp fr.o ${1}.cpp -o ${1} -lgmp -std=c++11 -O3 -DSANITY_CHECK -lomp
```

## Charging RewardSwap contract with some SacredTokens for initial liquidity.    
You should send exact amount of SacredTokens as `REWARDSWAP_MINING_CAP`  
address.json will be created after deployed, and you can find the address of RewardSwap contract in address.json  
If the exact amount of tokens are not charged in RewardSwap contract, SacredFinance system will not work properly.  

## To test contracts  
`yarn test`  

# How to create cli-tool
Please execute `./create-cli.sh` after deployed contracts.  
It'll create cli-tool folder and copy abi, circuit data, and js files which are requried to access contracts into cli-tool folder.  
Furthermore, please refer ReadMe of sacred-cli-tools, https://github.com/Sacred-Finance/sacred-cli-tools  
