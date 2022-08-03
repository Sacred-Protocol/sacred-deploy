// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../SACRED.sol";
import "./Timestamp.sol";

contract SACREDMock is SACRED, Timestamp {
  uint256 public chainId;

  constructor(address initialReceiver, uint256 amount) SACRED(initialReceiver, amount) {

  }

  function setChainId(uint256 _chainId) public {
    chainId = _chainId;
  }

  function chainID() public view override returns (uint256) {
    return chainId;
  }

  function blockTimestamp() public view override(Timestamp, ERC20Permit) returns (uint256) {
    return Timestamp.blockTimestamp();
  }
}
