# Build log — ETHOnline 2026 / From Scratch

2026-09-08: Started an independent SwapGuard repository. No source, designs, assets, credentials or deployment configuration were copied from Radar Agent, Radar Keeper, Perp Scout or the Binance project.

Approved scope: first working version of a swap preflight tool. Read-only Ethereum mainnet data; no signing, approval, transfers or swaps. Plan: Uniswap v3 single-pool WETH/USDC quotes, Chainlink reference prices, deterministic risk policy and explicitly labelled demonstration scenarios. Use public libraries with provenance recorded in package-lock.json.

## Completed milestones — 2026-09-08

1. Initialized an independent repository and committed scope before implementation (`ea18ff3`). No old project copy or rewritten commit dates.
2. Implemented integer policy, input validation, read-only API, explicit samples and fixed-block Uniswap/Chainlink reads. Added 66 passing unit/API cases (`f5fa4c0`).
3. Built React preflight and report UI, with sample/live labels, unknown/failure states, input invalidation, expiry and JSON export.
4. Ran 7 deterministic browser tests successfully; inspected desktop and mobile screenshots.
5. Investigated intermittent concurrent public RPC failures. Batching requests reduced connections; the following real-chain smoke calls passed. Public RPC reliability remains a deployment consideration, not a guarantee.
6. Read-only CLI smoke at block 25930766 succeeded; no owner supplied, so the report correctly requested review.
7. Two real-chain browser smoke tests passed at block 25930804: WETH → USDC (2 pools, 247.158808 USDC for 0.1 WETH) and USDC → WETH (0.101048216310103637 WETH for 250 USDC, plus 3 public-address balance/allowance reads). Address `0x0000000000000000000000000000000000000001` was a neutral public probe, not the participant's wallet.
8. TypeScript/frontend build and Worker deployment dry-run passed. Production dependency audit reported no known vulnerabilities at the time of the check; this is not a security audit.
9. Prepared README, sponsor feedback, source references, validation record, AI disclosure, submission draft and human demo outline.
10. A later browser rerun exposed an intermittent page-load timeout caused by external font loading. Replaced the external stylesheet with locally bundled Fontsource fonts, retained their original license notices, and added an assertion that font requests stay on the app origin. Final combined browser regression passed **9 / 9** in 7.7s, including both real-chain tests at block 25930861. The final build and formatting checks passed.

## Not complete at first handoff

No public GitHub repository has been created or pushed. No public deployment was performed: the existing Cloudflare CLI authentication required reauthentication. Sponsor feedback form, human code review, demo recording, check-in confirmation and final ETHGlobal submission remain pending.

No wallet was connected, no signature requested, no token approval made and no transaction sent. Existing projects were not modified. Local screenshots are validation artifacts, not proof of a published deployment.

## Release preparation — 2026-09-09

- Added a mandatory edge limiter for the public Worker, with generic fail-closed errors, retry hints and independent sample availability. No IP/wallet identifier is sent as a quota key.
- Added static security headers and a deployment smoke script. Browser tests can target a built Worker instead of just Vite.
- Added eight release-protection cases: the total deterministic suite now passes 74/74.
- Verified the actual built bundle with local Wrangler/Miniflare: static headers, health, sample and live analysis, and absence of a swap endpoint. Local Worker startup needed sandbox permission for loopback binding and Wrangler's development registry; those failures were not counted as successful checks.
- All nine browser tests passed against the built Worker in 8.1s, including mainnet blocks 25937948/25937949. Desktop screenshot inspected. No transaction was sent.
- Wrangler dry-run passed with both ASSETS and LIVE_RATE_LIMIT bindings. This did not publish anything.
- The Cloudflare session remains expired, including after network access was available. GitHub connector profile confirms CrisChang but its available tools cannot create an empty repository. Native browser interaction is unavailable because Computer Use permission is not granted. Account-side login / repository creation remain pending; no unrelated project or credential was repurposed.

## Public release — 2026-09-09

The participant confirmed Cloudflare login and explicitly asked the assistant to create the GitHub repository. The earlier account-side blockers above are now resolved.

- Verified Cloudflare OAuth login and confirmed the target Worker did not exist before deployment. Published a new Worker rather than replacing an earlier project. The CLI registered the account's new workers.dev subdomain during publication.
- Verified the configured Git credential helper authenticated as CrisChang, without printing or storing its credential in project files. Created the public `CrisChang/swapguard-ethonline-2026` repository via GitHub's official API and pushed the genuine full main-branch history with normal Git authentication. No pasted chat credential was used.
- Added the MIT license for original code; retained original font/third-party notices. Scanned tracked paths and history for common credential formats before public push; no matches. This is a limited hygiene check, not an exhaustive security audit.
- Public Worker URL: https://swapguard-ethonline-2026.swapguard.workers.dev. Initial deployment version: `b91fa25f-a2e7-4e0d-948e-8f969b6b44c1`.
- Anonymous GitHub access returned HTTP 200. The first hosted CI run succeeded: https://github.com/CrisChang/swapguard-ethonline-2026/actions/runs/34320212712.
- Direct access to the new workers.dev hostname failed on this machine's DNS/network path. Using the user's existing system proxy, with no OS configuration change and normal TLS verification, the public page, headers, sample/live API and all nine browser cases passed. This was not reported as successful until those checks completed.
- Submission draft now contains verified public links. Sponsor feedback submission, human code review, narration and final competition submission remain pending.
