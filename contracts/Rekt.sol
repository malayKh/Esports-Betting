// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract REKT is ERC20, AccessControl, Pausable {
    uint256 public constant MAX_SUPPLY = 700000000 * 10**18; // 700 million tokens
    
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    
    event Mint(address indexed account, uint256 amount);
    event Burn(address indexed account, uint256 amount);

    constructor(string memory name_, string memory symbol_)  
         ERC20(name_, symbol_)
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);
    }

    function mint(address account, uint256 amount) public onlyRole(MINTER_ROLE) whenNotPaused {
        require(account != address(0), "ERC20: mint to the zero address");
        require(totalSupply() + amount <= MAX_SUPPLY, "Exceeds maximum supply");
        _mint(account, amount);
        emit Mint(account, amount);
    }

    function burn(uint256 amount) public {
        _burn(_msgSender(), amount);
        emit Burn(_msgSender(), amount);
    }

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        return super.transfer(to, amount);
    }

    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        return super.transferFrom(from, to, amount);
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        return super.approve(spender, amount);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}