// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./MerkleTreeWithHistory.sol";
import "./TwoStepOwnerable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

interface IVerifier {
  function verifyProof(uint[2] memory a,
            uint[2][2] memory b,
            uint[2] memory c,
            uint[6] memory input) external returns(bool);
}

abstract contract Sacred is MerkleTreeWithHistory, ReentrancyGuard, TwoStepOwnerable {
  uint256 public denomination;
  mapping(bytes32 => bool) public nullifierHashes;
  // we store all commitments just to prevent accidental deposits with the same commitment
  mapping(bytes32 => bool) public commitments;
  IVerifier public verifier;

  // operator can update snark verification key
  // after the final trusted setup ceremony operator rights are supposed to be transferred to zero address
  uint256 public fee = 50; // 0.5%, 50 / 10000, value: 0, 1 (0.01%),~ 1000 (10%)

  event Deposit(bytes32 indexed commitment, uint32 leafIndex, uint256 timestamp);
  event Withdrawal(address to, bytes32 nullifierHash, address indexed relayer, uint256 fee);

  /**
    @dev The constructor
    @param _verifier the address of SNARK verifier for this contract
    @param _denomination transfer amount for each deposit
    @param _merkleTreeHeight the height of deposits' Merkle Tree
    @param _owner operator address (see operator comment above)
  */
  constructor(
    IVerifier _verifier,
    uint256 _denomination,
    uint32 _merkleTreeHeight,
    address _owner,
    uint256 _fee
  ) MerkleTreeWithHistory(_merkleTreeHeight) TwoStepOwnerable(_owner) {
    require(_denomination > 0, "denomination should be greater than 0");
    verifier = _verifier;
    denomination = _denomination;
    fee = _fee;
  }

  /**
    @dev Set fee
    @param _fee fee amount that is sent to operator when user withdraw
  */
  function setFee(uint256 _fee) external onlyOwner {
    require(_fee <= 1000, "Operator fee has to be smaller than 10%");
    fee = _fee;
  }

  /**
    @dev Deposit funds into the contract. The caller must send (for ETH) or approve (for ERC20) value equal to or `denomination` of this instance.
    @param _commitment the note commitment, which is PedersenHash(nullifier + secret)
  */
  function deposit(bytes32 _commitment) external payable nonReentrant {
    require(!commitments[_commitment], "The commitment has been submitted");

    uint32 insertedIndex = _insert(_commitment);
    commitments[_commitment] = true;
    _processDeposit();

    emit Deposit(_commitment, insertedIndex, block.timestamp);
  }

  /** @dev this function is defined in a child contract */
  function _processDeposit() internal virtual;

  /**
    @dev Withdraw a deposit from the contract. `proof` is a zkSNARK proof data, and input is an array of circuit public inputs
    `input` array consists of:
      - merkle root of all deposits in the contract
      - hash of unique deposit nullifier to prevent double spends
      - the recipient of funds
      - optional fee that goes to the transaction sender (usually a relay)
  */
  function withdraw(uint[2] memory a, uint[2][2] memory b, uint[2] memory c,  bytes32 _root, bytes32 _nullifierHash, address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) external payable nonReentrant {
    require(_fee <= denomination, "Fee exceeds transfer value");
    require(!nullifierHashes[_nullifierHash], "The note has been already spent");
    require(isKnownRoot(_root), "Cannot find your merkle root"); // Make sure to use a recent one
    require(verifier.verifyProof(a, b, c, [uint256(_root), uint256(_nullifierHash), uint256(uint160(address(_recipient))), uint256(uint160(address(_relayer))), _fee, _refund]), "Invalid withdraw proof");

    nullifierHashes[_nullifierHash] = true;
    _processWithdraw(_recipient, _relayer, _fee, _refund);
    emit Withdrawal(_recipient, _nullifierHash, _relayer, _fee);
  }

  /** @dev this function is defined in a child contract */
  function _processWithdraw(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) internal virtual;

  /** @dev whether a note is already spent */
  function isSpent(bytes32 _nullifierHash) public view returns(bool) {
    return nullifierHashes[_nullifierHash];
  }

  /** @dev whether an array of notes is already spent */
  function isSpentArray(bytes32[] calldata _nullifierHashes) external view returns(bool[] memory spent) {
    spent = new bool[](_nullifierHashes.length);
    for(uint i = 0; i < _nullifierHashes.length; ++i) {
      if (isSpent(_nullifierHashes[i])) {
        spent[i] = true;
      }
    }
  }
}
