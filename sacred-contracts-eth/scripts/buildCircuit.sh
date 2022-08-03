#!/bin/bash
npx circom circuits/withdraw.circom -o build/circuits/withdraw.json
npx snarkjs info -c build/circuits/withdraw.json
zkutil setup -c build/circuits/withdraw.json -p build/circuits/withdraw.params
zkutil export-keys -c build/circuits/withdraw.json -p build/circuits/withdraw.params --pk build/circuits/withdraw_proving_key.json --vk build/circuits/withdraw_verification_key.json
node node_modules/websnark/tools/buildpkey.js -i build/circuits/withdraw_proving_key.json -o build/circuits/withdraw_proving_key.bin
zkutil generate-verifier -p build/circuits/withdraw.params -v build/circuits/Verifier.sol
sed -i.bak "s/contract Verifier/contract Verifier/g" build/circuits/Verifier.sol
cp ./build/circuits/Verifier.sol ./contracts/
