# ETHGlobal submission revision — Agent accounting extension

Updated 2026-09-10. The prior project submission and Check-in 2 are confirmed by participant screenshots; the public showcase is https://ethglobal.com/showcase/swapguard-km1v7. The Agent extension and fixed test reports are now published on the existing demo website and GitHub (see RELEASE_HANDOFF.md). The following is a **new submission revision**: this file does not update the ETHGlobal form or the uploaded video, which remain unchanged. Do not use localhost in the competition form.

## Project details

- Name: SwapGuard
- Category: DeFi
- Track: Building from Scratch
- Demo URL: https://swapguard-ethonline-2026.swapguard.workers.dev
- GitHub: https://github.com/CrisChang/swapguard-ethonline-2026
- Sponsor feedback: https://github.com/CrisChang/swapguard-ethonline-2026/blob/main/FEEDBACK.md

## Short description (under 100 characters)

Task cost accounting and original-intent checks for Uniswap agents, with an advisory MCP interface.

## Description

SwapGuard serves developers of existing Uniswap agents, focusing on one WETH-to-USDC task across approval, failed swaps and retries. A new quote should not erase already-paid gas or silently lower the original minimum output. Our local advisory MCP interface preserves task terms, checks proposed attempts and returns a restart-persistent cost ledger. An optional receipt verifier reads supported transactions from configured RPC, matches wallet and calldata, and derives actual gas and recipient output from receipts, transfer logs and receipt-block price feeds. It distinguishes those observations from unverified caller reports. Reports include approval, failed-swap and successful-swap gas, remaining budget, gross output and output after all task gas; unfinished tasks retain their costs. A project-authored deterministic reference agent has executed Uniswap contracts on a fake-money local fork through this MCP workflow, with published same-condition comparisons and negative outcomes. This is not an official or third-party Agent integration, a live LLM evaluation or mainnet trading. The website retains manual read-only analysis and clearly synthetic interactive examples, without connecting a wallet. SwapGuard provides task accounting and constraint checks—not minimum-loss trading, a new router, a wallet-enforced cap or guaranteed savings. Customer demand remains a hypothesis.

## How it is made

SwapGuard uses TypeScript, React/Vite, viem and a Hono API on Cloudflare Workers. Its separate local stdio server uses the official MCP TypeScript SDK: four default accounting tools plus optional swapguard_verify_receipt. Strict schemas and bigint accounting support immutable terms, pending-operation checks and idempotent receipt recording. A private single-writer journal is flushed before success and replayed on restart; it is not tamper-proof. Bound tasks anchor their wallet, chain and creation block. Verification supports exact WETH approval and one deadline-bound SwapRouter02 WETH-to-USDC swap: transaction/receipt identity, canonical block hashes, confirmation threshold, supported calldata and token logs are checked. Gas conversion uses ETH/USD and USDC/USD feeds at the receipt block, rounded upward, retaining native gas and feed values. This trusts RPC data rather than cryptographic inclusion proofs and does not enforce signing policy or monitor future reorgs. A deterministic reference agent runs identical candidates under per-attempt, cumulative and MCP policies on reset Anvil snapshots; full calls, receipts, restart events, outcomes and source fingerprints are public. Mainnet quotes, synthetic browser scenarios and local-fork execution are separately labelled. Quotes and gas estimates remain caller-supplied. No remote MCP service, production signer, third-party LLM integration or Universal Router adapter is claimed. AI-assisted implementation and remaining review boundaries are disclosed in docs/AI_USAGE.md.

## Evidence and honest claims

- Receipt-verified reference Agent: four predeclared cases × three policies, actual local Uniswap contract execution. Per-attempt policy: 4/4 completed, 2/4 within constraints, 2 overruns, total gas 2.219848 USDC-eq. Cumulative baseline and MCP both: 3/4 completed, 2/4 within constraints, 1 overrun, total gas 1.880340. One fewer completion accompanies one fewer overrun. The underestimated-gas counterexample remains. This demonstrates reusable integration/reconciliation, not superior optimization. See `public/evidence/rpc-agent-2026-09-10.*` and `experiments/AGENT_RPC_PROTOCOL.md`.
- `server/receipt-verifier.ts`: read-only RPC reconciliation; `server/reference-swap-agent.ts`: project-authored auto-retry policy loop; `scripts/record-rpc-agent-evidence.ts`: loopback-only local execution recorder. No user private key or real funds were used.

- Public **Test reports** section: 8 predefined synthetic scenarios recorded through 46 actual local MCP calls, with 2 expected tool errors and 2 server restarts. Full input/output transcripts, synthetic journal events, readable report and exact source fingerprints are retained. Unfinished and constraint-breaching results are included. All declared assertions matched; this is not real trading, measured savings, an independent audit or a live LLM benchmark.

- `src/lib/agent-ledger.ts`: strict caller-report schemas, exact task accounting, immutable terms and pending/duplicate checks. Not independent onchain verification.
- `server/mcp.ts`, `server/agent-journal.ts`: actual local MCP adapter and restart-persistent advisory journal.
- `scripts/check-mcp.ts`: SDK-client transport verification using constructed inputs, not an LLM adoption or profitability evaluation.
- `docs/AGENT_INTEGRATION.md`: integration instructions, accounting definitions, threat/trust boundary and next validation.

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
- The Graph remains a second-ecosystem candidate, not an implemented integration. Do not select extra partners merely to fill the three-partner limit.
- Do not claim 1inch Aqua/SwapVM, Chainlink CRE execution, custom deployed contracts, production trading, paying users or an audited security guarantee.
- Protocol integration is implemented; eligibility or an award is not guaranteed.

## Remaining participant actions

- [ ] Review the AI-assisted code and be able to explain its scope and results.
- [ ] Submit the external Uniswap Developer Feedback Form with the FEEDBACK.md link.
- [x] Participant recorded and uploaded the earlier human-narrated Mandarin demo with English subtitles; screenshots show Video complete.
- [ ] Update the demo only if presenting the new Agent extension; retain provenance labels and verify applicable language rules.
- [ ] Select screenshots retaining synthetic/local/live labels.
- [ ] Copy the updated description and links into ETHGlobal; choose the applicable partner prize.
- [x] Prior project Final Submit confirmed; public showcase is accessible.
- [x] Check-in 2 confirmed by the participant's green dashboard status.
- [ ] Publish and verify the Agent extension before claiming it on the form; re-submit any revised form afterward.

Previously verified submission deadline: 2026-09-14 00:00 Asia/Shanghai (2026-09-13 12:00 EDT). Recheck the dashboard for changes; this is not a new deadline verification.
