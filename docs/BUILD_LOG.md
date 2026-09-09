# Build log — ETHOnline 2026 / From Scratch

## Task-level closed replay loop — 2026-09-09

The participant requested finishing the loop and updating outputs/intro copy.
Added confirmed task constraints, timed synthetic observations, approval/swap
preparation, receipt settlement, failed-cost retention, bounded retries,
non-completion, local browser restoration and JSON export. Conditions remain
locked across retries; no new wallet or mainnet execution endpoint was added.

The interface exposes timely vs cost-first preferences and ten constructed
paths. Unattainable soft targets and missed trades remain visible. Hero, README,
submission draft, demo narration, feedback, AI disclosure and methodology now
focus on task-level cost accounting rather than claiming novel slippage or
guaranteed gas savings. The first 48-task-per-policy benchmark stays frozen.

Validated 218 unit/API/evidence tests, 25 public protection fixtures, build,
formatting and 19 local browser tests (two opt-in live tests skipped). Also ran
one real-contract local-fork approval/revert/retry sequence with fake funds;
its receipts reconcile through the same task ledger. See VALIDATION.md for
costs, source restrictions and proof limitations. Other projects were unchanged.

Published to existing SwapGuard Worker version 7d3f6c07-4ce0-4cb7-84e4-8354cacc5c91.
No external competition or sponsor-feedback form was submitted by this work.

## Earlier milestones

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

## Minimum-output consistency lab — 2026-09-09

- User approved publishing constructed scenarios and improving minimum-output UX. Added automatic floor calculation, independent confirmation and a pure verifier for one deadline-bound legacy SwapRouter02 shape. Other projects were not changed.
- Added 25 fixed-clock synthetic cases with downloadable inputs, expectations and observations. These are regression cases, not real incidents or independent validation.
- Deterministic tests expanded from 74 to 146, including hand-encoded ABI reference, mutations, rounding and expiry. All passed; all 25 public cases matched their declared expectations.
- Default browser suite passed 12/12 with two opt-in live cases skipped. Browser launch required an approved isolated process outside the sandbox; failed launches were not test passes.
- Desktop/390px mobile lab screenshots inspected. Scope notes, methodology, submission/demo drafts, feedback and AI disclosure updated. Public deployment verification will be recorded after actual checks.

## Protection extension published and verified — 2026-09-09

- Published the extension to the same SwapGuard Worker and pushed the core verifier, public lab and timing fix in separate genuine commits (`29e7fb9`, `7d6f0ea`, `f949496`). No other service was changed.
- Account verification initially could not refresh OAuth inside the sandbox; the approved normal refresh succeeded. No user re-login or new credentials were needed.
- Public QA found an early confirmation timing race and intermittent upstream RPC 502 responses. Disabled confirmation until the quote validity interval starts, added a deterministic clock test, and retained the upstream errors in validation evidence instead of masking them with samples.
- Final public browser run **15/15 passed**, including two unmocked mainnet reads at block 25938477; unit/API **146/146** and fixtures **25/25** passed. Free RPC reliability remains a limitation.
- Latest deployed version: `dd909da7-7b30-440f-876d-7c1a9108fbff`. Public links unchanged. Full evidence and caveats in `docs/VALIDATION.md`. Human review/narration, sponsor feedback and ETHGlobal final submission remain pending.

## Task-budget pilot — 2026-09-09 (not deployed)

- The user approved the task-cost narrative and asked to run data first. Added
  `experiments/PROTOCOL.md` before the first successful calibration/replay. No
  existing trading or previous competition project was copied or modified.
- Installed pinned project-local Anvil 1.7.1 from the official Foundry npm package.
  npm's default cache was not writable; used a project-local cache instead of
  changing ownership/permissions of the user's home directory.
- Mainnet fork block 25938600, local chain 31337, loopback-only node and fake funds.
  Measured six route/size profiles with real local contract execution, full swap
  success/revert receipts and exact-amount approvals. No user wallet, private key,
  real-chain transaction or production API execution endpoint was used.
- Initial calibration aborted on an early receipt lookup; fixed explicit receipt
  waiting and reran from a fresh/reset owned fork. A second fresh-fork replication
  matched all six profiles' quotes and gas. Both temporary fork nodes were stopped.
- Replayed 48 constructed tasks for each of three policies, with identical hard
  budget/floor/deadline and no policy access to future path data. The task waiting
  heuristic completed 28/48 vs 34/48 for both immediate baselines. Retained every
  negative case and did not tune thresholds to improve this same dataset.
- The paired 28 completed tasks used 8.7412 vs 15.4572 USDC-equivalent modeled gas.
  This is conditional synthetic evidence, not a real-world savings rate. No
  routing or completion-rate advantage has been demonstrated.
- Added policy and artifact-integrity/recalculation tests. Website code and its
  deployed behavior remain unchanged; experiments are local/offline research.
