// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

interface IHasher {
  function poseidon(bytes32[2] calldata inputs) external pure returns (bytes32);

  function poseidon(bytes32[3] calldata inputs) external pure returns (bytes32);
}
