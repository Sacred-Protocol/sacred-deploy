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

echo "---Verify sacred-contracts-eth---"
cd sacred-contracts-eth
yarn verify
cd ..

echo "---Verify sacred-token---"
cd sacred-token
yarn verify
cd ..

echo "---Verify sacred-governance---"
cd sacred-governance
yarn verify
cd ..

echo "---Verify sacred-trees---"
cd sacred-trees
yarn verify
cd ..

echo "---Verify sacred-anonymity-mining---"
cd sacred-anonymity-mining
yarn verify
cd ..
