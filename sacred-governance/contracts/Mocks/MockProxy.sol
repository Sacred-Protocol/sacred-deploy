//SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "../LoopbackProxy.sol";

contract MockProxy is LoopbackProxy {
  constructor(address _logic, bytes memory _data) payable LoopbackProxy(_logic, _data) {}

}
