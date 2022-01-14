## Dependencies

1. node 12
2. yarn
3. zkutil (`brew install rust && cargo install zkutil`) (needed only for circuit compilation and setup)

## Usage

```
git clone --recursive https://github.com/Sacred-Finance/sacred-deploy
cd sacred-deploy
cp .env.example .env
yarn

# optionally copy production snark circuits
mkdir -p sacred-anonymity-mining/build && cp -R ~/Downloads/circuits ./sacred-anonymity-mining/build

yarn build
```

Note: build script will globally `yarn link` `sacred-token` package

Note: build script will not recompile snark circuit if compilation result already exists

The result of the build is `actions.json` file, that contains everything that is needed to deploy contracts on Ethereum along with expected deploy addresses.

## Reproducible build

In order to generate exactly the same actions.json the code has to be compiled in `/private/tmp/sacred-deploy` dir because solidity compiler includes a hash of full path to files into contact bytecode as swarm hash. If you compile in other dir this swarm hash will be different. It doesn't affect contract execution but your `actions.json` will have a different hash from the initiation version.

## Verify addresses

```
cat actions.json | jq '.actions[] | {domain,expectedAddress,contract} '
```

## How to use cli tool  
### options  
-r, --rpc <URL>
The RPC, CLI should interact with, default: http://localhost:8545
-R, --relayer <URL>
Withdraw via relayer
-k, --privatekey <privateKey>
Private Key

### Available commands  
deposit <currency> <amount>  
Submit a deposit of specified currency and amount from default eth account and return the resulting note. 
The currency is one of (ETH|). The amount depends on currency, see config.js file.

withdraw <note> <recipient>  
Withdraw a note to a recipient account using relayer or specified private key. You can exchange some of your deposit`s tokens to ETH during the withdrawal by specifing ETH_purchase (e.g. 0.1) to pay for gas in future transactions. Also see the --relayer option.

sacredtest <currency> <amount> <recipient>
Perform an automated test. It deposits and withdraws amount ETH. Uses Kovan Testnet.

updatetree <operation>
It performs batchUpdateRoot for deposits/withdrawal roots of SacredTrees
operation can be diposit/withdraw

showpendings <operation>
It shows how many number of deposit/withdraw event are pending in SacredTrees
operation can be diposit/withdraw

calcap <note>
It shows calculated AP amount based on deposit / withdrawal block number

reward <note>
It claiming reward. With executing this, you can get your encoded account that contains your AP.

rewardswap <account> <recipient>
It swaps your AP that is included in your account to ETH.


