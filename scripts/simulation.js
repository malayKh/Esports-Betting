const { ethers } = require("hardhat");

const MatchResult = {
    Undecided: 0,
    TeamAWin: 1,
    TeamBWin: 2,
    Tie: 3
};

async function deployContract(initialBalance) {
    const Betting = await ethers.getContractFactory("Betting");
    const betting = await Betting.deploy();
    await betting.deployed();

    // Send initial balance to the contract
    const [deployer] = await ethers.getSigners();
    await deployer.sendTransaction({
        to: betting.address,
        value: ethers.utils.parseEther(initialBalance.toString())
    });

    return betting;
}

async function runSimulation(numSimulations, numBettors, maxBetAmount, initialContractBalance) {
    const profitPercentages = [];

    for (let i = 0; i < numSimulations; i++) {
        console.log(`Running simulation ${i + 1} of ${numSimulations}`);
        const contract = await deployContract(initialContractBalance);
        const signers = await ethers.getSigners();

        let totalBets = ethers.BigNumber.from(0);

        // Simulate bettors placing bets
        for (let j = 0; j < numBettors; j++) {
            const bettor = signers[Math.floor(Math.random() * signers.length)];
            const betAmount = ethers.utils.parseEther((Math.random() * maxBetAmount).toFixed(18));
            const betOnTeamA = Math.random() < 0.5;

            try {
                const matchEnded = await contract.matchEnded();
                if (!matchEnded) {
                    if (betOnTeamA) {
                        await contract.connect(bettor).placeBetOnTeamA({ value: betAmount });
                    } else {
                        await contract.connect(bettor).placeBetOnTeamB({ value: betAmount });
                    }
                    totalBets = totalBets.add(betAmount);
                }
            } catch (error) {
                console.error("Error placing bet:", error.message);
            }
        }

        // Simulate match result
        const matchResult = Math.floor(Math.random() * 3) + 1; // 1: TeamAWin, 2: TeamBWin, 3: Tie
        await contract.endMatch(matchResult);

        // Calculate payouts
        for (const signer of signers) {
            try {
                await contract.connect(signer).withdrawAfterMatch();
            } catch (error) {
                if (!error.message.includes("No winning bet to withdraw") && 
                    !error.message.includes("No payout available")) {
                    console.error("Error during withdrawal:", error.message);
                }
            }
        }

        const contractBalance = await ethers.provider.getBalance(contract.address);
        const profit = contractBalance.sub(ethers.utils.parseEther(initialContractBalance.toString()));
        const profitPercentage = profit.mul(10000).div(totalBets).toNumber() / 100;
        profitPercentages.push(profitPercentage);
    }

    return profitPercentages;
}

function calculateMeanAndStdDev(array) {
    const n = array.length;
    const mean = array.reduce((a, b) => a + b) / n;
    const variance = array.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n;
    const stdDev = Math.sqrt(variance);
    return { mean, stdDev };
}

async function main() {
    const initialContractBalance = 10; // 10 ETH initial balance
    const profitPercentages = await runSimulation(900, 1000, 0.5, initialContractBalance);

    const { mean: averageProfitPercentage, stdDev: stdDevProfitPercentage } = calculateMeanAndStdDev(profitPercentages);

    console.log(`Average house profit percentage: ${averageProfitPercentage.toFixed(2)}%`);
    console.log(`Standard deviation of house profit percentage: ${stdDevProfitPercentage.toFixed(2)}%`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });