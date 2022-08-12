// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

interface ISacredInstance {
  function token() external view returns (address);

  function denomination() external view returns (uint256);

  function deposit(bytes32 commitment) external payable;

  function withdraw(
    uint[2] memory a, 
    uint[2][2] memory b, 
    uint[2] memory c,
    bytes32 root,
    bytes32 nullifierHash,
    address payable recipient,
    address payable relayer,
    uint256 fee,
    uint256 refund
  ) external payable;
}
