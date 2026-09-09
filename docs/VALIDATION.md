# Validation record — versioned observations

## Live RPC investigation — 2026-09-09, follow-up

- Reproduced a definite fallback bug: dRPC rejected a six-call JSON-RPC batch
  with HTTP 500 / code 31, stating the free endpoint accepts at most three calls.
  A three-call cap made direct local tests pass for both providers and both
  token directions, including the optional public-address reads (4/4 snapshots,
  two pool quotes each, block 25939234).
- That first patch did **not** fix the public Worker: its 19 deterministic
  browser cases passed, but both live cases still returned 502. The first round
  of a planned ten-request public probe also failed; it is not a ten-test pass.
  Traces are retained locally under `.cache/live-rpc-fix-browser`.
- Added privacy-safe server error categories. The cloud batched run showed a
  nested TypeError; its exact origin is not proven. Switched to independent
  single-call envelopes, avoiding both provider batch-size limits and viem's
  cross-request batch scheduler. RPC retries are disabled; bounded per-request
  fallback remains. All contract reads still use the selected block.
- The next cloud probe exposed JSON-RPC code 429 (upstream throttling), not an
  invalid user trade or a requirement to fund a wallet. Worker secret-name
  inspection confirmed no dedicated RPC is configured. Availability is still
  unresolved; a configured dedicated endpoint needs production validation.
- Safe alternatives were checked without adding them to production: LlamaRPC
  returned HTTP 525, public 1RPC produced failed reads/no usable routes,
  Flashbots did not serve the requested eth_call, and MEV Blocker timed out on
  this local network path. These observations are not global provider verdicts.
- Added 14 real-transport/diagnostic regressions: fallback, both directions,
  concurrent isolation, block pinning, custom endpoint isolation, wrong-chain
  rejection, unknown wallet reads, no-quote failure, upstream rate-limit handling
  and log redaction. **232 unit/API/evidence tests pass**; TypeScript/Vite passes.
- Upstream 429 now maps to **503 UPSTREAM_RATE_LIMITED**, with Retry-After 60,
  no-store and no quote. This distinguishes the provider outage from this app's
  own visitor/admission 429; it does not claim to remove upstream throttling.
- No sample fallback, stale-price cache, private-key access, chain write or
  change to experiment evidence. Network requirements are recorded separately
  in [NETWORK_REQUIREMENTS.md](NETWORK_REQUIREMENTS.md).
- Final deployed version: `e67f7895-ec8d-4feb-b986-b3660d85eb3c`. Page/security
  headers, health, sample analysis and absent transaction endpoint passed.
  **19 deterministic public browser cases passed; two opt-in live cases skipped**
  in that final regression (not counted as live successes). Separate WETH and
  USDC live probes both returned the new 503 UPSTREAM_RATE_LIMITED with a 60-second
  retry header. Live recovery remains blocked on provider access/capacity.

## Task workbench — 2026-09-09

- Added 42 task-state tests and two recorded local-fork receipt integrity tests;
  **218 unit/API/evidence tests passed**. Covers original floor/deadline retention,
  preparation vs settlement, pending-operation blocking, approval persistence,
  reverts, receipt overruns, duplicate/conflicting receipt IDs, missing quotes,
  max attempts, non-completion and deterministic reload restoration.
- All 25 older protection cases still match their declared expectations. The
  initial tsx CLI wrapper hit a sandbox IPC restriction; direct Node tsx-loader
  invocation passed. That failed wrapper launch is not an application failure
  or an extra passing test.
- TypeScript/Vite and Prettier checks passed. Default isolated browser regression:
  **19 passed, two opt-in live cases skipped**. Desktop and 390px mobile screenshots
  inspected; no horizontal overflow, readable report controls and provenance.
- New actual local-fork proof at block 25938600 passed: approval 46,040 gas,
  deliberate revert 140,335 gas, successful retry 135,241 gas. Shared task ledger
  retained all three receipts, one approval and two swap attempts; output
  100.698710 USDC; original minimum 100.195216 USDC; total 0.807383 USDC-equivalent
  at fixed local 1 gwei. The browser default has a different synthetic 3→1 gwei
  path and totals 1.743131, not a conflicting real receipt measurement.
