// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract TournamentSubContract is AccessControl {
    IERC20 public paymentToken;
    address public mainContract;
    uint256 public CAPTAIN_ROYALTY = 5; // 5%
    uint8 public constant TEAM_SIZE = 5;
    uint256 public entryFee;
    uint256 public rewardPool;
        
    struct Team {
        address[] players;
        bool isRegistered;
    }
    
    mapping(address => Team) public managerTeam;
    address[] public registeredManagers;
    
    event TeamRegistered(address manager);
    event PrizesDistributed(address[] winners, uint256[] amounts);
    event TournamentCleaned();
    event RewardPoolUpdated(uint256 newAmount);
    event EntryFeeUpdated(uint256 newEntryFee);
    event CaptainRoyaltyUpdated(uint256 newRoyalty);

    constructor(address _paymentToken, address _mainContract, uint256 _entryFee) {
        paymentToken = IERC20(_paymentToken);
        mainContract = _mainContract;
        entryFee = _entryFee;
        _grantRole(DEFAULT_ADMIN_ROLE, _mainContract);
    }

    function registerTeam(address _manager, address[] memory _players) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!managerTeam[_manager].isRegistered, "Team already registered");
        require(_players.length == TEAM_SIZE, "Invalid number of players");
        Team storage newTeam = managerTeam[_manager];
        newTeam.players = _players;
        
        newTeam.isRegistered = true;
        registeredManagers.push(_manager);
        
        // Handle entry fee payment
        require(paymentToken.transferFrom(_manager, address(this), entryFee), "Entry fee payment failed");
        rewardPool += entryFee;
        
        emit TeamRegistered(_manager);
        emit RewardPoolUpdated(rewardPool);
    }
    
    function distributePrizes(address[] memory _winningManagers, uint256[] memory _prizeAmounts) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_winningManagers.length == _prizeAmounts.length, "Winners and prize amounts mismatch");
        
        for (uint256 i = 0; i < _winningManagers.length; i++) {
            Team memory winningTeam = managerTeam[_winningManagers[i]];
            require(winningTeam.isRegistered, "Winner team not registered");
            
            uint256 captainShare = (_prizeAmounts[i] * CAPTAIN_ROYALTY) / 100;
            uint256 playerShare = (_prizeAmounts[i] - captainShare) / TEAM_SIZE;
            
            // Distribute to captain (first player in the array)
            require(paymentToken.transfer(winningTeam.players[0], captainShare), "Captain prize transfer failed");
            
            // Distribute to other players
            for (uint256 j = 1; j < TEAM_SIZE; j++) {
                require(paymentToken.transfer(winningTeam.players[j], playerShare), "Player prize transfer failed");
            }
            
            rewardPool -= _prizeAmounts[i];
        }
        
        emit PrizesDistributed(_winningManagers, _prizeAmounts);
        emit RewardPoolUpdated(rewardPool);
    }
    
    function cleanupTournament() external onlyRole(DEFAULT_ADMIN_ROLE) {
        for (uint256 i = 0; i < registeredManagers.length; i++) {
            delete managerTeam[registeredManagers[i]];
        }
        delete registeredManagers;
        
        emit TournamentCleaned();
    }
    
    function getTeamMembers(address _manager) external view returns (address[] memory) {
        require(managerTeam[_manager].isRegistered, "Team not registered");
        return managerTeam[_manager].players;
    }
    
    function setEntryFee(uint256 _newEntryFee) external onlyRole(DEFAULT_ADMIN_ROLE) {
        entryFee = _newEntryFee;
        emit EntryFeeUpdated(_newEntryFee);
    }
    
    function withdrawTokens(address _to, uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_amount <= rewardPool, "Insufficient funds in reward pool");
        require(paymentToken.transfer(_to, _amount), "Token transfer failed");
        rewardPool -= _amount;
        emit RewardPoolUpdated(rewardPool);
    }

    function setCaptainRoyalty(uint256 _newRoyalty) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_newRoyalty <= 100, "Royalty cannot exceed 100%");
        CAPTAIN_ROYALTY = _newRoyalty;
        emit CaptainRoyaltyUpdated(_newRoyalty);
    }

    function addToRewardPool(uint256 _amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(paymentToken.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");
        rewardPool += _amount;
        emit RewardPoolUpdated(rewardPool);
    }

    function getRewardPoolBalance() external view returns (uint256) {
        return rewardPool;
    }
}