# Task workbench — workflow and evidence boundary

Update 2026-09-10: this document still describes the **original calibrated browser replay**. The new Agent-facing ledger and local MCP interface are separate, described in [AGENT_INTEGRATION.md](AGENT_INTEGRATION.md). Its browser examples use illustrative round numbers; MCP receipts are caller-reported and unverified. Do not merge these evidence categories or relabel the older fork proof as MCP-chain verification.

## Intended scenario

A small automated **WETH → USDC** task has one price constraint and one gas budget spanning approval and all attempts. Repeated failed transactions are not free; refreshing the quote must not quietly weaken the original minimum. This is not a replacement for router slippage protection or Uniswap smart routing.

The public implementation is a **deterministic replay**, with separate live read-only quotes. It does not yet connect live observations and wallet execution into an autonomous service. There is no live receipt subscription, wallet nonce manager, transaction replacement, reorg handling or onchain budget contract.

## End-to-end replay

1. Choose a calibrated size, tolerance, total gas budget, preference, soft target, max attempts and a constructed scenario. The three-minute deadline is relative replay time.
2. Confirm conditions. The minimum is derived from the initial quote once; it is not recentered on each retry.
3. Inspect the current quote and estimate approval plus the larger measured successful/reverted swap cost. Only current conditions go to the policy, not future path values.
4. Prepare approval if needed. Pending receipts block duplicate preparation and cancellation. Preparation does not charge the ledger yet.
5. Reconcile the synthetic receipt. Success or failure gas is charged once; successful approval persists across a reverted swap. Recheck before the next operation.
6. Prepare a swap only if the estimated cumulative cost and original floor fit. Preserve the absolute task deadline and original minimum in the supported unsigned draft.
7. Reconcile, then complete, wait, retry, expire or stop. Never erase spent gas. An unexpected receipt above the budget or below the floor is retained and blocks further attempts.
8. Export JSON at any point. Browser reload restores config and the deterministic action log, including pending operations. This is not signed or tamper-proof consent; changing stored config creates a different replay/fingerprint.

## Accounting

- Pool fees and price impact already affect quoted output; do not subtract the pool fee again.
- Minimum output is in USDC units. The total gas budget is separately valued in USDC-equivalent; the chain charges gas in ETH.
- Cost = ceil(gasUsed × effectiveGasPriceWei × ETH/USD × 10^6 ÷ (10^18 × USDC/USD)). Both feed values are normalized to eight decimals in the pinned calibration.
- Task gas sums all receipts, including approvals and reverts. Approval-cost and failed-operation-cost categories may overlap when an approval itself fails; do not sum those categories as independent totals.
- Net output = actual received USDC minus all task gas in USDC-equivalent. With no completed output it is null, not “zero-cost success.”
- The pre-send cost reserve is an estimate, not a chain-enforced spending guarantee. Forecast/receipt overruns remain visible, including negative remaining budget.
- WETH wrapping/inventory preparation, RPC/automation operating costs and future revocations are outside this task model and not claimed saved.

## Preference is a tradeoff

**Timely** acts when hard constraints fit. **Cost-first** may wait for a soft total-task cost target; at the final observation it can fall back to the hard budget. A warning appears when the target is below current estimated cost. Waiting can worsen gas or miss the floor. Ten scenarios cover recovery, favorable/unfavorable waiting, repeated reverts, post-approval gas spikes and missing quote data. They are constructed regression examples, not empirical likelihood estimates.

## Three distinct evidence layers

| Layer                    | What is real                                                                                        | What is not established                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Public live quote panel  | Read-only Uniswap v3 / Chainlink contract calls                                                     | Execution, future price, wallet readiness                                   |
| Browser task replay      | State machine and accounting running in browser; gas calibration from a local fork                  | Its paths, receipts and clock are synthetic; no real swap                   |
| Local-fork receipt proof | Actual approval, reverted swap and successful retry receipts from forked contracts; fake funds only | Mainnet execution, natural market race, live gas forecast, economic benefit |

The prior 48-task-per-policy experiment stays frozen, with no relabelling as the new UI's custom result. Published outcomes include the cost-first policy's six missed tasks. Gas-aware route choice did not beat the immediate gross-output baseline in that dataset.

## Local receipt proof reproduction

Use a fresh isolated node, port 18545, chain 31337. PublicNode stopped serving the pinned account state without an archive token during this check; the successful run used https://eth.drpc.org. Provider availability is not guaranteed. Never replace localhost with a user chain endpoint in the proof script.

```sh
node node_modules/@foundry-rs/anvil/bin.mjs --host 127.0.0.1 --port 18545 --chain-id 31337 --fork-url https://eth.drpc.org --fork-block-number 25938600 --no-storage-caching --accounts 2 --quiet
npm run check:task-fork
```

Run commands in separate terminals. The script pins initial block/hash, validates the loopback endpoint/chain before each send, funds a development account with fake WETH, approves once, forces one revert using a **stronger** quote-plus-one-raw-unit floor, then executes at the original task floor. That fault injection is not evidence of MEV or market slippage. Local chain ID is 31337; the separately validated draft describes the forked mainnet contract format. Local timestamps advance within the unchanged deadline. The session layer reconciles actual gas/output, but its quote path/reference-price model remains synthetic/pinned.

The output uses exclusive creation and will not overwrite experiments/results/task-loop-25938600.json. For a repeat run, use EXPERIMENT_OUTPUT_DIR=.cache/task-loop-repeat with another fresh node. Stop only the temporary node you started afterward.

## Before any future wallet implementation

Do not reinterpret this replay as authorization to trade. A real adapter needs authenticated user intent, current allowance/nonce/balance, gas and full transaction simulation, wallet confirmation, exact checked-calldata binding, receipt finality/reorg handling, replacement accounting, safe persistence and independently reviewed contract coverage. Keep those requirements separate from the completed replay loop.