- PublicNode later required an archive token for this pinned state. An isolated
  fork of the same block/hash succeeded using eth.drpc.org. Fake WETH inventory
  wrapping was setup and excluded from task costs; the first swap failure was
  deliberately induced by quote+1 minimum, not an observed market race. The
  owned local Anvil node was stopped; no real wallet or mainnet writes occurred.
- Original calibration bytes and all 144 frozen pilot traces are unchanged.
  The pilot's lower cost-first completion remains visible. No routing, fill-rate,
  production availability or economic superiority claim is established.
- Published this build to the existing SwapGuard Worker only, version
  `7d3f6c07-4ce0-4cb7-84e4-8354cacc5c91`. Public post-deploy checks are recorded
  separately after completion; deployment alone is not verification.

## Historical records

### Public task-workbench checks

- Public page/security headers, health, sample analysis, live analysis and absent
  transaction endpoint passed the post-deploy CLI smoke check.
- The first public browser run passed **19 deterministic cases** but failed
  **both opt-in live quote cases with HTTP 502**. This is an upstream availability
  problem, not a successful live check. No sample was relabelled as live; test
  policies were not weakened. Trace files were retained locally in test-results.
- New task creation, locked inputs, approval/revert/retry accounting, partial
  receipt reload, JSON export, non-completion and mobile rendering all passed on
  the deployed HTTPS origin. This does not validate real wallet execution.
- A focused rerun of both live browser cases also returned HTTP 502 (0/2).
  Evidence is in `.cache/public-live-recheck`. The earlier CLI live response
  passed, but the latest browser live checks remain failed. Live-provider
  reliability is unresolved; the completed replay does not depend on it.

2026-09-08. These are development observations, not an audit or a promise of current prices.

## Deterministic checks

- `npm test`: **66 / 66 passed**. Exact integer math, both token directions, USDC depeg reference, threshold boundaries, oracle freshness/round validity, unknown wallet reads, high allowances, partial/no routes, input rejection, API error isolation and concurrency behavior.
- `npm run build`: TypeScript and Vite build passed.
- `npm run test:e2e`: **7 / 7 deterministic browser tests passed**. Desktop and 390px mobile layout, explicit sample labels, risky/stale scenarios, invalidation after editing, live-failure behavior, request validation, expiry and JSON export.
- Desktop and mobile screenshots visually inspected: no clipped controls or horizontal overflow; sample labels and read-only boundaries visible.
- `wrangler deploy --dry-run`: Worker bundle and static assets built successfully. **Not deployed.** Existing CLI authentication required reauthentication.

Headless Chrome initially could not launch inside the filesystem sandbox; the browser suite then passed using an approved isolated temporary profile. This is an environment issue, not a browser-test pass from the failed launch.

## Read-only mainnet smoke observation

`npm run check:live` succeeded at **2026-09-08 06:10:26 UTC**:

| Field                      | Observation                                      |
| -------------------------- | ------------------------------------------------ |
| Network                    | Ethereum mainnet, chain ID 1                     |
| Block                      | 25930766                                         |
| Input                      | 0.1 WETH                                         |
| 0.05% pool output          | 247.1894 USDC                                    |
| 0.30% pool output          | 246.984902 USDC                                  |
| Selected pool              | `0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640`     |
| Minimum at 0.50% tolerance | 245.953453 USDC                                  |
| Feed decimals              | ETH/USD: 8; USDC/USD: 8                          |
| Feed validation            | Both passed the local policy at observation time |
| Wallet                     | Not supplied; balance and allowance UNKNOWN      |
| Decision                   | REVIEW, correctly not “all checks passed”        |

Amounts above are historical validation evidence and must never be used as current quotes. No transaction hash exists because no transaction was sent.

