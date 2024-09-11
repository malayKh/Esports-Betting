import random
import numpy as np
import matplotlib.pyplot as plt
import time

def weighted_bet_amount(max_bet_amount, power=2):
    return int((1 - random.random() ** power) * max_bet_amount) + 1

class Bet:
    def __init__(self, amount, odds):
        self.amount = amount
        self.odds = odds

class BettingSimulation:
    def __init__(self, initial_balance, num_bettors, implied_probability, borrow_limit_percentage):
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.num_bettors = num_bettors
        self.implied_probability = implied_probability
        self.borrow_limit_percentage = borrow_limit_percentage
        self.max_bet_amount = int(initial_balance * borrow_limit_percentage / 100)
        self.total_bets_team_a = 0
        self.total_bets_team_b = 0
        self.borrowed_amount = 0
        self.bets_on_team_a = []
        self.bets_on_team_b = []
        self.total_bets_team_a = 4 * self.max_bet_amount
        self.total_bets_team_b = 4 * self.max_bet_amount
        self.borrowed_amount = 8 * self.max_bet_amount
        self.balance -= self.borrowed_amount

    def simulate_bets(self):
         for _ in range(self.num_bettors):
            bet_amount = weighted_bet_amount(self.max_bet_amount)
            team = random.choice(['A', 'B'])
            odds_a, odds_b = self.calculate_odds()
            
            if team == 'A':
                self.total_bets_team_a += bet_amount
                self.bets_on_team_a.append(Bet(bet_amount, odds_a))
            else:
                self.total_bets_team_b += bet_amount
                self.bets_on_team_b.append(Bet(bet_amount, odds_b))
            
            self.balance += bet_amount

    def calculate_odds(self):
        total_bets = self.total_bets_team_a + self.total_bets_team_b
        if total_bets == 0:
            return 0, 0
        
        p_a = (self.total_bets_team_a * self.implied_probability) / total_bets
        p_b = (self.total_bets_team_b * self.implied_probability) / total_bets
        
        odds_a = (1e18 * 1000) // p_a if p_a > 0 else 0
        odds_b = (1e18 * 1000) // p_b if p_b > 0 else 0
        
        return odds_a, odds_b

    def simulate_match_result(self):
        return random.choice(['A', 'B'])
    
    def calculate_withdrawal_amount(self, bet_amount, original_odds, current_odds):
        # Calculate potential payout at original odds and current odds
        original_payout = (bet_amount * original_odds) // 1e18
        current_payout = (bet_amount * current_odds) // 1e18

        if current_odds <= original_odds:
            # Odds have improved, allow withdrawal up to current potential payout
            odds_improvement = (original_odds - current_odds) / original_odds
            max_percentage = min(0.8, odds_improvement*0.8)  # Cap at 80%
            return min(int(original_payout * max_percentage), original_payout*0.8)
        else:
            # Odds have worsened, reduce withdrawal amount
            odds_worsening = (current_odds - original_odds) / original_odds
            min_percentage = max(0.0, 0.8 - odds_worsening)  # Minimum 0%
            return min(int(bet_amount * min_percentage), original_payout)

    
    def simulate_early_withdrawals(self):
        early_withdrawal_amount = 0
        current_odds_a, current_odds_b = self.calculate_odds()
        for team in ['A', 'B']:
            bets = self.bets_on_team_a if team == 'A' else self.bets_on_team_b
            total_bets = self.total_bets_team_a if team == 'A' else self.total_bets_team_b
            current_odds = current_odds_a if team == 'A' else current_odds_b

            for bet in bets[:]:  # Use a copy of the list to avoid modifying while iterating
                if random.random() < 0.40:  # 10% chance of early withdrawal
                    # Calculate withdrawal amount based on current odds
                    withdrawal_amount = self.calculate_withdrawal_amount(bet.amount, bet.odds, current_odds)
                    early_withdrawal_amount += withdrawal_amount
                    total_bets -= bet.amount
                    bets.remove(bet)
            
            if team == 'A':
                self.total_bets_team_a = total_bets
                self.bets_on_team_a = bets
            else:
                self.total_bets_team_b = total_bets
                self.bets_on_team_b = bets
        
        self.balance -= early_withdrawal_amount

    def calculate_payouts(self, result):
        payout = 0
        if result == 'A':
            for bet in self.bets_on_team_a:
                payout += (bet.amount * bet.odds) // 1e18
        elif result == 'B':
            for bet in self.bets_on_team_b:
                payout += (bet.amount * bet.odds) // 1e18

        return payout
    
    def borrow(self, amount_needed):
        max_borrow = self.initial_balance * self.borrow_limit_percentage / 100
        borrow_amount = min(amount_needed, max_borrow)
        self.borrowed_amount += borrow_amount
        self.balance += borrow_amount
        return borrow_amount

    def run_simulation(self):
        self.simulate_bets()
        self.simulate_early_withdrawals()
        result = self.simulate_match_result()
        payout = self.calculate_payouts(result)
        
        if payout > self.balance:
            self.borrow(payout - self.balance)

        total_bets = self.total_bets_team_a + self.total_bets_team_b
        profit = self.balance - payout - self.borrowed_amount - self.initial_balance 

        if profit > 0:
            self.balance += self.borrowed_amount  # Repay the initial borrowed amount
            self.borrowed_amount = 0

        profit_percentage = (profit / self.initial_balance) * 100 if total_bets > 0 else 0
        return profit_percentage

