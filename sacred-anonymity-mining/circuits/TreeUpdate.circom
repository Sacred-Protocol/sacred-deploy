pragma circom 2.0.5;
include "./MerkleTreeUpdater.circom";

// zeroLeaf = keccak256("sacred") % FIELD_SIZE
component main {public [
    oldRoot,
    newRoot,
    leaf,
    pathIndices
]} = MerkleTreeUpdater(20, 21663839004416932945382355908790599225266501822907911457504978515578255421292);
