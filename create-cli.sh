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
mkdir -p "./cli-tool/${envs["NETWORK"]}"

if [ ! -f "./address.json" ]; then
    echo "Contracts were not deployed!, Please excute yarn deploy first."
fi

cp address.json "./cli-tool/${envs["NETWORK"]}"
cp cli-package.json ./cli-tool/package.json
cp cli-setup.sh ./cli-tool/setup.sh
mkdir -p ./cli-tool/src
cp ./src/utils.js ./cli-tool/src
cp -r ./abi ./cli-tool
cp -r ./lib ./cli-tool

cp cli.js ./cli-tool
chmod +x ./cli-tool/cli.js
cp config.js ./cli-tool

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

echo "Copying sacred-trees-snarks..."
cp -r sacred-trees-snarks ./cli-tool
echo "Done!"
