// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IVerifier {
  function verifyProof(bytes calldata proof, uint256[4] calldata input) external view returns (bool);

  function verifyProof(bytes calldata proof, uint256[8] calldata input) external view returns (bool);

  function verifyProof(bytes calldata proof, uint256[14] calldata input) external view returns (bool);
}
