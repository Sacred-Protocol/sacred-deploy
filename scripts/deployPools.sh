#!/bin/bash -e

# expecting node v12

echo "---sacred-contracts-eth---"
cd sacred-contracts-eth
yarn
yarn build
yarn deploy
cd ..
