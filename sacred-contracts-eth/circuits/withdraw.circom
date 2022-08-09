pragma circom 2.0.0;
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./Utils.circom";
include "./merkleTree.circom";

// Verifies that commitment that corresponds to given secret and nullifier is included in the merkle tree of deposits
template Withdraw(levels) {
    //public signals
    signal input root;
    signal input nullifierHash;
    signal input recipient; // not taking part in any computations
    signal input relayer;  // not taking part in any computations
    signal input fee;      // not taking part in any computations
    signal input refund;   // not taking part in any computations
    //private signals
    signal input nullifier;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices;


    component hasher = SacredCommitmentHasher();
    hasher.nullifier <== nullifier;
    hasher.secret <== secret;
    hasher.nullifierHash === nullifierHash;

    component tree = MerkleTree(levels);
    tree.leaf <== hasher.commitment;
    tree.pathIndices <== pathIndices;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
    }

    tree.root === root;

    // Add hidden signals to make sure that tampering with recipient or fee will invalidate the snark proof
    // Most likely it is not required, but it's better to stay on the safe side and it only takes 2 constraints
    // Squares are used to prevent optimizer from removing those constraints
    signal recipientSquare;
    signal feeSquare;
    signal relayerSquare;
    signal refundSquare;
    recipientSquare <== recipient * recipient;
    feeSquare <== fee * fee;
    relayerSquare <== relayer * relayer;
    refundSquare <== refund * refund;
}

component main {public [
    root,
    nullifierHash,
    recipient,
    relayer,
    fee,
    refund
]} = Withdraw(20);
