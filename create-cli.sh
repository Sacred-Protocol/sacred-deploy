#!/bin/bash -e

echo "Creating cli-tool..."

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
mkdir -p ./cli-tool

if [ ! -f "./address.json" ]; then
    echo "Contracts were not deployed!, Please excute yarn deploy first."
fi

cp address.json ./cli-tool/
cp cli-package.json ./cli-tool/package.json
cp cli-setup.sh ./cli-tool/setup.sh
cp -r ./abi ./cli-tool
cp -r ./lib ./cli-tool

cp cli.js ./cli-tool
chmod +x ./cli-tool/cli.js
cp config.json ./cli-tool

mkdir -p ./cli-tool/sacred-contracts-eth/artifacts
cp -r ./sacred-contracts-eth/artifacts/contracts ./cli-tool/sacred-contracts-eth/artifacts
mkdir -p ./cli-tool/sacred-contracts-eth/lib
cp -r ./sacred-contracts-eth/lib ./cli-tool/sacred-contracts-eth
mkdir -p ./cli-tool/sacred-contracts-eth/build/
cp -r ./sacred-contracts-eth/build/circuits ./cli-tool/sacred-contracts-eth/build

mkdir -p ./cli-tool/sacred-anonymity-mining/artifacts
cp -r ./sacred-anonymity-mining/artifacts/contracts ./cli-tool/sacred-anonymity-mining/artifacts
cp -r ./sacred-anonymity-mining/src ./cli-tool/sacred-anonymity-mining
mkdir -p ./cli-tool/sacred-anonymity-mining/build/
cp -r ./sacred-anonymity-mining/build/circuits ./cli-tool/sacred-anonymity-mining/build

mkdir -p ./cli-tool/sacred-token/artifacts
cp -r ./sacred-token/artifacts/contracts ./cli-tool/sacred-token/artifacts
cp ./sacred-token/config.js ./cli-tool/sacred-token

mkdir -p ./cli-tool/sacred-trees/artifacts
cp -r ./sacred-trees/artifacts/contracts ./cli-tool/sacred-trees/artifacts
cp -r ./sacred-trees/src ./cli-tool/sacred-trees

mkdir -p ./cli-tool/sacred-trees-snarks-light
cp -r ./sacred-trees-snarks-light ./cli-tool

cp ./.env.example ./cli-tool

echo "Done!"
