// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "./ERC20Permit.sol";

contract SACRED is ERC20("SacredCash", "SACRED"), ERC20Burnable, ERC20Permit {
  constructor(address initialReceiver, uint256 amount) {
    _mint(initialReceiver, amount);
  }
}
