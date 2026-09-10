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

SwapGuard serves developers of existing Uniswap agents, focusing on one WETH-to-USDC task across approval, failed swaps and retries. A new quote should not erase already-paid gas or silently lower the user's original minimum output. Our local advisory MCP interface records task terms, checks each proposed attempt, records reported receipts once and returns an inspectable cost ledger. The same task retains its floor and cumulative budget across server restarts. Reports separate approval gas, failed-swap gas, successful-swap gas, gross output and output after task gas; unfinished tasks keep their spent costs. The website preserves manual read-only swap analysis and adds five clearly synthetic Agent integration examples. MCP observations, receipts and currency conversions are caller-reported and are not independently verified onchain. No wallet is connected and no transaction is signed or broadcast. Separate mainnet Uniswap v3 quotes, a narrow legacy draft checker and fake-money local-fork execution evidence remain explicitly distinct. This is task accounting and constraint checking, not minimum-loss trading, a new router, a wallet-wide enforced cap or a guarantee of savings. The prevalence of the cost-recording pain and customer adoption still require validation.

## How it is made

SwapGuard is a TypeScript application using React/Vite, viem and a Hono API on Cloudflare Workers. The new local stdio server uses the official MCP TypeScript SDK and exposes four tools: open task, assess attempt, record receipt and get task. Shared strict schemas and bigint accounting validate caller-reported inputs; immutable in-task terms, pending-operation checks and receipt idempotency prevent budget resets and duplicate charges through the supported workflow. Mutations are flushed to a private single-writer local journal before success is returned, and restart replays the journal instead of trusting stored totals. Corrupt storage fails closed. This is not a signed or tamper-proof audit log. An SDK-client integration check exercises the real MCP transport with constructed inputs and a server restart. The browser examples call the same accounting core locally but are not MCP connections. Separately, live Uniswap v3 Factory/QuoterV2 and Chainlink reads are pinned to one block, while the original task replay and narrow legacy SwapRouter02 decoder are retained. Actual contract receipts exist only in a separate fake-money Anvil-fork proof. No remote MCP service, wallet execution, automatic receipt verification or Universal Router adapter is claimed. AI-generated code, human direction and remaining review boundaries are disclosed in docs/AI_USAGE.md.

## Evidence and honest claims

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
