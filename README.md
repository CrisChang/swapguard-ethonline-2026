# SwapGuard

**Know the trade. Before you sign.** A read-only swap preflight tool built from scratch for ETHOnline 2026.

SwapGuard gives a user an inspectable second opinion before a WETH/USDC swap: Uniswap v3 quotes, a Chainlink reference, minimum output, and narrowly scoped balance/allowance checks. It does not connect a wallet, ask for a signature, request approval or submit transactions.

## Run locally

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

## What v0.1 actually does

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

Not implemented: swap execution, full transaction simulation, token audit, MEV/sandwich detection, multichain routing, native gas balance checks, all-spender approval discovery, Permit2 per-spender allowances/signatures, a cryptographically signed attestation, production rate limiting or an independent security audit. Quoter gas estimates are not full transaction fee estimates. Pool fees are included in the quote; gas is not.

## Verification

```sh
npm test                         # deterministic unit/API tests; no chain calls
npm run build                    # TypeScript + frontend bundle
npm run test:e2e                 # isolated headless Chrome; deterministic UI tests
npm run check:live               # real WETH → USDC read-only smoke test
npm run check:live -- USDC 250    # real USDC → WETH read-only smoke test
LIVE_SMOKE=1 npm run test:e2e -- --grep 'live mainnet'
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

**Current handoff: local first version. No public deployment or public GitHub URL has been confirmed.** The available Cloudflare CLI session required reauthentication during this build. Never paste localhost into the public competition demo field.

The API has a 4KB body limit, server-side input checks, no-store responses, generic upstream errors and an in-process live concurrency cap. The cap is per process/isolate, not global rate limiting. Before public traffic, add edge rate limiting/abuse controls, a dependable RPC budget, monitoring and privacy review. The app does not intentionally persist addresses or add analytics; an optional address is sent to the application server and upstream RPC, and infrastructure providers may log request metadata. Google Fonts is loaded with system fallbacks.

## Competition readiness

The implemented integration is suitable to **consider** for the Uniswap Stack Contribution prize; eligibility and judging are not guaranteed. Read the current official criteria and complete the external feedback form. [FEEDBACK.md](FEEDBACK.md) is not itself proof that that form was submitted.

Do not claim 1inch Aqua/SwapVM integration, Chainlink CRE execution, a mainnet swap, paying customers, security-audited contracts or guaranteed trading protection: none is implemented or established here.

Before submission: publish the repository, deploy and verify the live URL, review AI-assisted code, complete the sponsor feedback form, record a compliant human-narrated demo, and explicitly submit the ETHGlobal form. See [submission draft and checklist](docs/SUBMISSION_DRAFT.md).

## Sources

See [SOURCES.md](docs/SOURCES.md) for official protocol references and attribution. React, Hono, viem, Vite, Lucide, Vitest, Playwright and Wrangler are third-party dependencies recorded in `package-lock.json`. The SwapGuard app, fixtures, tests and SVG shield were created for this repository; no previous project source was copied.
