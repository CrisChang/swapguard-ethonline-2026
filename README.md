# SwapGuard

**Know the trade. Before you sign.** A read-only swap preflight tool built from scratch for ETHOnline 2026.

SwapGuard checks a specific problem: **does a swap transaction preserve the minimum output the user independently confirmed?** A quote can look unchanged while encoded transaction parameters differ. Users choose a slippage tolerance; SwapGuard calculates the floor, locks conditions locally and compares them with an unsigned draft. It also provides Uniswap v3 quotes, Chainlink references and narrowly scoped balance/allowance context. It does not connect a wallet, request a signature or approval, or submit transactions.

**[Try the public demo](https://swapguard-ethonline-2026.swapguard.workers.dev)** · **[Source repository](https://github.com/CrisChang/swapguard-ethonline-2026)**

The initial screen uses clearly labelled synthetic samples. Choose **Live onchain** for actual read-only mainnet data. Public release verified on 2026-09-09; this is not proof of final ETHGlobal submission.

Latest minimum-output extension: **146 unit/API tests, 25 published synthetic expectations and 15 public browser tests passed** on 2026-09-09. Live RPC returned intermittent 502 errors before the final passing run; free-provider availability is not guaranteed. Lab replay runs without RPC. See the dated [validation record](docs/VALIDATION.md), not just a passing count, for scope and earlier failures.

## Run locally

### Experimental task-budget pilot (not deployed)

The [first gas/whole-task experiment](experiments/README.md) measures local-fork
transaction gas and uses it in clearly labelled synthetic task paths. Waiting
reduced costs on some jointly completed tasks **but completed 28/48 versus the
immediate baselines' 34/48**; it does not establish a higher fill rate or routing
advantage. The public preflight/verifier remains unchanged. All raw data, negative
cases and reproduction commands are included; no user wallet or funds were used.

### Application

Requires Node.js 22 and npm. From this directory:

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5177**. The API runs on port 8787. No private key or API key is needed for the default public RPC configuration. Sample mode is selected initially and is clearly labelled as synthetic. Select **Live onchain**, then **Analyze live swap**, to make real Ethereum mainnet reads.

Optional operator configuration: export `ETHEREUM_RPC_URL` in the shell before starting the server. Only HTTPS endpoints are accepted. `.env.example` documents the variables; the Node entry point does **not** auto-load `.env`. Never put a secret in a `VITE_*` variable or commit it. Public RPC providers can be slow or unavailable; a reliable dedicated endpoint is recommended for a public deployment.

```sh
npm test
npm run build
npm start
```

The built site is served at http://127.0.0.1:8787 by `npm start`.

## Minimum-output verification lab

Open **Reproducible test lab** on the website. The baseline is constructed: 1,000 USDC → 0.400 WETH, 0.5% tolerance, 0.398 WETH floor. A mutation lowers only the encoded floor to 0.360 WETH while the displayed quote remains unchanged. The 0.038 WETH gap is weaker protection, **not an observed loss or money saved**.

- **25 downloadable synthetic cases**: valid controls, zero/lower floors, recipient/input/token/fee/envelope changes, deadlines, unsupported extra/nested calls and expired confirmation.
- Run individual cases or the full suite in the browser; export inputs, declared expectations, observations and content fingerprints. A fixed replay clock makes cases reproducible.
- **Check a transaction draft** uses separately confirmed conditions, never conditions imported alongside the draft. The floor is automatic. Edits or expiry invalidate confirmation/results.
- Supported: Ethereum **legacy SwapRouter02**, WETH ↔ USDC, fees 500/3000, deadline-bound multicall with exactly one canonical exactInputSingle and no price limit. **Not Universal Router coverage.** Unsupported formats fail closed.
- MATCH means only supported parameters preserve the conditions, not safety or execution readiness. Fingerprints are content hashes, not signatures; a downstream signer must still submit the exact checked draft.

See [methodology and reusable verifier](docs/PROTECTION.md). The suite is a regression demonstration, not independent validation or measured real-world attack accuracy.

## Read-only quote component

- Ethereum mainnet only, **WETH ↔ USDC**. Native ETH wrapping is not supported.
- Compares Uniswap v3 **0.05% and 0.30% single-pool quotes** via QuoterV2. Finds pools via the v3 factory. Does not claim full-market or multihop best routing.
- Reads Chainlink **ETH/USD and USDC/USD**, including positive-answer, round-completeness and age checks. WETH is valued as ETH; USDC is not assumed to be exactly $1.
- Pins every contract call in an analysis to one block number. Quote simulation uses `eth_call`, with no broadcast.
- Computes input/output/minimum amounts with `bigint`, in token base units. Minimum output is rounded down. Gas is excluded.
- Optionally reads a public address's token balance and ERC-20 allowances to **SwapRouter02 (legacy)** and **Permit2**. No wallet is connected. No owner means those checks are **UNKNOWN**, not passed.
- Provides normal, risky and stale **synthetic** scenarios. A failed live request returns an error; there is no silent sample fallback.
- Invalidates reports when inputs change, marks them expired after 60 seconds, and exports source values as JSON.

## Architecture

```text
React preflight UI
  └─ POST /api/analyze (validated input; no keys, signing or transaction payload)
       ├─ explicit Sample → synthetic fixtures
       └─ explicit Live   → Ethereum RPC (HTTPS, read-only, batched)
                             ├─ v3 factory → QuoterV2: two fee tiers
                             ├─ Chainlink ETH/USD + USDC/USD
                             └─ optional ERC-20 balance + two allowances
                 ↓
       deterministic integer policy → PASS / REVIEW / BLOCK / UNKNOWN
                 ↓
       expiring report + source contracts + exact-value JSON
```

Key files:

| Responsibility                       | File                    |
| ------------------------------------ | ----------------------- |
| Actual Uniswap/Chainlink integration | `server/live.ts`        |
| Mainnet addresses and ABIs           | `src/lib/contracts.ts`  |
| Policy and integer math              | `src/lib/engine.ts`     |
| Request validation                   | `src/lib/validation.ts` |
| Read-only API and error isolation    | `server/api.ts`         |
| Explicit synthetic data              | `server/demo.ts`        |
| Frontend and report invalidation     | `src/App.tsx`           |
| Cloudflare entry point               | `worker/index.ts`       |

The pure browser-local verifier is `src/lib/protection.ts`, exact floor math is in `src/lib/protection-math.ts`, published cases are in `src/lib/protection-fixtures.ts`, and the interactive lab is `src/ProtectionLab.tsx`. Pasted drafts are not sent to the API. Live quotes still use the read-only server path above.

## Transparent policy — not a safety guarantee

| Check                              | Review / unavailable                       | Block                                                  |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------------------ |
| Absolute quote/reference deviation | ≥0.50%                                     | ≥1.50%                                                 |
| Slippage tolerance                 | ≥1%                                        | ≥3%                                                    |
| Reference price                    | Comparison UNKNOWN if invalid              | Invalid, incomplete, non-positive or stale round       |
| Block age                          | —                                          | Older than 120s or more than 30s ahead of server clock |
| Token balance                      | UNKNOWN if omitted/read fails              | Less than input                                        |
| Inspected allowances               | >10× input is REVIEW; read failure UNKNOWN | —                                                      |

Oracle max ages are **product policies**, not representations of published heartbeat specifications: ETH/USD 3,600s; USDC/USD 86,400s. A report has a 60s UI freshness window. These thresholds are prototype choices, not financial recommendations.

`clear` is shown as **No policy flags**, not “safe to trade.” `blocked` is an advisory policy result, not a smart-contract enforcement mechanism. Zero allowance passing an exposure check does not mean the wallet is execution-ready.

Not implemented: swap execution, full transaction simulation, token audit, MEV/sandwich detection, multichain routing, native gas balance checks, all-spender approval discovery, Permit2 per-spender allowances/signatures, a cryptographically signed attestation, a strict global usage budget or an independent security audit. Quoter gas estimates are not full transaction fee estimates. Pool fees are included in the quote; gas is not.

## Verification

```sh
npm test                         # deterministic unit/API tests; no chain calls
npm run check:protection          # replay 25 published synthetic cases
npm run check:protection -- --json # also print dataset and observations
npm run build                    # TypeScript + frontend bundle
npm run test:e2e                 # isolated headless Chrome; deterministic UI tests
npm run check:live               # real WETH → USDC read-only smoke test
npm run check:live -- USDC 250    # real USDC → WETH read-only smoke test
LIVE_SMOKE=1 npm run test:e2e -- --grep 'live mainnet'
npm run check:deployment -- https://YOUR-WORKER.workers.dev --live
```

Browser tests use installed Google Chrome by default, with a fresh temporary profile. On a machine without Chrome, install Chromium with `npx playwright install chromium` and run `PLAYWRIGHT_CHROMIUM=1 npm run test:e2e`. Live tests depend on RPC availability and current oracle rounds; a legitimate stale-data flag is not a reason to weaken the policy.

See [validation evidence](docs/VALIDATION.md), [build log](docs/BUILD_LOG.md) and [AI assistance disclosure](docs/AI_USAGE.md). Automated tests and smoke checks do not constitute an audit.

## Deploy separately

A new Worker configuration is included, with name `swapguard-ethonline-2026`. It does not use any previous project's worker or credentials.

```sh
npm run build
npx wrangler deploy --dry-run --outdir .cache/worker
```

For a public deployment, authenticate the intended Cloudflare account, verify that the name is unused (or is this project's own Worker), then run `npm run deploy`. If configuring a private RPC endpoint, use a Worker secret named `ETHEREUM_RPC_URL`, not a public frontend variable. Cloudflare `.dev.vars` is local-only. Do not deploy over an unrelated existing service.

**Public first version released on 2026-09-09.** Worker: https://swapguard-ethonline-2026.swapguard.workers.dev. Source: https://github.com/CrisChang/swapguard-ethonline-2026. Anonymous repository access and live API/browser checks passed. The original local commit history is preserved. Never paste localhost into the public competition demo field.

The API has a 4KB body limit, server-side input checks, no-store responses, generic upstream errors and a four-request live concurrency cap per process/isolate. The public Worker additionally requires a Cloudflare rate-limit binding: **60 live analyses per 60 seconds for the shared demo route, per Cloudflare location**. Its counters are eventually consistent, not a strict global budget. All visitors share this anonymous route quota; we do not use caller-provided wallet addresses, API keys or IP addresses as rate-limit keys. A denied request returns 429 and Retry-After. Missing or failing protection returns 503 without calling RPC. Samples and health remain available. Loopback Node development does not use the edge binding. The namespace/key are scoped to SwapGuard; verify namespace `2609087101` is not already assigned to a different policy before deploying into an existing Cloudflare account.

Static Worker assets include CSP, frame protection, no-referrer and restricted browser permissions. Build-time security headers and the read-only live path are checked by `check:deployment`; browser tests can target the built Worker with `TEST_BASE_URL=http://127.0.0.1:8798 LIVE_SMOKE=1 npm run test:e2e` after starting a local Worker on that port, or set TEST_BASE_URL to the public origin. Public header/smoke verification and all nine public browser tests passed on 2026-09-09. The machine's direct DNS/network path failed for workers.dev; verification succeeded using its existing system proxy with normal TLS validation. This does not promise reachability from every network. Before broader traffic, add a dependable RPC budget, monitoring and an operational privacy review. The app does not intentionally persist addresses or add analytics; an optional address is sent to the application server and upstream RPC, and infrastructure providers may log request metadata. Fonts are bundled locally through Fontsource with system fallbacks; no Google Fonts request is made by the page.

See [release handoff](docs/RELEASE_HANDOFF.md) for the remaining account-side steps. Do not upload the local development directory wholesale: it contains ignored dependencies, logs and runtime state.

## Competition readiness

The implemented integration is suitable to **consider** for the Uniswap Stack Contribution prize; eligibility and judging are not guaranteed. Read the current official criteria and complete the external feedback form. [FEEDBACK.md](FEEDBACK.md) is not itself proof that that form was submitted.

Do not claim 1inch Aqua/SwapVM integration, Chainlink CRE execution, a mainnet swap, paying customers, security-audited contracts or guaranteed trading protection: none is implemented or established here.

Before final competition submission: review AI-assisted code, complete the sponsor feedback form, record a compliant human-narrated demo, select the applicable prize and explicitly submit the ETHGlobal form. See [submission draft and checklist](docs/SUBMISSION_DRAFT.md). Repository publication and deployment are complete; the competition form is not claimed submitted.

## Sources

The original project code is available under the [MIT License](LICENSE). Third-party packages and bundled fonts retain their respective licenses.

See [SOURCES.md](docs/SOURCES.md) for official protocol references and attribution. React, Hono, viem, Vite, Lucide, Vitest, Playwright and Wrangler are third-party dependencies recorded in `package-lock.json`. The SwapGuard app, fixtures, tests and SVG shield were created for this repository; no previous project source was copied.
