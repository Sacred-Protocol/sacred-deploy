# Dependencies

1. node 14
2. yarn
3. zkutil (`brew install rust && cargo install zkutil`) (needed only for circuit compilation and setup)
4. libgmp-dev, nlohmann-json3-dev, nasm  

#  How to deploy it  

## Setup .env  
Please copy .env.example to .env by executing the following command.  
`cp .env.example .env`

### For the deploy process  
- `NETWORK`  
It's required to specify network where contracts are deployed.  
For example,   
```
NETWORK=matic  
NETWORK=mumbai  
NETWORK=rinkeby  
```
- `HARDHAT_CHAINID`  
Hardhat doesn't provide a way to get original chainID from the forked network, so you need to specify the chainId when you run it on forked network.  
```
HARDHAT_CHAINID: 1  #Mainnet  
HARDHAT_CHAINID: 42 #Kovan  
HARDHAT_CHAINID: 4  #Rinkeby  
HARDHAT_CHAINID: 80001  #Mumbai  
```
- `RPC URLs`  
You need to set rpc urls for all networks.  

- `SALT`  
It's a kind of random factor that is required by Singleton Factory contract which deploys contracts.  
You need to changed this SALT value when you want to have your contracts fresh deployed.  
For example, you already deployed contracts with SALT=0x----0100000, but if you need to deploy contracts after some modification, you need to change SALT as 0x----0100001.  
Simply you can increase SALT whenever you want fresh deploy.  

### For Anonimity Mining  
- `REWARDSWAP_MINING_CAP`  
The amount of SacredTokens to be sent to RewardSwap contract for initial liquidity.  
You also have to charge this amount of SacredTokens to RewardSwap after deployed all contracts.  

- `MINIMUM_INTERESTS`  
If Aave interests from depositing into Aave pool is smaller than this limit, it doesn't send the interests to the user.  

### For SacredTrees  

- `SMALL_BATCH_SIZE_ROOT_UPDATE`  
Default is 1 which means light weight circuits for updating root of sacred-trees.  
In this mode, the batch size is 2 for updating the root of sacred-trees.  
If SMALL_BATCH_SIZE_ROOT_UPDATE is 0, it means the batch size is 256.  
For development or test, Please set SMALL_BATCH_SIZE_ROOT_UPDATE as 1, since building circuits(batch size=256) requires 50+G RAM and high performance CPU.  

### For Sacred Pools  
- `OPERATOR_FEE`: default is 50(0.5%), the value range is 0, 1(0.01%) ~ 1000(10%)  
- `LENDING_POOL_ADDRESS_PROVIDER`: PoolAddressesProvider-Aave address  
- `WETH_GATEWAY`: WETHGateway address  
- `WETH_TOKEN `: WETH-AToken-Aave address  
Please check Aave document for LENDING_POOL_ADDRESS_PROVIDER, WETH_GATEWAY and WETH_TOKEN  
https://docs.aave.com/developers/deployed-contracts/v3-testnet-addresses  

### For Scred Token
- `AMOUNT`: The amount of SacredTokens to be minted at the deploy stage  
- `AIRDROP_RECEIVER`: The address where all minted SacredTokens are sent while deploying  


## Deploy Preparation
- Install dependencies (it's for building sacred-tree circuits)  
`sudo apt install build-essential`

- Install zkutil  
Please follow readme of zkutil.  
https://github.com/poma/zkutil

- Install Packages 
`yarn install`

- Setup for building SacredTree circuits(Only for building SacredTrees circuits)  
You can skip this step if you want have SacredTrees with small batch size or want to download pre-built circuit data from Cloud.
Circuit compilation with a large batch size will take huge RAM usage.
Please let node.js use unliminited memory when compiling sacred-tree circuits  
```
sudo sysctl -w vm.max_map_count=655300
export NODE_OPTIONS='--max-old-space-size=54000'
```
It'll also requried to modify the build script of SacredTrees.  
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

- Download Prebuilt Sacred-Tree's circuit data(Only if SMALL_BATCH_SIZE_ROOT_UPDATE is 0.)  
Please download it and copy it into sacred-trees-snarks.  
(We need to upload it somewhere so that anyone can download it to use and write automated script for downloading it while deploying)  

## Deploy Sacred Pools  
`yarn deploy:pools`

## Deploy Sacred Token  
`yarn deploy:token`

## Deploy Sacred Trees and Anonimity Mining  
`yarn deploy:other`

## What you will get as a result of the deploy process  
- config.json  
It has addresses of the deployed Sacred Pools and Sacred Token per network.  
- address.json  
It's a map structure in which addresses of all contractsare saved, and they're pairing with ENS style names as a key.  

## Charging RewardSwap contract with some SacredTokens for initial liquidity.  
You should send exact amount of SacredTokens as `REWARDSWAP_MINING_CAP`  
address.json will be created after deployed, and you can find the address of RewardSwap contract in address.json  
If the exact amount of tokens are not charged in RewardSwap contract, SacredFinance system will not work properly.  

## To test contracts  
- Test Sacred Pools  
```
cd sacred-contracts-eth  
yarn test
```
- Test All Contracts  
```
cd sacred-deploy  
yarn test  
```

# How to create cli-tool
Please execute `./create-cli.sh` after deployed contracts.  
It'll create cli-tool folder and copy abi, circuit data, and js files which are requried to access contracts into cli-tool folder.  
Furthermore, please refer ReadMe of sacred-cli-tools, https://github.com/Sacred-Finance/sacred-cli-tools  
