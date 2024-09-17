// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface ISubContract {
    function distributePrizes(address[] memory winners, uint256[] memory prizeAmounts) external;
    function cleanupTournament() external;
    function registerTeam(address manager, address[] memory _players, uint256 entryFeeAfterTax) external;
    function setEntryFee(uint256 _newEntryFee) external;
    function withdrawTokens(address _to, uint256 _amount) external;
    function setCaptainRoyalty(uint256 _newRoyalty) external;
    function addToRewardPool(uint256 _amount) external;
    function getRewardPoolBalance() external view returns (uint256);
}

contract MainTournamentContract is AccessControl {
    
    IERC20 public paymentToken;
    uint256 public constant TAX_RATE = 625; // 6.25% expressed as basis points
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public collectedTax;
    
    struct SubContractInfo {
        uint256 playerCount;
        bool isActive;
        uint256 entryFee;
    }
    
    mapping(address => SubContractInfo) public subContracts;
    mapping(address => address) public managerToSubContract;

    event SubContractAdded(address subContract, uint256 playerCount, uint256 entryFee);
    event PrizesDistributed(address subContract, uint256 totalPrize);
    event TournamentCleaned(address subContract);
    event TeamRegistered(address manager, address subContract);
    event TaxCollected(uint256 amount);
    event TaxWithdrawn(address to, uint256 amount);

    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant MANAGER_ROLE = keccak256("MANAGER_ROLE");

    constructor(address _paymentToken) {
        paymentToken = IERC20(_paymentToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function registerTeam(address _subContract, address[] memory _players) external onlyRole(MANAGER_ROLE) {
        require(subContracts[_subContract].isActive, "SubContract not found or inactive");
        require(_players.length == subContracts[_subContract].playerCount, "Invalid number of players");

        uint256 entryFee = subContracts[_subContract].entryFee;
        uint256 taxAmount = (entryFee * TAX_RATE) / BASIS_POINTS;
        uint256 entryFeeAfterTax = entryFee - taxAmount;

        require(paymentToken.transferFrom(msg.sender, address(this), entryFee), "Entry fee transfer failed");
        
        collectedTax += taxAmount;
        emit TaxCollected(taxAmount);

        // Transfer entryFeeAfterTax to the SubContract
        require(paymentToken.transfer(_subContract, entryFeeAfterTax), "Transfer to SubContract failed");
        
        ISubContract(_subContract).registerTeam(msg.sender, _players, entryFeeAfterTax);
        
        managerToSubContract[msg.sender] = _subContract;
        emit TeamRegistered(msg.sender, _subContract);
    }
    
    function addSubContract(address _subContract, uint256 _playerCount, uint256 _entryFee) external onlyRole(ADMIN_ROLE) {
        require(!subContracts[_subContract].isActive, "SubContract already exists");
        subContracts[_subContract] = SubContractInfo(_playerCount, true, _entryFee);
        emit SubContractAdded(_subContract, _playerCount, _entryFee);
    }
    
    function distributePrizes(address _subContract, address[] memory _winningManagers, uint256[] memory _prizeAmounts) external onlyRole(ADMIN_ROLE) {
        require(subContracts[_subContract].isActive, "SubContract not found or inactive");
        require(_winningManagers.length == _prizeAmounts.length, "Winners and prize amounts mismatch");
        
        uint256 totalPrize = 0;
        for (uint256 i = 0; i < _prizeAmounts.length; i++) {
            totalPrize += _prizeAmounts[i];
        }
        
        ISubContract(_subContract).distributePrizes(_winningManagers, _prizeAmounts);
        
        emit PrizesDistributed(_subContract, totalPrize);
    }
    
    function cleanupTournament(address _subContract) external onlyRole(ADMIN_ROLE) {
        require(subContracts[_subContract].isActive, "SubContract not found or inactive");
        ISubContract(_subContract).cleanupTournament();
        subContracts[_subContract].isActive = false;
        emit TournamentCleaned(_subContract);
    }
    
    function setSubContractEntryFee(address _subContract, uint256 _newEntryFee) external onlyRole(ADMIN_ROLE) {
        require(subContracts[_subContract].isActive, "SubContract not found or inactive");
        subContracts[_subContract].entryFee = _newEntryFee;
        ISubContract(_subContract).setEntryFee(_newEntryFee);
    }

    function withdrawSubContractTokens(address _subContract, address _to, uint256 _amount) external onlyRole(ADMIN_ROLE) {
        require(subContracts[_subContract].isActive, "SubContract not found or inactive");
        ISubContract(_subContract).withdrawTokens(_to, _amount);
    }

    function setSubContractCaptainRoyalty(address _subContract, uint256 _newRoyalty) external onlyRole(ADMIN_ROLE) {
        require(subContracts[_subContract].isActive, "SubContract not found or inactive");
        ISubContract(_subContract).setCaptainRoyalty(_newRoyalty);
    }

    function withdrawTax(address _to, uint256 _amount) external onlyRole(ADMIN_ROLE) {
        require(_amount <= collectedTax, "Insufficient collected tax");
        require(paymentToken.transfer(_to, _amount), "Tax withdrawal failed");
        collectedTax -= _amount;
        emit TaxWithdrawn(_to, _amount);
    }

    function getCollectedTax() external view returns (uint256) {
        return collectedTax;
    }
}