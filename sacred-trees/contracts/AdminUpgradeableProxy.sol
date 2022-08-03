// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";

/**
 * @dev TransparentUpgradeableProxy where admin is allowed to call implementation methods.
 */
contract AdminUpgradeableProxy is TransparentUpgradeableProxy {
  /**
   * @dev Initializes an upgradeable proxy backed by the implementation at `_logic`.
   */
  constructor(
    address _logic,
    address _admin,
    bytes memory _data
  ) payable TransparentUpgradeableProxy(_logic, _admin, _data) {}

  /**
   * @dev Override to allow admin access the fallback function.
   */
  function _beforeFallback() internal override {}
}
