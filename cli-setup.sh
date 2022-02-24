#!/bin/bash -e

echo "Downloading Circuit Data..."
wget https://sacred-trees-snarks.s3.us-east-2.amazonaws.com/sacred-trees-snarks.tar.gz
tar -xf sacred-trees-snarks.tar.gz
echo "Installing node modules for cli-tool..."
yarn install
echo "Done!"
