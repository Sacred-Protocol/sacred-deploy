// SPDX-License-Identifier: MIT
pragma solidity 0.8.9;

import "./Sacred.sol";

interface WETHGateway {
    function depositETH(address lendingPool, address onBehalfOf, uint16 referralCode)
    external
    payable;
    
    function withdrawETH(address lendingPool, uint256 amount, address to)
    external;
}

contract ETHSacred is Sacred {

  address public lendingPoolAddressProvider;
  address public wETHGateway;
  address public wETHToken;
  address public aaveInterestsProxy;
  uint256 private collateralAmount;
  uint256 public totalAaveInterests;

  constructor (
    IVerifier _verifier,
    uint256 _denomination,
    uint32 _merkleTreeHeight,
    address _lendingPoolAddressProvider,
    address _wETHGateway,
    address _wETHToken,
    address _owner,
    uint256 _fee
  ) Sacred(_verifier, _denomination, _merkleTreeHeight, _owner, _fee) {
    lendingPoolAddressProvider = _lendingPoolAddressProvider;
    wETHGateway = _wETHGateway;
    wETHToken = _wETHToken;
  }

  function _processDeposit() internal override {
    require(msg.value == denomination, "Please send `mixDenomination` ETH along with transaction");
    address lendingPool = AddressesProvider(lendingPoolAddressProvider).getPool();
    WETHGateway(wETHGateway).depositETH{value:denomination}(lendingPool, address(this), 0);
    collateralAmount += denomination;
    collectAaveInterests();
  }

  function _processWithdraw(address payable _recipient, address payable _relayer, uint256 _fee, uint256 _refund) internal override {
    // sanity checks
    require(msg.value == 0, "Message value is supposed to be zero for ETH instance");
    require(_refund == 0, "Refund value is supposed to be zero for ETH instance");

    address lendingPool = AddressesProvider(lendingPoolAddressProvider).getPool();
    uint256 operatorFee = denomination * fee / 10000;
    require(AToken(wETHToken).approve(wETHGateway, denomination), "aToken approval failed");
    WETHGateway(wETHGateway).withdrawETH(lendingPool, denomination - operatorFee - _fee, _recipient);

    if (operatorFee > 0) {
      WETHGateway(wETHGateway).withdrawETH(lendingPool, operatorFee, owner);
    }

    if (_fee > 0) {
      WETHGateway(wETHGateway).withdrawETH(lendingPool, _fee, _relayer);
    }
    collateralAmount -= denomination;
    collectAaveInterests();
  }

  function setAaveInterestsProxy(address _aaveInterestsProxy) external onlyOwner {
    aaveInterestsProxy = _aaveInterestsProxy;
  }

  function collectAaveInterests() private {
    uint256 interests = AToken(wETHToken).balanceOf(address(this)) - collateralAmount;
    if(interests > 0 && aaveInterestsProxy != address(0)) {
      address lendingPool = AddressesProvider(lendingPoolAddressProvider).getPool();
      require(AToken(wETHToken).approve(wETHGateway, interests), "aToken approval failed");
      WETHGateway(wETHGateway).withdrawETH(lendingPool, interests, aaveInterestsProxy);
      totalAaveInterests += interests;
    }
  }
}
