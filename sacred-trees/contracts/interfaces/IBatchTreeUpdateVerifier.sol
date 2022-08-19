// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IBatchTreeUpdateVerifier {
  function verifyProof(uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint256[1] calldata input) external view returns (bool);
}
