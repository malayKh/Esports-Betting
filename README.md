# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.js
```

# Betting Smart Contract

A Solidity-based decentralized betting contract for two-outcome events (Team A vs Team B) with dynamic odds, early withdrawals, and liquidity support via a staking contract.

---

## ⚙️ Core Idea

- Users bet ERC20 tokens on either Team A or Team B
- Odds adjust dynamically based on total bets
- Early bettors get better odds
- Contract borrows liquidity if needed to ensure payouts

---

## 🔑 Key Features

- **Dynamic Odds** based on pool distribution
- **Early Withdrawal** with penalty/reward depending on odds movement
- **Liquidity Borrowing** via staking contract
- **Secure Payouts** after match resolution
- **Max Bet Control** to manage risk exposure

---

## 🎯 Match Lifecycle

1. `startMatch()`  
   - Resets state  
   - Borrows initial liquidity  
   - Seeds both sides  

2. Users place bets  
   - `placeBetOnTeamA(amount)`  
   - `placeBetOnTeamB(amount)`

3. (Optional) Early withdrawal  
   - `withdrawBetOnTeamA(amount)`  
   - `withdrawBetOnTeamB(amount)`

4. `endMatch(result)`  
   - Sets final outcome  
   - Borrows funds if needed  

5. `withdrawAfterMatch()`  
   - Winners claim payouts  

---

## 📊 Odds Model

- Odds are pool-driven (not fixed)
- Includes house edge via:

impliedProbability (default: 103.5%)


- Formula (simplified):

odds ∝ totalPool / teamPool


---

## 💸 Early Withdrawal Logic

- **If odds improve** → partial profit
- **If odds worsen** → partial refund

Controlled by:

earlyWithdrawalLimit (default: 80%)


---

## 🔒 Security

- `ReentrancyGuard`
- `SafeERC20`
- `onlyOwner` access control
- Pausable withdrawals

---

## 📌 Notes

- Bets accumulate per user per team
- Odds are locked at bet time
- Contract may borrow to stay solvent
- Max bet scales with available liquidity

# Main Tournament Contract

A Solidity contract that manages tournament entry, tax collection, and coordination with multiple sub-contracts responsible for game logic and prize distribution.

---

## ⚙️ Core Idea

- Players (via managers) register teams into tournaments
- Entry fees are collected in ERC20 tokens
- A platform tax (6.25%) is deducted
- Remaining funds are sent to sub-contracts
- Sub-contracts handle gameplay, rewards, and payouts

---

## 🧩 Architecture

- **Main Contract** → Handles payments, tax, and coordination  
- **Sub Contracts** → Handle tournament logic, rewards, and player management  

---

## 🔑 Key Features

- **Role-Based Access**
  - `ADMIN_ROLE` → controls tournaments
  - `MANAGER_ROLE` → registers teams

- **Tax System**
  - 6.25% fee on every entry
  - Accumulated and withdrawable by admin

- **Modular Design**
  - Supports multiple tournaments via sub-contracts

---

## 🎮 Core Flow

1. Admin adds a tournament:

addSubContract(subContract, playerCount, entryFee)


2. Manager registers a team:

registerTeam(subContract, players)

- Transfers entry fee
- Deducts tax
- Sends remaining funds to sub-contract

3. Admin distributes prizes:

distributePrizes(subContract, winners, amounts)


4. Tournament cleanup:

cleanupTournament(subContract)


---

## 💰 Tax Logic

- Tax = `6.25%` (625 basis points)
- Collected in contract
- Withdrawable via:

withdrawTax(to, amount)


---

## 🛠 Admin Functions

- `addSubContract()` → Register new tournament
- `setSubContractEntryFee()` → Update entry fee
- `distributePrizes()` → Send rewards
- `cleanupTournament()` → Close tournament
- `withdrawSubContractTokens()` → Recover funds
- `setSubContractCaptainRoyalty()` → Adjust royalty
- `withdrawTax()` → Withdraw platform fees

---

## 📌 Notes

- Each manager can register one team per sub-contract
- Sub-contract must be active to interact
- Entry fee includes tax deduction before forwarding
- Main contract does not manage prize logic directly

