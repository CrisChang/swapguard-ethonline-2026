# ETHGlobal submission draft — task workbench, not submitted

Updated 2026-09-09. Review against the final implementation. This file does not submit or update the ETHGlobal form. Do not use localhost or another project's URL.

## Project details

- Name: SwapGuard
- Category: DeFi
- Track: Building from Scratch
- Demo URL: https://swapguard-ethonline-2026.swapguard.workers.dev
- GitHub: https://github.com/CrisChang/swapguard-ethonline-2026
- Sponsor feedback: https://github.com/CrisChang/swapguard-ethonline-2026/blob/main/FEEDBACK.md

## Short description (under 100 characters)

Task-level gas budgets and original price floors for automated Uniswap swaps.

## Description

SwapGuard focuses on a specific cost problem in small automated swaps: approvals and failed retries can consume the budget even when the intended trade never completes. A user defines an original minimum output, total gas budget, deadline and retry limit. The workbench then checks current conditions, prepares a replay operation, reconciles its receipt and either retries, waits or stops. Approval costs and reverted transactions remain in a single ledger; neither the price floor nor the spent budget resets on retry. Users explicitly choose timely or cost-first execution, and the UI shows when waiting can miss the trade. Partial and final reports include decisions, costs, output and non-completion, with explicit evidence provenance. The online workbench uses constructed scenarios, not live trading. Separate read-only panels query actual Uniswap v3 quotes and Chainlink references and verify supported unsigned legacy router parameters. Real contract receipt reconciliation is demonstrated only on a local Ethereum fork with fake funds. No wallet connection, signature, approval or transaction broadcast is requested by the website. Our first constructed pilot completed fewer tasks under the cost-first policy, so we do not claim higher fills or guaranteed savings.

## How it is made

SwapGuard is a new TypeScript application using React/Vite, viem and a Hono API on Cloudflare Workers. Mainnet reads are pinned to one block: Uniswap v3 Factory and QuoterV2 provide two single-pool WETH/USDC quotes, while Chainlink ETH/USD and USDC/USD provide validated references. A pure task state machine uses integer token units, an immutable original output floor and a cumulative gas budget. The policy receives only the current observation; future constructed path values belong to the test harness. It reserves estimated approval plus swap-or-revert gas before preparing an operation, then reconciles matching receipts exactly once, retaining failures and detecting budget overruns. Pending operations block resends. A browser-local command log restores the same replay state after reload without trusting stored totals. A separate canonical legacy SwapRouter02 decoder verifies original conditions for one deadline-bound multicall/exactInputSingle shape. Gas profiles were measured using actual contracts on a pinned Anvil fork; synthetic task paths and a separate approval-revert-retry fork receipt proof are published with their limitations. The public app does not execute swaps or cover Universal Router/full smart routing. This build is AI-assisted; see docs/AI_USAGE.md for scope and human-review status.

## Evidence and honest claims

- `src/lib/task-session.ts`: task lifecycle, receipt reconciliation and replay persistence.
- `src/lib/task-budget.ts`: current-observation-only policy and bigint gas accounting.
- `src/lib/protection.ts`: narrowly scoped legacy draft consistency checker.
- `server/live.ts` / `src/lib/contracts.ts`: actual read-only protocol integration.
- `experiments/PROTOCOL.md` and `experiments/results/`: frozen calibration, constructed benchmark and negative outcomes.
- `experiments/results/task-loop-25938600.json`: actual local-fork approval/revert/retry receipts, not mainnet transactions. The revert is deliberately induced, not an observed market attack.
- First pilot: cost-first completed **28/48**, immediate baselines **34/48**. On 28 jointly completed tasks only, gas was **8.74 vs 15.46 USDC-equivalent**. Six missed trades are not discarded. These figures are not forecasts or website-custom-setting results.
- The product extends task accounting and constraint checking, not Uniswap's existing slippage protection or gas-aware routing. No improvement over Uniswap's official Smart Order Router has been demonstrated.

## Sponsor selection

- Consider **Uniswap Foundation — Best Uniswap Stack Contribution (From Scratch)** after verifying current criteria and submitting the external developer feedback form.
- Do not claim 1inch Aqua/SwapVM, Chainlink CRE execution, custom deployed contracts, production trading, paying users or an audited security guarantee.
- Protocol integration is implemented; eligibility or an award is not guaranteed.

## Remaining participant actions

- [ ] Review the AI-assisted code and be able to explain its scope and results.
- [ ] Submit the external Uniswap Developer Feedback Form with the FEEDBACK.md link.
- [ ] Record and upload a compliant human-narrated 2–4 minute demo; verify current rules.
- [ ] Select screenshots retaining synthetic/local/live labels.
- [ ] Copy the updated description and links into ETHGlobal; choose the applicable partner prize.
- [ ] Final Submit and verify confirmation; re-submit after subsequent form edits if required.
- [ ] Independently verify the event check-in requirement in the dashboard.

Previously verified submission deadline: 2026-09-14 00:00 Asia/Shanghai (2026-09-13 12:00 EDT). Recheck the dashboard for changes; this is not a new deadline verification.
