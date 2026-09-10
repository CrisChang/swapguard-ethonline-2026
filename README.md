# SwapGuard

**One swap task. Every attempt counts.** Task cost accounting and original-intent checks for existing Uniswap agents, built from scratch for ETHOnline 2026. Local advisory MCP plus a manual read-only analysis website.

SwapGuard focuses on small automated WETH → USDC tasks: **an approval and failed retries can consume the budget even when no swap completes.** Developers keep their execution channel and use a task ledger to retain the original minimum, cumulative gas budget, deadline and attempt limit. The local MCP server persists across restarts and distinguishes **unverified caller reports** from **optional RPC-verified receipts** for a narrow WETH/USDC SwapRouter02 adapter. Quotes and estimates remain caller-supplied. MCP does not sign or broadcast. The manual Uniswap v3/Chainlink live quote panel remains available; the website never connects a wallet or requests approvals/signatures.

**[Try the public demo](https://swapguard-ethonline-2026.swapguard.workers.dev)** · **[Source repository](https://github.com/CrisChang/swapguard-ethonline-2026)**

The **Agent examples** use made-up round numbers and run the same ledger core as MCP, without a browser-to-MCP connection. The older **Task replay** uses constructed paths and synthetic receipts anchored to measured local-fork gas. Neither is a live trading bot. Choose **Live onchain** in **Manual analysis** for actual read-only mainnet data. [Agent integration and trust boundaries](docs/AGENT_INTEGRATION.md).

Validation is recorded by version in [docs/VALIDATION.md](docs/VALIDATION.md), including failures and skipped checks. The replay and local MCP ledger run without RPC; live analysis depends on provider availability.

## Published Agent test records

The [test reports section](https://swapguard-ethonline-2026.swapguard.workers.dev/#evidence) now includes actual local-fork Uniswap execution by a **project-authored deterministic reference swap agent**, connected to a separate stdio MCP process. Four predeclared cases are reset to identical snapshots for three policies:

| Policy                               | Completed | Completed within constraints | Over budget | Total task gas, USDC-eq |
| ------------------------------------ | --------: | ---------------------------: | ----------: | ----------------------: |
| Per-attempt budget, limited baseline |       4/4 |                          2/4 |         2/4 |                2.219848 |
| Independent cumulative budget        |       3/4 |                          2/4 |         1/4 |                 1.88034 |
| Same reference agent + SwapGuard MCP |       3/4 |                          2/4 |         1/4 |                 1.88034 |

The MCP policy matches the equally constrained baseline; it does **not** demonstrate better routing or cost optimization. One fewer completion accompanies one fewer overrun. All three retain an underestimated-gas overrun. These are fake-money local EVM transactions with deliberate fault injection, not public mainnet trades, a market backtest, live LLM evaluation or third-party Agent adoption. [Protocol](experiments/AGENT_RPC_PROTOCOL.md), [per-case report](public/evidence/rpc-agent-2026-09-10.md), [full calls/receipts/journals](public/evidence/rpc-agent-2026-09-10.json), [source fingerprints](public/evidence/rpc-agent-2026-09-10.manifest.json).

The historical **8 constructed scenarios, 46 actual local MCP tool calls and 2 process-restart scenarios** remain separately labelled. Their two expected tool errors, unfinished tasks, gas overrun and below-floor output are retained. They are behavioral checks, not executed swaps. Historical source fingerprints refer to that historical batch; the new receipt batch fingerprints the current exercised implementation.

Reproduce with `npm run record:agent-evidence -- agent-ledger-YYYY-MM-DD-your-run`. The recorder will not overwrite an existing batch. Public test files are separate from private local MCP journals and are never uploaded from visitors' wallets.

## Audience, problem, outputs and boundary

- **Audience:** developers of existing DCA/rebalancing/conversion agents; first ledger scope is one Ethereum WETH → USDC task.
- **Problem hypothesis:** individual transaction receipts do not by themselves preserve a task's original user constraints or explain cumulative retry costs. The prevalence of this pain is not established by user research.
- **Outputs:** checks and reasons, original terms, pending state, reported approval/failed-swap/successful-swap gas, remaining budget, gross output and output after task gas, with exportable records.
- **Not a minimum-loss product:** no profit guarantee, best routing, authenticated wallet consent or enforced wallet-wide cap. Optional verification trusts the configured RPC, not a cryptographic inclusion proof. A signer can bypass the interface. Account-wide history import is not implemented.
- **Accounting:** fees already affect quoted/received output; do not subtract them twice. Output after gas is not investment P&L. An unfinished task retains its costs and has null output.

## Connect an existing Agent (local MCP)

```sh
npm ci
npm run mcp
# In a separate terminal: real SDK client, constructed inputs, temporary ledger
npm run check:mcp
```

Four default tools: `swapguard_open_task`, `swapguard_assess_attempt`, `swapguard_record_receipt`, `swapguard_get_task`. Configuring `SWAPGUARD_VERIFY_RPC_URL` enables a fifth, `swapguard_verify_receipt`, which accepts task/attempt IDs and a hash instead of caller costs. Bound tasks include an immutable wallet, chain and server-read creation anchor. Use a stdio-capable client and a private `SWAPGUARD_LEDGER_PATH`. No remote MCP endpoint is hosted on the website. Existing terms cannot be edited; exact receipt duplicates charge once; pending operations prevent duplicate preparations. Readiness is advisory, not signing permission. The local file is not tamper-proof, and legacy receipt reports remain unverified. Full setup and limits: [AGENT_INTEGRATION.md](docs/AGENT_INTEGRATION.md).

**Ecosystem focus:** Uniswap first. The Graph is a candidate for genuinely useful historical data, not an implemented integration or a prize claim. We do not add a third ecosystem merely to fill a slot.

## Run locally

### Task workbench and frozen pilot

The [first gas/whole-task experiment](experiments/README.md) measures local-fork
transaction gas and uses it in clearly labelled synthetic task paths. Waiting
reduced costs on some jointly completed tasks **but completed 28/48 versus the
immediate baselines' 34/48**; it does not establish a higher fill rate or routing
advantage. This frozen result is not retuned for the workbench. All raw data, negative
cases and reproduction commands are included; no user wallet or funds were used.

Open **Task workbench**. Default: 0.04 WETH, 0.5% price tolerance, 3 USDC-equivalent total gas budget, timely execution, three swap attempts, and “Revert, then recover.” Confirm conditions, advance to a prepared approval, reconcile its synthetic receipt, then inspect the first revert and successful retry. Or use **Run remaining replay**. Export the final or partial JSON report. Task state survives reload in this browser, including pending receipts. Cost-first mode exposes the tradeoff between waiting and missing the original floor; it does not promise an optimum.

The deadline is relative replay time, not a background timer. Gas is paid in ETH but valued in USDC-equivalent using pinned ETH/USD and USDC/USD feeds. The hard gas budget is separate from the output floor; it is an advisory pre-send estimate, not onchain enforcement. Allowances are assumed or simulated in the workbench, not read from your wallet. See [workflow, test cases and limits](docs/TASK_WORKBENCH.md).

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

**Latest independent live check, 2026-09-10:** both directions passed on the public
Worker at block 25944202 after dedicated RPC configuration. This is a dated
observation, not continuous uptime assurance. Earlier upstream throttling remains
documented; a rate-limited request returns `503 UPSTREAM_RATE_LIMITED` with retry
guidance, never synthetic fallback prices.
See [validation](docs/VALIDATION.md) and [network scope](docs/NETWORK_REQUIREMENTS.md).

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
       └─ explicit Live   → Ethereum RPC (HTTPS, read-only, single-call fallback)
                             ├─ v3 factory → QuoterV2: two fee tiers
                             ├─ Chainlink ETH/USD + USDC/USD
                             └─ optional ERC-20 balance + two allowances
                 ↓
       deterministic integer policy → PASS / REVIEW / BLOCK / UNKNOWN
                 ↓
       expiring report + source contracts + exact-value JSON
```

The task UI (`src/TaskWorkbench.tsx`) calls pure `src/lib/task-session.ts` and `src/lib/task-budget.ts` in the browser. Decisions see only the current observation, not future path values. Reconciliation accepts one matching pending-operation receipt, charges actual receipt gas and rejects conflicting duplicate receipts. Browser storage contains a replay command log and config; restoring recomputes the ledger rather than trusting stored totals. This is not an authenticated audit log. Exports explicitly carry receipt provenance.

Key files:

| Responsibility                        | File                                                            |
| ------------------------------------- | --------------------------------------------------------------- |
| Actual Uniswap/Chainlink integration  | [Factory / QuoterV2 calls](server/live.ts#L127)                 |
| Mainnet addresses and ABIs            | [Contracts and interfaces](src/lib/contracts.ts#L19)            |
| Agent accounting / schemas            | [Agent ledger](src/lib/agent-ledger.ts)                         |
| Local MCP adapter and durable journal | [MCP server](server/mcp.ts), [journal](server/agent-journal.ts) |
| Agent examples and output definitions | [Integration guide](docs/AGENT_INTEGRATION.md)                  |
| Policy and integer math               | `src/lib/engine.ts`                                             |
| Request validation                    | `src/lib/validation.ts`                                         |
| Read-only API and error isolation     | `server/api.ts`                                                 |
| Explicit synthetic data               | `server/demo.ts`                                                |
| Frontend and report invalidation      | `src/App.tsx`                                                   |
| Cloudflare entry point                | `worker/index.ts`                                               |

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

Not implemented on the website: wallet execution, live receipt monitoring, full transaction simulation, token audit, MEV/sandwich detection, multichain routing, native gas balance checks, all-spender approval discovery, Permit2 per-spender allowances/signatures, a cryptographically signed attestation, a strict global usage budget or an independent security audit. Local development scripts can execute contracts only on an isolated fake-money Anvil fork. Quoter internal gas estimates are not full transaction fee estimates. Pool fees are already included in quoted output and are not charged again; the workbench adds task gas separately. Waiting and amount-out minima are not novel router features; the contribution is the task-level workflow, original-constraint checks and inspectable cost evidence.

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

The participant's dashboard screenshots confirm the earlier project submission and Check-in 2; the public showcase is [SwapGuard](https://ethglobal.com/showcase/swapguard-km1v7). A human-narrated Mandarin demo with English subtitles was uploaded for that version. The Agent extension does not automatically update that form or video. Review the revised [submission copy and checklist](docs/SUBMISSION_DRAFT.md), independently review the AI-assisted code, and complete the external Uniswap feedback form (completion unverified). Re-submit the form after any approved changes; no eligibility or judging outcome is implied.

## Sources

The original project code is available under the [MIT License](LICENSE). Third-party packages and bundled fonts retain their respective licenses.

See [SOURCES.md](docs/SOURCES.md) for official protocol references and attribution. React, Hono, viem, Vite, Lucide, Vitest, Playwright and Wrangler are third-party dependencies recorded in `package-lock.json`. The SwapGuard app, fixtures, tests and SVG shield were created for this repository; no previous project source was copied.
