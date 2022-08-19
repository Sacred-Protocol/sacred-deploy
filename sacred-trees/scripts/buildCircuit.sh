#!/bin/bash -e
mkdir -p build/circuits
if [ "$2" = "large" ]; then
  circom --r1cs -c --sym circuits/$1.circom -o build/circuits
  cd ./build/circuits/$1_cpp
  make
  cd ..
else
  circom --r1cs --wasm --sym circuits/$1.circom -o build/circuits
  cd ./build/circuits
fi

# Generate a zkey file that will contain the proving and verification keys together with all phase 2 contributions
snarkjs groth16 setup $1.r1cs ../../../build/pot12_final.ptau $1_0000.zkey
# Contribute to phase 2 of the ceremony
snarkjs zkey contribute $1_0000.zkey $1_0001.zkey --name="1st Contributor Name" -v -e="SacredFinance"
# Export the verification key
snarkjs zkey export verificationkey $1_0001.zkey $1_verification_key.json

# Generate solidity verifier 
snarkjs zkey export solidityverifier $1_0001.zkey ${1}Verifier.sol
cd ../..
sed -i.bak "s/contract Verifier/contract ${1}Verifier/g" build/circuits/${1}Verifier.sol
