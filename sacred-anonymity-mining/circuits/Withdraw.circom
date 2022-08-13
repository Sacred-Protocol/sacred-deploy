pragma circom 2.0.5;
include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "./Utils.circom";
include "./MerkleTree.circom";
include "./MerkleTreeUpdater.circom";
include "./QuinSelector.circom";

template Withdraw(levels, currencyCnt, zeroLeaf) {
  // fee is included into the `amount` input
  // public signals
  signal input apAmount;
  signal input aaveInterestAmount;
  signal input extDataHash;
  signal input currencyIndex;
  signal input inputRoot;
  signal input inputNullifierHash;
  signal input outputRoot;
  signal input outputPathIndices;
  signal input outputCommitment;

  // private signals
  signal input inputApAmounts[currencyCnt];
  signal input inputAaveInterestAmounts[currencyCnt];
  signal input inputSecret;
  signal input inputNullifier;
  signal input inputPathElements[levels];
  signal input inputPathIndices;
  signal input outputApAmounts[currencyCnt];
  signal input outputAaveInterestAmounts[currencyCnt];
  signal input outputSecret;
  signal input outputNullifier;
  signal input outputPathElements[levels];
  

  //Initialize ArraySelectors
  component inputApAmountsSelector = QuinSelector(currencyCnt);
  component inputAaveInterestAmountsSelector = QuinSelector(currencyCnt);
  component outputApAmountsSelector = QuinSelector(currencyCnt);
  component outputAaveInterestAmountsSelector = QuinSelector(currencyCnt);
  for (var i = 0; i < currencyCnt; i++) {
    inputApAmountsSelector.in[i] <== inputApAmounts[i];
    inputAaveInterestAmountsSelector.in[i] <== inputAaveInterestAmounts[i];
    outputApAmountsSelector.in[i] <== outputApAmounts[i];
    outputAaveInterestAmountsSelector.in[i] <== outputAaveInterestAmounts[i];
  }

  // Check apAmount invariant
  inputApAmountsSelector.index <== currencyIndex;
  var inputApAmount = inputApAmountsSelector.out;
  apAmount === inputApAmount;
  outputApAmountsSelector.index <== currencyIndex;
  (inputApAmount - apAmount) === outputApAmountsSelector.out;

  // Check aaveInterestAmount invariant
  inputAaveInterestAmountsSelector.index <== currencyIndex;
  outputAaveInterestAmountsSelector.index <== currencyIndex;
  inputAaveInterestAmountsSelector.out - aaveInterestAmount === outputAaveInterestAmountsSelector.out;
  
  // === check input and output accounts and block range ===
  // Check that amounts fit into 248 bits to prevent overflow
  // Fee range is checked by the smart contract
  // Technically block range check could be skipped because it can't be large enough
  // negative number that `outputAmount` fits into 248 bits
  component inputAmountChecks[currencyCnt];
  component outputAmountChecks[currencyCnt];
  component inputAaveInterestAmountChecks[currencyCnt];
  component outputAaveInterestAmountChecks[currencyCnt];

  for (var i = 0; i < currencyCnt; i++) {
   inputAmountChecks[i] = Num2Bits(248);
   outputAmountChecks[i] = Num2Bits(248);
   inputAaveInterestAmountChecks[i] = Num2Bits(248);
   outputAaveInterestAmountChecks[i] = Num2Bits(248);
  }
  
  for (var i = 0; i < currencyCnt; i++) {
    inputAmountChecks[i].in <== inputApAmounts[i];
    outputAmountChecks[i].in <== outputApAmounts[i];
    inputAaveInterestAmountChecks[i].in <== inputAaveInterestAmounts[i];
    outputAaveInterestAmountChecks[i].in <== outputAaveInterestAmounts[i];
  }

  // Compute input commitment
  component inputHasher = Poseidon(currencyCnt*2+2);
  
  for (var i = 0; i < currencyCnt; i++) {
    inputHasher.inputs[i*2] <== inputApAmounts[i];
    inputHasher.inputs[i*2+1] <== inputAaveInterestAmounts[i];
  }
  inputHasher.inputs[currencyCnt*2] <== inputSecret;
  inputHasher.inputs[currencyCnt*2+1] <== inputNullifier;

  // Verify that input commitment exists in the tree
  component inputTree = MerkleTree(levels);
  inputTree.leaf <== inputHasher.out;
  inputTree.pathIndices <== inputPathIndices;
  for (var i = 0; i < levels; i++) {
    inputTree.pathElements[i] <== inputPathElements[i];
  }

  // Check merkle proof only if amount is non-zero
  component checkRoot = ForceEqualIfEnabled();
  checkRoot.in[0] <== inputRoot;
  checkRoot.in[1] <== inputTree.root;
  checkRoot.enabled <== inputApAmount;

  // Verify input nullifier hash
  component inputNullifierHasher = Poseidon(1);
  inputNullifierHasher.inputs[0] <== inputNullifier;
  inputNullifierHasher.out === inputNullifierHash;

  // Compute and verify output commitment
  component outputHasher = Poseidon(currencyCnt*2+2);
  for (var i = 0; i < currencyCnt; i++) {
    outputHasher.inputs[i*2] <== 0;
    outputHasher.inputs[i*2+1] <== 0;
  }
  outputHasher.inputs[currencyCnt*2] <== outputSecret;
  outputHasher.inputs[currencyCnt*2+1] <== outputNullifier;
  outputHasher.out === outputCommitment;

  // Update accounts tree with output account commitment
  component accountTreeUpdater = MerkleTreeUpdater(levels, zeroLeaf);
  accountTreeUpdater.oldRoot <== inputRoot;
  accountTreeUpdater.newRoot <== outputRoot;
  accountTreeUpdater.leaf <== outputCommitment;
  accountTreeUpdater.pathIndices <== outputPathIndices;
  for (var i = 0; i < levels; i++) {
      accountTreeUpdater.pathElements[i] <== outputPathElements[i];
  }

  // Add hidden signals to make sure that tampering with recipient or fee will invalidate the snark proof
  // Most likely it is not required, but it's better to stay on the safe side and it only takes 2 constraints
  // Squares are used to prevent optimizer from removing those constraints
  signal extDataHashSquare;
  extDataHashSquare <== extDataHash * extDataHash;

}

// zeroLeaf = keccak256("sacred") % FIELD_SIZE

component main {public [
  apAmount,
  aaveInterestAmount,
  extDataHash,
  currencyIndex,
  inputRoot,
  inputNullifierHash,
  outputRoot,
  outputPathIndices,
  outputCommitment
]} = Withdraw(20, 5, 21663839004416932945382355908790599225266501822907911457504978515578255421292);
