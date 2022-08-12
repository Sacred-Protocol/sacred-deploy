#!/bin/bash
circom circuits/$1.circom --r1cs --wasm --sym -o build/circuits
npx snarkjs r1cs info build/circuits/$1.r1cs  

cd ./build/circuits
if [ -f ./pot12_final.ptau ]; then
    echo "pot12_final.ptau already exists. Skipping."
else
    # Phase 1 - Power of Tau
    # Start new "powers of tau" ceremony
    snarkjs powersoftau new bn128 17 pot12_0000.ptau -v
    # Contribute to the ceremony
    snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -v -e="SacredFinance"
    # Phase 2 (Circuit Specific)
    snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v
fi

# Generate a zkey file that will contain the proving and verification keys together with all phase 2 contributions
snarkjs groth16 setup $1.r1cs pot12_final.ptau $1_0000.zkey
# Contribute to phase 2 of the ceremony
snarkjs zkey contribute $1_0000.zkey $1_0001.zkey --name="1st Contributor Name" -v -e="SacredFinance"
# Export the verification key
snarkjs zkey export verificationkey $1_0001.zkey ${1}_verification_key.json

# Generate solidity verifier 
snarkjs zkey export solidityverifier $1_0001.zkey ${1}Verifier.sol
cd ../..
sed -i.bak "s/contract Verifier/contract ${1}Verifier/g" build/circuits/${1}Verifier.sol
