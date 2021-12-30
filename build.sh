#!/bin/bash -e

# expecting node v12
cd deployer
yarn
yarn compile
cd ..

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
cp ./snarks/BatchTreeUpdateVerifier.sol ./artifacts/circuits/BatchTreeUpdateVerifier.sol
yarn compile
cd ..

cd sacred-anonymity-mining
yarn link sacred-token
yarn
if [[ ! -f "build/circuits/TreeUpdateVerifier.sol" ]]; then
  yarn circuit
fi
yarn compile
cd ..

# cd sacred-pool 
# yarn
# yarn download
# yarn build
# cd ..