Separate `LIVE_SMOKE=1` browser checks: **2 / 2 passed**, using real API calls at block **25930804**. WETH → USDC returned 247.158808 USDC for 0.1 WETH; the reverse returned 0.101048216310103637 WETH for 250 USDC. Token balance and both allowances were read successfully for neutral public probe address `0x0000000000000000000000000000000000000001` (not the participant's wallet). A live-mode screenshot was also visually inspected. These opt-in tests are not part of the deterministic default suite.

`npm audit --omit=dev` reported zero known production dependency vulnerabilities at the time of this check. This says nothing about unidentified vulnerabilities or the correctness of the application.

## Final local-font regression

An external font stylesheet caused a subsequent browser navigation timeout. Fonts were then bundled locally with their original license notices. The final **combined 9 / 9 browser suite passed in 7.7s**, including a same-origin font-request assertion and both real-chain smoke tests at block **25930861**. Final WETH → USDC output was 246.543463 USDC for 0.1 WETH; reverse output was 0.101300420104016538 WETH for 250 USDC. These are historical observations only. Final build and formatting checks also passed.

## Remaining release checks

- Public GitHub repository and deploy URL, with anonymous-access checks.
- Production RPC reliability, rate limits and privacy review.
- Human review of AI-assisted code and demo narration.
- Sponsor feedback form and final ETHGlobal submission.

No statement here implies those remaining checks are complete.

## Built Worker release regression — 2026-09-09

- `npm test`: **74/74 passed**, including eight new release-protection cases.
- TypeScript/frontend build and Wrangler dry-run passed. The bundle contains the static assets and rate-limit bindings.
- `npm run check:deployment -- http://127.0.0.1:8798 --live`: passed page/content headers, health, explicit sample/live reports, no-store and unknown swap endpoint checks against a local Cloudflare Worker runtime.
- `TEST_BASE_URL=http://127.0.0.1:8798 LIVE_SMOKE=1 npm run test:e2e`: **9/9 passed in 8.1s**. The production-built page loads with CSP and local fonts; desktop screenshot visually inspected.
- Historical read-only evidence: block 25937948, 0.1 WETH → 249.796299 USDC, minimum 248.547317 USDC; block 25937949, 250 USDC → 0.099981298770517986 WETH, with three successful public-address reads for the same neutral probe address used above. These are not current quotes.
- Edge deny/error/missing-binding behavior is covered by injected unit tests. The actual binding and asset headers were exercised in local Miniflare. Multi-location/global enforcement and public Cloudflare deployment have **not** been verified.

Cloudflare authentication still requires user reauthentication. No public repository, deployment, feedback form, video or final competition submission is claimed complete by these tests.

## Public deployment verification — 2026-09-09 (supersedes account blockers above)

- Public source: https://github.com/CrisChang/swapguard-ethonline-2026 — anonymous GitHub API access returned 200, public visibility and MIT license confirmed.
- Public demo: https://swapguard-ethonline-2026.swapguard.workers.dev — Worker version `b91fa25f-a2e7-4e0d-948e-8f969b6b44c1`.
- Public `check:deployment` passed: page and CSP/frame/nosniff headers, health, explicit sample report, actual live report, no-store and absent transaction endpoint.
- **9/9 browser tests passed against the public HTTPS origin in 17.4s**, including mobile layout, locally hosted fonts, failure/expiry/invalidation/export behavior and two real-chain paths.
- Historical block 25938101: 0.1 WETH → 249.947321 USDC, minimum 248.697584; reverse 250 USDC → 0.099920889768081706 WETH with three public-probe balance/allowance reads. No transaction was sent; do not reuse these historical values as current quotes.
- The direct local DNS/network path returned unrelated/unreachable addresses for workers.dev. Public checks used the existing OS proxy without changing system settings or disabling TLS. Network-specific restrictions remain possible for other visitors.
- Hosted GitHub Actions run 34320212712 completed successfully for commit 62fd0b8 (unit/API checks, build and deterministic browser suite).

Dependency audit on this date: `npm audit --omit=dev` reported **0 known production dependency vulnerabilities**. The full development tree reported five findings: two moderate entries in Vitest/@vitest/mocker and three high entries in the Wrangler/Miniflare/sharp chain. Development servers remain loopback-only; the image processing path is not used by this app. These entries were not silently ignored or force-upgraded across major versions. Review/update development tooling before broader/untrusted development use. Neither audit is an independent security review.

Publication is complete. Sponsor feedback form, participant review, human narration, check-in confirmation and final ETHGlobal submission are still not established by this record.

## Minimum-output lab local verification — 2026-09-09

- `npm test`: **146/146 passed**, including 72 new protection tests: hand-encoded reference, integer bounds, strict schema/envelope, mutations, extra/nested/trailing calls, changed conditions and expiry.
- `npm run check:protection`: **25/25 synthetic cases matched declared expectations**, including three valid controls and 22 non-MATCH cases. Not independent validation or real-world attack accuracy.
- TypeScript/Vite build passed. Default browser suite: **12 passed, two opt-in live cases skipped**, in 9.9 seconds. New cases cover replay/downloads, confirmation, automatic floor, edits, expiry and mobile layout.
- Desktop/mobile screenshots inspected: no clipped controls or horizontal overflow; provenance and scope remain visible.
- Initial IPC/browser sandbox restrictions were resolved with network permission and approved isolated browser execution. No failed launch was counted as an application result.

No wallet action or transaction execution simulation was performed. Public extension deployment is recorded separately after verification.

## Protection extension public release — 2026-09-09

- Published source implementation commits `29e7fb9`, `7d6f0ea`, `f949496`; genuine history retained. Latest Worker version: `dd909da7-7b30-440f-876d-7c1a9108fbff`.
- Final unit/API suite **146/146**, published synthetic suite **25/25**, formatting and TypeScript/build checks passed.
- Final browser run against the public HTTPS origin: **15/15 passed in 21.2s**, including all 13 deterministic UI paths and two real-chain smoke paths. Downloaded observed results contain all 25 inputs and expected/actual decisions. The future-quote test uses explicitly injected synthetic timestamps; live tests do not mock RPC.
- Historical public live block **25938477**: 0.1 WETH quoted 250.811739 USDC, minimum 249.55768 USDC; reverse 250 USDC quoted 0.099578026581536814 WETH with three successful public-probe reads. These are observations, not current quotes or executed swaps.
- Public page/security headers, health, sample/live API and absent swap endpoint checks passed on the first extension smoke. A subsequent smoke and initial browser run returned HTTP 502 on live RPC paths. Local real-chain smoke later passed at block 25938466, and the final public browser run passed both live paths. The free upstream remains intermittent; this result does not establish reliable availability. No fallback data was relabelled as live and no quote policy was weakened.
- The initial public browser run also found a timing race: the confirm button could be offered before the quote timestamp reached the UI clock. Confirmation itself rejected it. The UI now disables confirmation until the validity interval begins and gives clock guidance. A new deterministic future-clock test covers this. Local 13/13 UI regression and final public 15/15 passed after the correction.
- Public checks used the existing proxy/network setup with normal TLS. New lab verification itself runs locally without RPC. No wallet was connected, no transaction simulated/executed and no final competition form submitted.

## Task-budget experiment — 2026-09-09 (local research, not a deployment)

- Added 24 pure policy/budget/local-endpoint guard tests and four artifact-integrity
  tests, for **174 deterministic tests**. Artifact checks verify the calibration
  SHA-256, receipt status/output relations, all 144 replay traces and retained
  negative completion outcomes. They do not independently certify the RPC provider.
- Two fresh local fork measurements at block **25938600** matched across all six
  route/size profiles: full transaction gas, Quoter internal gas, quotes, feeds,
  approval costs, output floors and resulting balance deltas.
- Successful receipt lookup required waiting for automining; an initial aborted
  run was excluded. Auxiliary evidence-test typing and block-metadata assertions
  were corrected before final checks. Raw successful calibration bytes were not
  rewritten to make assertions pass.
- TypeScript/Vite build passed with the unchanged public frontend bundle. No new
  browser run or deployment is claimed for this experiment-only extension.
- The first heuristic completed **28/48** constructed tasks versus **34/48** for
  both immediate baselines. See [all results and caveats](../experiments/README.md).
  No real-world fill improvement or routing superiority has been established.
- Only isolated chain-31337 fake-money transactions were executed. Both temporary
  Anvil nodes were stopped. No real wallet, mainnet state or other project changed.
