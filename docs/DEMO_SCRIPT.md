# Human-narrated demo outline — about 3 minutes

Draft only. Record your own clear voice at normal speed, with at least 720p video. Keep the final video between 2 and 4 minutes. Do not substitute text-to-speech, AI voiceover, music-only audio or accelerated footage. Check the final event rules before upload.

## 0:00–0:25 — problem and boundary

“Before a swap, a quote alone does not tell me what was checked. SwapGuard gives me a second look at the quote, my slippage exposure and selected token approvals. It never asks me to connect a wallet or sign a transaction.”

Show the landing page. Keep the read-only label visible.

## 0:25–1:15 — actual live integration

Select Live onchain, enter 0.1 WETH, choose 0.5% slippage, and click Analyze live swap. Wait for a real response; do not relabel a sample if the RPC is down.

“This is a real Ethereum mainnet snapshot. We compare two Uniswap v3 pools and select the higher output among these two, not among every possible market route. Chainlink ETH/USD and USDC/USD provide the independent reference. All reads use this same block number.”

Expand source details and show the selected pool fee, minimum output and contracts.

“I have not provided an address, so wallet checks are unknown. The application deliberately asks for review instead of saying everything is safe.”

## 1:15–2:10 — demonstrate the guardrails honestly

Click Risky quote. Point at SAMPLE DATA.

“These next scenarios are synthetic fixtures, not live transactions. This one has a large quote deviation and excessive token allowances. Each flag explains its scope.”

Open allowance and deviation rows. Click Stale oracle.

“With an outdated oracle, the reference comparison is unavailable. We do not invent a fresh price or hide the missing check.”

## 2:10–2:45 — evidence and state correctness

Return to the normal sample, edit the amount, and show the previous report disappears. Analyze again, then export JSON.

“Changing an input invalidates the old result. Reports also expire after sixty seconds. The export contains exact base-unit amounts and source values, so a reviewer can inspect what this result was based on.”

## 2:45–3:10 — limits and engineering

“This first version is read-only WETH/USDC tooling. It does not detect MEV, audit tokens or execute swaps. We test integer arithmetic, stale and missing data, API failures and browser state transitions. The code is AI-assisted and the repository includes a disclosure, build log and integration feedback.”

Show the real repository only after publication. Do not claim it is public or deployed until verified.
