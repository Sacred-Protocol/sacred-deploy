#!/bin/bash
circom circuits/withdraw.circom --r1cs --wasm --sym -o build/circuits
npx snarkjs r1cs info build/circuits/withdraw.r1cs  

cd ./build/circuits

# Generate a zkey file that will contain the proving and verification keys together with all phase 2 contributions
snarkjs groth16 setup withdraw.r1cs ../../../build/pot12_final.ptau withdraw_0000.zkey
# Contribute to phase 2 of the ceremony
snarkjs zkey contribute withdraw_0000.zkey withdraw_0001.zkey --name="1st Contributor Name" -v -e="SacredFinance"
# Export the verification key
snarkjs zkey export verificationkey withdraw_0001.zkey withdraw_verification_key.json

# Generate solidity verifier 
snarkjs zkey export solidityverifier withdraw_0001.zkey Verifier.sol
cd ../..
sed -i.bak "s/contract Verifier/contract Verifier/g" build/circuits/Verifier.sol


