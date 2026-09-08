# ETHGlobal submission draft — not submitted

Use only after reviewing against the final implementation. **No live deployment or public repository URL is confirmed yet.** Do not use a placeholder URL, an old project's URL or localhost in the competition form.

## Project details

- Name: SwapGuard
- Category: DeFi
- Track: Building from Scratch
- Demo URL: pending public deployment and verification
- GitHub: pending creation/publication of this independent repository

## Short description (under 100 characters)

Read-only swap checks with Uniswap quotes, Chainlink references and clear risk explanations.

## Description

SwapGuard gives users an inspectable second opinion before signing a swap. The first version supports WETH and USDC on Ethereum mainnet. It compares two Uniswap v3 single-pool quotes, checks independent Chainlink price references, calculates minimum output at the user's slippage tolerance, and optionally reads a public address's token balance and selected ERC-20 allowances. Every result explains which checks passed, exceeded a policy threshold or could not be completed. Source contracts, block numbers and exact token amounts can be inspected and exported. Reports expire and are invalidated when inputs change. Explicit synthetic scenarios demonstrate excessive exposure and stale oracle data, while live failures never silently fall back to samples. SwapGuard is read-only: it requests no approvals or signatures and does not execute transactions or guarantee safety.

## How it is made

SwapGuard is a new TypeScript project with a React/Vite interface and a Hono API that can run locally or on Cloudflare Workers. viem reads the Ethereum mainnet block and pins all contract calls in an analysis to that block number. The Uniswap v3 factory resolves WETH/USDC pools at fee tiers 500 and 3000; QuoterV2 is called through read-only simulation to compare exact-input outputs. Chainlink ETH/USD and USDC/USD rounds supply the reference, with checks for positive answers, complete rounds and freshness. Integer base-unit arithmetic avoids floating-point amount errors and rounds minimum output down. Optional public-address reads cover token balance and ERC-20 allowances to legacy SwapRouter02 and Permit2, not Permit2's internal permissions. API validation, generic upstream errors and explicit sample/live modes prevent missing data from being presented as a successful check. Unit, API and browser tests cover policy boundaries and UI state transitions. The build is AI-assisted; see docs/AI_USAGE.md for the scope and human-review status.

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
- [ ] Public repository published; anonymous access verified.
- [ ] Separate deployment published; live API verified from that deployment.
- [ ] Uniswap Developer Feedback Form actually submitted, with FEEDBACK.md link.
- [ ] Human-narrated demo recorded, 2–4 minutes, at least 720p; no sped-up or AI/TTS narration.
- [ ] Screenshots selected and uploaded; sample vs live labels retained.
- [ ] Applicable partner prize explicitly selected in the submission form.
- [ ] Final form submitted and confirmation verified. Editing later requires re-submitting.
- [ ] ETHOnline check-in requirement independently confirmed in the event dashboard.

Public submission deadline previously verified from the official event information: 2026-09-13 12:00 EDT / 2026-09-14 00:00 Asia/Shanghai. Recheck the dashboard for changes before relying on this date.
