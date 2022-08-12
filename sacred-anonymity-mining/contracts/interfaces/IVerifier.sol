// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IVerifier {
  function verifyProof(uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[15] memory input) external view returns (bool);
  function verifyProof(uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[4] memory input) external view returns (bool);
  function verifyProof(uint[2] memory a, uint[2][2] memory b, uint[2] memory c, uint[16] memory input) external view returns (bool);
}
