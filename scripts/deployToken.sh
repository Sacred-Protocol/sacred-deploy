#!/bin/bash -e

# expecting node v12

echo "---sacred-token---"
cd sacred-token
yarn
yarn compile
yarn deploy
cd ..