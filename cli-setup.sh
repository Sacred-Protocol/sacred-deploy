#!/bin/bash -e

echo "Downloading Circuit Data..."
cd ./sacred-trees-snarks
if [ ! -f "./BatchTreeUpdate.sym" ]; then
  echo "Downloading circuit data(BatchTreeUpdate.sym)..."
  gdown --id 1CTkqv6gY7qPlzWsLoj_E_wj2kxsJ6nMO
fi
if [ ! -f "./BatchTreeUpdate.params" ]; then
  echo "Downloading circuit data(BatchTreeUpdate.params)..."
  gdown --id 123Ca-wyBuT8CRckcBoCjtSYKb7QtSEI3
fi
if [ ! -f "./BatchTreeUpdate.r1cs" ]; then
  echo "Downloading circuit data(BatchTreeUpdate.r1cs)..."
  gdown --id 1cCFhLHpCRaPF-4Y-GHQJhiPfi9n0Ztmo
fi
if [ ! -f "./BatchTreeUpdate.dat" ]; then
  echo "Downloading circuit data(BatchTreeUpdate.dat)..."
  gdown --id 1yYyKTQHcHA3ILGLZC0Hdb7nQeBypiuMQ
fi
if [ ! -f "./BatchTreeUpdate.wasm" ]; then
  echo "Downloading circuit data(BatchTreeUpdate.wasm)..."
  gdown --id 1G6mEMYbh8QTBPMnhl0Ld2Hu1iKSy9dmw
fi
echo "Installing node modules for cli-tool..."
cd ..
yarn install
echo "Done!"
