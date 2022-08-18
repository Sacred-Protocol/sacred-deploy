#!/bin/bash -e

# expecting node v12

declare -A envs
function load_envs() {
  local envFile=${1:-.env}
  local isComment='^[[:space:]]*#'
  local isBlank='^[[:space:]]*$'
  while IFS= read -r line; do
    [[ $line =~ $isComment ]] && continue
    [[ $line =~ $isBlank ]] && continue
    key=$(echo "$line" | cut -d '=' -f 1)
    value=$(echo "$line" | cut -d '=' -f 2-)
    envs["$key"]=$value
  done < <( cat "$envFile" )
}

load_envs

./scripts/prepBuildCircuit.sh

cp ./sacred-contracts-eth/artifacts/contracts/ETHSacred.sol/ETHSacred.json ./abi/ETHSacred.json
cp ./sacred-contracts-eth/artifacts/contracts/ERC20Sacred.sol/ERC20Sacred.json ./abi/ERC20Sacred.json

echo "---sacred-governance---"
cd sacred-governance
yarn
yarn compile
cd ..

echo "---sacred-trees---"
cd sacred-trees
yarn
#yarn circuit
if [ ${envs["SMALL_BATCH_SIZE_ROOT_UPDATE"]} = 1 ]
  then
    yarn changeTreeHeight 1
    yarn circuit:batchTreeUpdateLarge
    cp -r ./build/circuits/* ../sacred-trees-snarks-light
  else
    yarn changeTreeHeight 8
    cp ./snarks/BatchTreeUpdateVerifier.sol ./build/circuits/BatchTreeUpdateVerifier.sol
fi

yarn compile
cd ..

echo "---sacred-anonymity-mining---"
cd sacred-anonymity-mining
yarn
yarn compile:hasher
if [ ! -f "build/circuits/TreeUpdateVerifier.sol" ]; then
  yarn circuit
fi
yarn compile
cd ..