def run_multiple_simulations(num_simulations, initial_balance, num_bettors, implied_probability, borrow_limit_percentage):
    profit_percentages = []
    
    for _ in range(num_simulations):
        sim = BettingSimulation(initial_balance, num_bettors, implied_probability, borrow_limit_percentage)
        profit_percentage = sim.run_simulation()
        profit_percentages.append(profit_percentage)
    
    return np.mean(profit_percentages), np.std(profit_percentages)

# Simulation parameters
num_simulations = 1000
initial_balance = 1000000  # 1 million tokens
num_bettors = 10000
implied_probability = 1035  # 103.5%

# Range of borrowing percentages to simulate
borrow_limits = np.linspace(0.01, 1, 50)
profit_percentages = []
profit_std_devs = []

for limit in borrow_limits:
    avg_profit, std_dev = run_multiple_simulations(num_simulations, initial_balance, num_bettors, implied_probability, limit)
    profit_percentages.append(avg_profit)
    profit_std_devs.append(std_dev)

# Plotting the results
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(12, 10))

# Plot for Average Profit
ax1.plot(borrow_limits, profit_percentages, marker='o', color='blue')
ax1.set_title('Average Profit Percentage vs Borrowing Percentage')
ax1.set_xlabel('Borrowing Percentage')
ax1.set_ylabel('Average Profit Percentage')
ax1.grid(True)

# Plot for Standard Deviation
ax2.plot(borrow_limits, profit_std_devs, marker='o', color='red')
ax2.set_title('Profit Standard Deviation vs Borrowing Percentage')
ax2.set_xlabel('Borrowing Percentage')
ax2.set_ylabel('Profit Standard Deviation')
ax2.grid(True)

plt.tight_layout()
plt.show()

# Print the results
print("\nProfit percentages and standard deviations for different borrowing limits:")
for limit, profit, std_dev in zip(borrow_limits, profit_percentages, profit_std_devs):
    print(f"Borrow limit: {limit:.2f}%, Average profit: {profit:.2f}%, Std Dev: {std_dev:.2f}%")

# Borrow limit: 0.01%, Average profit: 17.66%, Std Dev: 0.65%
# Borrow limit: 0.03%, Average profit: 52.39%, Std Dev: 1.90%
# Borrow limit: 0.05%, Average profit: 87.36%, Std Dev: 2.96%
# Borrow limit: 0.07%, Average profit: 122.15%, Std Dev: 4.26%
# Borrow limit: 0.09%, Average profit: 156.54%, Std Dev: 5.54%
# Borrow limit: 0.11%, Average profit: 191.54%, Std Dev: 6.79%
# Borrow limit: 0.13%, Average profit: 226.75%, Std Dev: 7.87%