import random
import numpy as np

def weighted_bet_amount(max_bet_amount, power=2):
    return int((1 - random.random() ** power) * max_bet_amount) + 1

class BettingSimulation:
    def __init__(self, initial_balance, num_bettors, max_bet_amount, implied_probability, borrow_limit_percentage):
        self.initial_balance = initial_balance
        self.balance = initial_balance
        self.num_bettors = num_bettors
        self.max_bet_amount = max_bet_amount
        self.implied_probability = implied_probability
        self.total_bets_team_a = 0
        self.total_bets_team_b = 0
        self.borrow_limit_percentage = borrow_limit_percentage
        self.borrowed_amount = 0

    def simulate_bets(self):
        for _ in range(self.num_bettors):
            bet_amount = weighted_bet_amount(self.max_bet_amount)
            team = random.choice(['A', 'B'])
            
            if team == 'A':
                self.total_bets_team_a += bet_amount
            else:
                self.total_bets_team_b += bet_amount
            
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

    def calculate_payouts(self, result):
        odds_a, odds_b = self.calculate_odds()
        
        if result == 'A':
            payout = (self.total_bets_team_a * odds_a * 95) // (100 * 1e18)
        elif result == 'B':
            payout = (self.total_bets_team_b * odds_b * 95) // (100 * 1e18)

        
        return payout

    def borrow(self, amount_needed):
        max_borrow = self.initial_balance * self.borrow_limit_percentage / 100
        borrow_amount = min(amount_needed, max_borrow)
        self.borrowed_amount += borrow_amount
        self.balance += borrow_amount
        return borrow_amount

    def run_simulation(self):
        self.simulate_bets()
        result = self.simulate_match_result()
        payout = self.calculate_payouts(result)
        
        if payout > self.balance:
            borrowed = self.borrow(payout - self.balance)
        else:
            borrowed = 0

        total_bets = self.total_bets_team_a + self.total_bets_team_b
        profit = self.balance - payout - self.borrowed_amount
        profit_percentage = (profit / total_bets) * 100 if total_bets > 0 else 0
        return profit_percentage, borrowed

def run_multiple_simulations(num_simulations, initial_balance, num_bettors, max_bet_amount, implied_probability, borrow_limit_percentage):
    profit_percentages = []
    borrowed_amounts = []
    
    for _ in range(num_simulations):
        sim = BettingSimulation(initial_balance, num_bettors, max_bet_amount, implied_probability, borrow_limit_percentage)
        profit_percentage, borrowed = sim.run_simulation()
        profit_percentages.append(profit_percentage)
        borrowed_amounts.append(borrowed)
    
    return profit_percentages, borrowed_amounts

# Simulation parameters
num_simulations = 10000
initial_balance = 1000000  # 1 million tokens
num_bettors = 1000
max_bet_amount = 1000
implied_probability = 1025  # 102.5%
borrow_limit_percentage = 1  # 1% of initial balance

profit_percentages, borrowed_amounts = run_multiple_simulations(num_simulations, initial_balance, num_bettors, max_bet_amount, implied_probability, borrow_limit_percentage)

average_profit_percentage = np.mean(profit_percentages)
std_dev_profit_percentage = np.std(profit_percentages)
average_borrowed = np.mean(borrowed_amounts)
max_borrowed = max(borrowed_amounts)
borrow_frequency = sum(1 for amount in borrowed_amounts if amount > 0) / num_simulations * 100

print(f"Average profit percentage: {average_profit_percentage:.2f}%")
print(f"Standard deviation of profit percentage: {std_dev_profit_percentage:.2f}%")
print(f"Average borrowed amount: {average_borrowed:.2f}")
print(f"Maximum borrowed amount: {max_borrowed:.2f}")
print(f"Frequency of borrowing: {borrow_frequency:.2f}%")

# Calculate profit percentages for different borrowing limits
borrow_limits = [0.5, 1, 2, 5]
results = []

for limit in borrow_limits:
    profit_percentages, _ = run_multiple_simulations(num_simulations, initial_balance, num_bettors, max_bet_amount, implied_probability, limit)
    avg_profit = np.mean(profit_percentages)
    results.append((limit, avg_profit))

print("\nProfit percentages for different borrowing limits:")
for limit, profit in results:
    print(f"Borrow limit: {limit}%, Average profit: {profit:.2f}%")