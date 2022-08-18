pragma circom 2.0.5;

include "../node_modules/circomlib/circuits/poseidon.circom";
include "../node_modules/circomlib/circuits/bitify.circom";
include "../node_modules/circomlib/circuits/comparators.circom";
include "./Utils.circom";
include "./MerkleTree.circom";
include "./MerkleTreeUpdater.circom";
include "./QuinSelector.circom";

template Reward(levels, currencyCnt,  zeroLeaf) {
  //public signals
  signal input rate;
  signal input fee;
  signal input instance;
  signal input apAmount;
  signal input aaveInterestAmount;
  signal input rewardNullifier;
  signal input extDataHash;
  signal input currencyIndex;
  signal input inputRoot;
  signal input inputNullifierHash;
  signal input outputRoot;
  signal input outputPathIndices;
  signal input outputCommitment;
  signal input depositRoot;
  signal input withdrawalRoot;

  //private signals
  signal input noteSecret;
  signal input noteNullifier;
  signal input noteNullifierHash;
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
  signal input depositBlock;
  signal input depositPathIndices;
  signal input depositPathElements[levels];
  signal input withdrawalBlock;
  signal input withdrawalPathIndices;
  signal input withdrawalPathElements[levels];

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
  outputApAmountsSelector.index <== currencyIndex;
  inputApAmount + rate * (withdrawalBlock - depositBlock) === outputApAmountsSelector.out + fee;
  apAmount === rate * (withdrawalBlock - depositBlock);

  // Check aaveInterestAmount invariant
  inputAaveInterestAmountsSelector.index <== currencyIndex;
  outputAaveInterestAmountsSelector.index <== currencyIndex;
  aaveInterestAmount === (outputAaveInterestAmountsSelector.out - inputAaveInterestAmountsSelector.out);
  
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
 
  component blockRangeCheck = Num2Bits(32);
  blockRangeCheck.in <== withdrawalBlock - depositBlock;

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
    outputHasher.inputs[i*2] <== outputApAmounts[i];
    outputHasher.inputs[i*2+1] <== outputAaveInterestAmounts[i];
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

  // === check deposit and withdrawal ===
  // Compute sacred.cash commitment and nullifier
  component noteHasher = SacredCommitmentHasher();
  noteHasher.nullifier <== noteNullifier;
  noteHasher.secret <== noteSecret;

  // Compute deposit commitment
  component depositHasher = Poseidon(3);
  depositHasher.inputs[0] <== instance;
  depositHasher.inputs[1] <== noteHasher.commitment;
  depositHasher.inputs[2] <== depositBlock;

  // Verify that deposit commitment exists in the tree
  component depositTree = MerkleTree(levels);
  depositTree.leaf <== depositHasher.out;
  depositTree.pathIndices <== depositPathIndices;
  for (var i = 0; i < levels; i++) {
    depositTree.pathElements[i] <== depositPathElements[i];
  }
  depositTree.root === depositRoot;

  // Compute withdrawal commitment
  component withdrawalHasher = Poseidon(3);
  withdrawalHasher.inputs[0] <== instance;
  withdrawalHasher.inputs[1] <== noteHasher.nullifierHash;
  withdrawalHasher.inputs[2] <== withdrawalBlock;

  // Verify that withdrawal commitment exists in the tree
  component withdrawalTree = MerkleTree(levels);
  withdrawalTree.leaf <== withdrawalHasher.out;
  withdrawalTree.pathIndices <== withdrawalPathIndices;
  for (var i = 0; i < levels; i++) {
    withdrawalTree.pathElements[i] <== withdrawalPathElements[i];
  }
  withdrawalTree.root === withdrawalRoot;

  // Compute reward nullifier
  component rewardNullifierHasher = Poseidon(1);
  rewardNullifierHasher.inputs[0] <== noteNullifierHash;
  rewardNullifierHasher.out === rewardNullifier;

  // Add hidden signals to make sure that tampering with recipient or fee will invalidate the snark proof
  // Most likely it is not required, but it's better to stay on the safe side and it only takes 2 constraints
  // Squares are used to prevent optimizer from removing those constraints
  signal extDataHashSquare;
  extDataHashSquare <== extDataHash * extDataHash;
}

// zeroLeaf = keccak256("sacred") % FIELD_SIZE

component main {public [
  rate,
  fee,
  instance,
  apAmount,
  aaveInterestAmount,
  rewardNullifier,
  extDataHash,
  currencyIndex,
  inputRoot,
  inputNullifierHash,
  outputRoot,
  outputPathIndices,
  outputCommitment,
  depositRoot,
  withdrawalRoot
]} = Reward(20, 5, 21663839004416932945382355908790599225266501822907911457504978515578255421292);
