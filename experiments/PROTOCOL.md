# Task-budget pilot v1 — protocol frozen before the first run

Date: 2026-09-09. This is a feasibility experiment, not evidence of production savings.

## Hypothesis and scope

For small WETH → USDC tasks that can wait up to three minutes, a task-level
cost target may reduce total gas paid without relaxing the original output floor.
Waiting may also miss a trade. We will report both outcomes.

No user wallet, private key, mainnet transaction, new deployed contract, or change
to another project is involved. Only a loopback Anvil instance with chain ID 31337
may receive write RPC calls. Mainnet is a read-only source for fork state.

## Stage A: measured local-fork gas calibration

- Pin the current mainnet block once; record its hash, timestamp and source RPC.
- Anvil 1.7.1, loopback only, development accounts, fake funds, isolated snapshots.
- WETH → USDC; amounts 0.01, 0.04 and 0.2 WETH; Uniswap v3 fees 500 and 3000.
- Compare identical starting state for each trial. Use legacy SwapRouter02's
  deadline-bound multicall/exactInputSingle path, as in our existing verifier.
- For each amount and fee, measure a successful swap and a deliberately reverted
  swap (minimum output = observed quote + 1). Measure exact-amount approval from
  zero allowance. Receipts, balance deltas, gas used and effective gas prices are
  evidence. QuoterV2's internal estimate is recorded separately, never presented
  as total transaction gas.
- Fund WETH before the snapshot. Preparation/wrapping costs are excluded because
  each task starts with WETH inventory. Approvals required by a task ARE included.
- This does not cover native ETH input, other assets, arbitrary routes, L2 fees,
  live mempool behavior or the official Smart Order Router.

## Stage B: deterministic synthetic task replay, calibrated by Stage A

The replay is a mathematical model, NOT a historical market backtest and NOT
full fork execution of time-varying tasks. Measured gas is held constant per route;
gas prices and price paths below are constructed. No probabilities are fitted.

Compare three policies using the same observations, quote floor, maximum three
attempts, exact-amount approval requirement, and hard cumulative gas budget:

1. `gross-now`: select the highest current quoted output and submit when feasible.
2. `net-now`: select the highest current output minus estimated gas/approval cost.
3. `task-budget`: same net selection, but wait for cost ≤ 0.1% of initial input
   value; at the final opportunity allow cost up to the hard budget.

All policies preflight: if the current quote is below the original floor, or
known cost exceeds remaining hard budget, they wait without sending. An informed
baseline is essential: do not invent blind retries that modern routers avoid.

- Original floor: best initial quote minus 50 bps, fixed for the task.
- Hard cumulative gas budget: min(1% of initial input USD value, USD 5).
- Opportunities: seconds 0, 60, 150; absolute deadline second 180.
- Sizes: all three measured sizes; allowance: zero / already sufficient.
- Constructed paths, frozen before results (gas in gwei; quotes in bps of the
  measured initial quote; execution drift applied AFTER the decision):

| Path              | Gas           | Current quote factors | Execution factors   |
| ----------------- | ------------- | --------------------- | ------------------- |
| flat-cheap        | 0.5, 0.5, 0.5 | 10000, 10000, 10000   | 10000, 10000, 10000 |
| gas-falls         | 3, 1, 0.5     | 10000, 10000, 10000   | 10000, 10000, 10000 |
| gas-stays-high    | 3, 3, 3       | 10000, 10000, 10000   | 10000, 10000, 10000 |
| wait-misses-floor | 3, 1, 0.5     | 10000, 9925, 9875     | 10000, 10000, 10000 |
| price-improves    | 3, 1, 0.5     | 10000, 10050, 10100   | 10000, 10000, 10000 |
| gas-rises         | 0.5, 3, 20    | 10000, 10000, 10000   | 10000, 10000, 10000 |
| first-send-race   | 3, 1, 0.5     | 10000, 10000, 10000   | 9900, 10000, 10000  |
| repeated-race     | 1, 1, 1       | 10000, 10000, 10000   | 9900, 9900, 9900    |

Thus 48 tasks × three policies = 144 task outcomes. These are eight hand-designed
stress scenarios, NOT 48 independent market samples. Every scenario must appear,
including negative/no-improvement results. The policy cannot access future quotes,
future gas or execution-drift factors.

## Metrics / acceptance gates

- Full task count, completions, uncompleted tasks, completion within original floor
  and budget, attempts, reverts, gas on reverts, approval gas, total gas, wait time.
- Output net of _all_ task gas in USDC-equivalent units. Do not count LP fees twice;
  quoted output already includes them. ETH/USD and USDC/USD conversion from the
  pinned Chainlink feed state, not a hard-coded USDC peg.
- Pairwise cost/net-output comparison only on jointly completed tasks, alongside
  the separately reported completion gap. Uncompleted tasks are never silently
  deleted or assigned zero execution cost as if they were successful trades.
- No success-rate or savings headline from these constructed cases. Only proceed
  to historical-block holdout validation / stronger official-router baselines if
  this pilot exposes a reproducible useful tradeoff.
- No automatic tuning on these same scenarios. Record failures and limitations.

Official sources: [Anvil](https://getfoundry.sh/anvil/overview/),
[SwapRouter02](https://github.com/Uniswap/swap-router-contracts),
[Uniswap Smart Order Router](https://github.com/Uniswap/smart-order-router).
