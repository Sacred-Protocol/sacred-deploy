// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IBatchTreeUpdateVerifier {
  function verifyProof(bytes calldata proof, uint256[1] calldata input) external view returns (bool);
}
