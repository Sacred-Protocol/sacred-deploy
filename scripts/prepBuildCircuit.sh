
mkdir -p ./build
cd ./build
if [ -f ./pot12_final.ptau ]; then
    echo "pot12_final.ptau already exists. Skipping."
else
    # Phase 1 - Power of Tau
    # Start new "powers of tau" ceremony
    snarkjs powersoftau new bn128 17 pot12_0000.ptau -v
    # Contribute to the ceremony
    snarkjs powersoftau contribute pot12_0000.ptau pot12_0001.ptau --name="First contribution" -v -e="SacredFinance"
    snarkjs powersoftau prepare phase2 pot12_0001.ptau pot12_final.ptau -v
fi
cd ..