// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./Sacred.sol";

interface Pool {
  function supply( address asset, uint256 amount, address onBehalfOf, uint16 referralCode) external;
  function withdraw(address asset, uint256 amount, address to) external;
}

contract ERC20Sacred is Sacred {
  address public token;
  address public lendingPoolAddressProvider;
  address public aToken;
  address public aaveInterestsProxy;
  uint256 private collateralAmount;
  uint256 public totalAaveInterests;
  
  constructor(
    IVerifier _verifier,
    uint256 _denomination,
    uint32 _merkleTreeHeight,
    address _lendingPoolAddressProvider,
    address _aToken,
    address _owner,
    address _token,
    uint256 _fee
  ) Sacred(_verifier, _denomination, _merkleTreeHeight, _owner, _fee) {
    token = _token;
    lendingPoolAddressProvider = _lendingPoolAddressProvider;
    aToken = _aToken;
  }

  function _processDeposit() internal override {
    require(msg.value == 0, "ETH value is supposed to be 0 for ERC20 instance");
    _safeErc20TransferFrom(msg.sender, address(this), denomination);
    address lendingPool = AddressesProvider(lendingPoolAddressProvider).getPool();
    require(IERC20(token).approve(lendingPool, denomination), "token approval failed");
    Pool(lendingPool).supply(token, denomination, address(this), 0);
    collateralAmount += denomination;
    collectAaveInterests();
  }

  function _processWithdraw(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) internal override{
    require(msg.value == _refund, "Incorrect refund amount received by the contract");
    address lendingPool = AddressesProvider(lendingPoolAddressProvider).getPool();
    uint256 operatorFee = denomination * fee / 10000;
    require(AToken(aToken).approve(lendingPool, denomination), "aToken approval failed");
    Pool(lendingPool).withdraw(aToken, denomination - operatorFee - _fee, _recipient);

    if (operatorFee > 0) {
      Pool(lendingPool).withdraw(aToken, operatorFee, owner);
    }

    if (_fee > 0) {
      Pool(lendingPool).withdraw(aToken, _fee, _relayer);
    }
    collateralAmount -= denomination;
    collectAaveInterests();

    if (_refund > 0) {
      (bool success, ) = _recipient.call{value:_refund}("");
      if (!success) {
        // let's return _refund back to the relayer
        _relayer.transfer(_refund);
      }
    }
  }

  function _safeErc20TransferFrom(address _from, address _to, uint256 _amount) internal {
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0x23b872dd /* transferFrom */, _from, _to, _amount));
    require(success, "not enough allowed tokens");

    // if contract returns some data lets make sure that is `true` according to standard
    if (data.length > 0) {
      require(data.length == 32, "data length should be either 0 or 32 bytes");
      success = abi.decode(data, (bool));
      require(success, "not enough allowed tokens. Token returns false.");
    }
  }

  function _safeErc20Transfer(address _to, uint256 _amount) internal {
    (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb /* transfer */, _to, _amount));
    require(success, "not enough tokens");

    // if contract returns some data lets make sure that is `true` according to standard
    if (data.length > 0) {
      require(data.length == 32, "data length should be either 0 or 32 bytes");
      success = abi.decode(data, (bool));
      require(success, "not enough tokens. Token returns false.");
    }
  }

  function setAaveInterestsProxy(address _aaveInterestsProxy) external onlyOwner {
    aaveInterestsProxy = _aaveInterestsProxy;
  }

  function collectAaveInterests() private {
    uint256 interests = AToken(aToken).balanceOf(address(this)) - collateralAmount;
    if(interests > 0 && aaveInterestsProxy != address(0)) {
      address lendingPool = AddressesProvider(lendingPoolAddressProvider).getPool();
      require(AToken(aToken).approve(lendingPool, interests), "aToken approval failed");
      Pool(lendingPool).withdraw(aToken, interests, aaveInterestsProxy);
      totalAaveInterests += interests;
    }
  }
}
