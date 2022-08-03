include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "./Utils.circom";
include "./MerkleTree.circom";
include "./MerkleTreeUpdater.circom";

template Withdraw(levels, zeroLeaf) {
  // fee is included into the `amount` input
  signal input apAmount;
  signal input aaveInterestAmount;
  signal input extDataHash;

  signal private input inputApAmount;
  signal private input inputAaveInterestAmount;
  signal private input inputSecret;
  signal private input inputNullifier;
  signal         input inputRoot;
  signal private input inputPathIndices;
  signal private input inputPathElements[levels];
  signal         input inputNullifierHash;

  signal private input outputApAmount;
  signal private input outputAaveInterestAmount;
  signal private input outputSecret;
  signal private input outputNullifier;
  signal         input outputRoot;
  signal         input outputPathIndices;
  signal private input outputPathElements[levels];
  signal         input outputCommitment;

  // Verify amount invariant
  inputApAmount === outputApAmount + apAmount;
  inputAaveInterestAmount === outputAaveInterestAmount + aaveInterestAmount;

  // Check that amounts fit into 248 bits to prevent overflow
  // Amount range is checked by the smart contract
  component inputAmountCheck = Num2Bits(248);
  component outputAmountCheck = Num2Bits(248);
  component inputAaveInterestAmountCheck = Num2Bits(248);
  component outputAaveInterestAmountCheck = Num2Bits(248);
  inputAmountCheck.in <== inputApAmount;
  outputAmountCheck.in <== outputApAmount;
  inputAaveInterestAmountCheck.in <== inputAaveInterestAmount;
  outputAaveInterestAmountCheck.in <== outputAaveInterestAmount;

  // Compute input commitment
  component inputHasher = Poseidon(4);
  inputHasher.inputs[0] <== inputApAmount;
  inputHasher.inputs[1] <== inputAaveInterestAmount;
  inputHasher.inputs[2] <== inputSecret;
  inputHasher.inputs[3] <== inputNullifier;

  // Verify that input commitment exists in the tree
  component tree = MerkleTree(levels);
  tree.leaf <== inputHasher.out;
  tree.pathIndices <== inputPathIndices;
  for (var i = 0; i < levels; i++) {
    tree.pathElements[i] <== inputPathElements[i];
  }
  tree.root === inputRoot;

  // Verify input nullifier hash
  component nullifierHasher = Poseidon(1);
  nullifierHasher.inputs[0] <== inputNullifier;
  nullifierHasher.out === inputNullifierHash;

  // Compute and verify output commitment
  component outputHasher = Poseidon(4);
  outputHasher.inputs[0] <== outputApAmount;
  outputHasher.inputs[1] <== outputAaveInterestAmount;
  outputHasher.inputs[2] <== outputSecret;
  outputHasher.inputs[3] <== outputNullifier;
  outputHasher.out === outputCommitment;

  // Update accounts tree with output account commitment
  component treeUpdater = MerkleTreeUpdater(levels, zeroLeaf);
  treeUpdater.oldRoot <== inputRoot;
  treeUpdater.newRoot <== outputRoot;
  treeUpdater.leaf <== outputCommitment;
  treeUpdater.pathIndices <== outputPathIndices;
  for (var i = 0; i < levels; i++) {
      treeUpdater.pathElements[i] <== outputPathElements[i];
  }

  // Add hidden signals to make sure that tampering with recipient or fee will invalidate the snark proof
  // Most likely it is not required, but it's better to stay on the safe side and it only takes 2 constraints
  // Squares are used to prevent optimizer from removing those constraints
  signal extDataHashSquare;
  extDataHashSquare <== extDataHash * extDataHash;
}

// zeroLeaf = keccak256("sacred") % FIELD_SIZE
component main = Withdraw(20, 21663839004416932945382355908790599225266501822907911457504978515578255421292);
