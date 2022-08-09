#!/bin/bash
circom circuits/withdraw.circom --r1cs --wasm --sym -o build/circuits
npx snarkjs r1cs info build/circuits/withdraw.r1cs  

cd ./build/circuits
if [ -f ./pot12_final.ptau ]; then
    echo "pot12_final.ptau already exists. Skipping."
else
    # Phase 1 - Power of Tau
    # Start new "powers of tau" ceremony
    snarkjs powersoftau new bn128 17 pot12_0000.ptau -v
    # Contribute to the ceremony
    snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -v
    # Phase 2 (Circuit Specific)
    snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v
fi

# Generate a zkey file that will contain the proving and verification keys together with all phase 2 contributions
snarkjs groth16 setup withdraw.r1cs pot12_final.ptau withdraw_0000.zkey
# Contribute to phase 2 of the ceremony
snarkjs zkey contribute withdraw_0000.zkey withdraw_0001.zkey --name="1st Contributor Name" -v
# Export the verification key
snarkjs zkey export verificationkey withdraw_0001.zkey withdraw_verification_key.json

# Generate solidity verifier 
snarkjs zkey export solidityverifier withdraw_0001.zkey Verifier.sol
cd ../..
sed -i.bak "s/contract Verifier/contract Verifier/g" build/circuits/Verifier.sol
cp ./build/circuits/Verifier.sol ./contracts/

