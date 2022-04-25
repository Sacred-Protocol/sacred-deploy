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

cd sacred-token
yarn unlink || true
yarn link
yarn
yarn compile
cd ..

cd sacred-governance
yarn link sacred-token
yarn
yarn compile
cd ..

cd sacred-trees
yarn
#yarn circuit
if [ ${envs["SMALL_BATCH_SIZE_ROOT_UPDATE"]} = 1 ]
  then
    yarn changeTreeHeight 1
    yarn circuit
    cp -r ./artifacts/circuits/* ../sacred-trees-snarks-light
    cp ./artifacts/circuits/BatchTreeUpdateVerifier.sol ./snarks
  else
    yarn changeTreeHeight 8
    cp ./snarks/BatchTreeUpdateVerifier.sol ./artifacts/circuits/BatchTreeUpdateVerifier.sol
fi

yarn compile
cd ..

cd sacred-anonymity-mining
yarn link sacred-token
yarn
yarn compile:hasher
if [[ ! -f "build/circuits/TreeUpdateVerifier.sol" ]]; then
  yarn circuit
fi
yarn compile
cd ..

