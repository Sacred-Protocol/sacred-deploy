// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract ERC20Basic {
    uint public _totalSupply;
    function totalSupply() external view virtual returns (uint);
    function balanceOf(address who) external view virtual returns (uint);
    function transfer(address to, uint value) external virtual;
    event Transfer(address indexed from, address indexed to, uint value);
}

/**
 * @title ERC20 interface
 * @dev see https://github.com/ethereum/EIPs/issues/20
 */
abstract contract IUSDT is ERC20Basic {
    function allowance(address owner, address spender) external view virtual returns (uint);
    function transferFrom(address from, address to, uint value) external virtual;
    function approve(address spender, uint value) external virtual;
    event Approval(address indexed owner, address indexed spender, uint value);
}
