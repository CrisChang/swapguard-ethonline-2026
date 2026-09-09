# ETHGlobal submission draft — not submitted

Use only after reviewing against the final implementation. **Public repository and demo verified on 2026-09-09; the ETHGlobal form is not submitted by this document.** Do not use a placeholder URL, an old project's URL or localhost in the competition form.

## Project details

- Name: SwapGuard
- Category: DeFi
- Track: Building from Scratch
- Demo URL: https://swapguard-ethonline-2026.swapguard.workers.dev
- GitHub: https://github.com/CrisChang/swapguard-ethonline-2026
- Sponsor feedback document: https://github.com/CrisChang/swapguard-ethonline-2026/blob/main/FEEDBACK.md

## Short description (under 100 characters)

Verify that a swap transaction preserves the minimum output you confirmed before signing.

## Description

SwapGuard addresses a narrow pre-signing problem: a quote can look normal while a transaction encodes a weaker minimum output than the user agreed to. Users choose a slippage tolerance, see the automatic minimum and independently confirm conditions before pasting a transaction draft. SwapGuard decodes a supported legacy Uniswap SwapRouter02 call and compares minimum output, recipient, input amount, token pair, fee, sender, chain, router, native value and deadline. It exposes exact mismatches rather than a generic safety score. A public lab contains 25 explicitly synthetic cases with valid controls, parameter mutations, unsupported formats and stale confirmations. Each case and the full suite can be replayed in the browser, with downloadable inputs and observations. Live WETH/USDC quotes and Chainlink references provide separate read-only context; failed live calls never become samples. A parameter match is not a safety guarantee, execution simulation or proof of authenticated consent. No wallet connection, approval, signature or transaction is requested.

## How it is made

SwapGuard is a new TypeScript project with React/Vite and a Hono API on Cloudflare Workers. viem pins mainnet reads to one block: Uniswap v3 Factory and QuoterV2 supply two single-pool quotes, while Chainlink ETH/USD and USDC/USD supply validated references. Minimum output uses bigint base units, explicit output-relative tolerance and downward rounding. A reusable pure verifier runs in the browser, accepting only a deadline-bound legacy SwapRouter02 multicall containing one exactInputSingle. It canonically re-encodes both layers, rejects extra operations and compares decoded fields with independently locked conditions. Content hashes identify intent and draft but are not signatures. Edits and expiry invalidate old results. Fixtures publish declared outcomes; tests include a hand-encoded ABI reference, arithmetic boundaries and UI transitions. This is not Universal Router integration or full execution simulation. The build is AI-assisted; see docs/AI_USAGE.md for scope and human-review status.

## Sponsor selection

- Consider **Uniswap Foundation — Best Uniswap Stack Contribution (From Scratch)**, after verifying the current official criteria and completing the linked developer feedback form.
- Do not claim 1inch integration: Aqua/SwapVM is not used.
- Do not assume that reading Chainlink prices qualifies for a CRE/state-changing workflow prize.
- Do not claim a deployed custom contract or a successful swap transaction. This is a read-only tooling integration.

## Release / submission checklist

- [x] Independent repository with genuine incremental local history.
- [x] Working read-only mainnet quote and reference-price integration.
- [x] Explicit risk explanations, failure states and synthetic scenarios.
- [x] Local tests, build and responsive UI verification.
- [x] FEEDBACK.md and AI-use disclosure prepared.
- [ ] Participant reviews the code and claims, and can explain the implementation.
- [x] Public repository published; anonymous access verified.
- [x] Separate deployment published; live API verified from that deployment.
- [ ] Uniswap Developer Feedback Form actually submitted, with FEEDBACK.md link.
- [ ] Human-narrated demo recorded, 2–4 minutes, at least 720p; no sped-up or AI/TTS narration.
- [ ] Screenshots selected and uploaded; sample vs live labels retained.
- [ ] Applicable partner prize explicitly selected in the submission form.
- [ ] Final form submitted and confirmation verified. Editing later requires re-submitting.
- [ ] ETHOnline check-in requirement independently confirmed in the event dashboard.

Public submission deadline previously verified from the official event information: 2026-09-13 12:00 EDT / 2026-09-14 00:00 Asia/Shanghai. Recheck the dashboard for changes before relying on this date.
