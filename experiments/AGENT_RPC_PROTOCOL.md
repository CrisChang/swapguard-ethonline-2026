# Receipt-verified reference agent: predeclared local-fork protocol

2026-09-10. Written before the first comparison run. Feasibility/fault-injection
evidence, not a market backtest, savings claim, independent audit or LLM benchmark.

## Environment and common terms

- Fresh Anvil 1.7.1 on loopback port 18546, chain 31337, fork block 25938600
  and hash `0xd7274bebf8aca6ada1e7c82fd176ccac973ae1fc35f080ffff060c692203157f`.
- Fake development wallet funded with WETH before a snapshot. Every policy/case
  restores that identical snapshot. Only local writes; upstream Ethereum RPC reads.
- Existing Uniswap v3 WETH/USDC 500-fee pool and SwapRouter02. 0.04 WETH input;
  original minimum = initial QuoterV2 output minus 50 bps. Approval amount exact.
- Single-swap deadline anchored to local chain time + 180 seconds; at most 3 swaps.
- 1 gwei legacy transaction price, zero local base fee. Receipts read via a separate
  verifier, compared to transaction-local transfer logs and decoded calldata.
- Gas conversion uses ETH/USD and USDC/USD feeds at the receipt block, rounded up
  to a micro-USDC. Native gas and derived USD-equivalent both retained.
- No future price information. Candidates are chosen by the same deterministic
  auto-retry agent. It is a project-authored reference agent, NOT an LLM or the
  official Uniswap agent. No full pre-send transaction simulation is claimed.

## Three policies, identical candidate observations

1. Per-attempt reference: validates original minimum, quote, deadline and count;
   compares each operation estimate with the full task budget. Does not subtract
   previous costs. Deliberately limited ablation, NOT a modern-router benchmark.
2. Cumulative reference: same execution agent, independent local cumulative-cost
   check (spent + estimate <= original budget), no SwapGuard MCP dependency.
3. SwapGuard MCP: same agent/execution candidates, checks and actual receipt
   reconciliation go through a separate stdio MCP process.

The equally constrained cumulative reference is mandatory: matching it supports
reusable integration correctness, not an inherent optimization advantage.

## Four hand-designed cases (not independent statistical samples)

| Case | Budget USDC-eq | Approval estimate | Swap estimates / gas limits |
|---|---:|---:|---|
| Normal | 3 | 50,000 gas | 200,000 estimate / 500,000 limit |
| Tight retry | 0.6 | 50,000 gas | first 80,000 / 80,000; retry 200,000 / 500,000 |
| Affordable retry | 3 | 50,000 gas | first 80,000 / 80,000; retry 200,000 / 500,000 |
| Underestimated cost | 0.35 | 50,000 gas | 50,000 estimate / 500,000 limit |

The two retry cases deliberately underfund the first swap's gas limit to cause
an actual EVM out-of-gas revert. This is injected estimator/executor failure, NOT
observed MEV or market volatility. A simulator-aware production agent might avoid
it. The underestimated-cost case retains an actual overrun even when checks pass.
No post-result tuning of budgets, cases or estimates; corrections require a new
protocol/run identifier and explicit reason.

## Report all results

Four tasks per policy. Report chain completions, completions within both original
minimum and gas budget, uncompleted tasks, budget breaches, attempts/reverts,
approval/failed/success gas, total gas over the WHOLE batch, and gross/net output
per case. Jointly completed-case cost comparisons must show the excluded cases
and completion gap. Do not call lower total gas with lower completion 'savings'.

Exclude WETH inventory setup, RPC/agent operating cost and future revocation;
pool fees are already reflected in output and must not be subtracted twice.
Fault injection, snapshot resets and identical local hashes are disclosed. Local
hashes are not mainnet explorer links. RPC data is trusted, not cryptographically
proved, and later reorgs are not continuously monitored.

The Graph remains a candidate only. No Graph integration/prize claim is made by
this experiment. Real Graph data would need a load-bearing purpose, not a badge.
