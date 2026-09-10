# SwapGuard for existing swap agents

Version: local advisory ledger v1, 2026-09-10. No signing, RPC receipt verification or production enforcement is provided by this MCP server.

## Audience, pain and result

The first audience is developers of existing DCA, rebalancing or conversion agents. The bounded task is one Ethereum WETH → USDC conversion with approval and retry accounting. Keep the existing quote/execution channel; call SwapGuard for task-level accounting and checks. This does **not** mean arbitrary routers or their calldata are supported.

Individual receipts can already be found in a block explorer. The problem hypothesis is that a workflow may not carry the original user constraints and cumulative costs across those receipts, refreshed quotes, retries and Agent restarts. We have not established how many users have this problem, interviewed customers or measured adoption. “Most traders do not record losses” is not a verified claim.

Output: original terms, every assessed attempt, pending state, reported receipts, disjoint gas categories, remaining budget, gross output and output after task gas. Decisions are deterministic code, not an LLM's price prediction. An exported report includes unsuccessful and unfinished tasks, not just cheaper completed trades.

## Four tools

| Tool                       | Inputs / behavior                                                                                                                                     | Boundary                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `swapguard_open_task`      | `taskId`, `amountWeth`, `initialQuoteUsdc`, `minimumOutputUsdc`, `gasBudgetUsdc`, `maxAttempts` (1–3), `expiresAtMs` (next 24 hours)                  | Exact duplicate terms return the existing task; changed terms under the same ID fail. Terms are caller assertions, not authenticated user consent.                             |
| `swapguard_assess_attempt` | `taskId`, unique `attemptId`, `kind` (`approval`/`swap`), `amountWeth`, `quotedOutputUsdc`, `transactionMinimumUsdc`, `estimatedGasUsdc`, `quoteAtMs` | Checks reported values. `ADVISORY_READY` reserves a pending operation, not a signature or actual transaction. An exact retry of this tool never returns fresh send permission. |
| `swapguard_record_receipt` | `taskId`, `attemptId`, unique `receiptId`, `status` (`success`/`reverted`), `gasCostUsdc`, `outputUsdc`                                               | Only a matching pending attempt. Exact duplicates charge once; conflicting receipts fail. Receipts and conversions remain **caller-reported-unverified**.                      |
| `swapguard_get_task`       | `taskId`                                                                                                                                              | Read terms, checks, reported costs and events. Reads local state, not the chain.                                                                                               |

Amounts are decimal **strings**, not floating-point numbers. USDC and USDC-equivalent inputs allow at most 6 decimals; WETH allows 18. The server clock is authoritative for freshness/deadlines; clients cannot supply `now`. Quote freshness is a prototype policy of 60 seconds with at most 5 seconds of future-clock tolerance, not a Uniswap guarantee. Each task accepts at most 100 observations and 3 approval preparations. The journal supports up to 100 tasks, 5,000 mutating calls or 4 MiB, then fails closed rather than discarding old costs.

## Run and connect locally

Requires Node.js 22. From the repository:

```sh
npm ci
npm run mcp
```

`npm run mcp` is a local stdio service, not an HTTP endpoint or a chat UI. A stdio-capable Agent client launches it as a child process. For clients using the common `mcpServers` configuration shape, substitute your actual **absolute** paths in this example (configuration keys can vary by client):

```json
{
  "mcpServers": {
    "swapguard": {
      "command": "node",
      "args": [
        "--import",
        "/absolute/path/swapguard/node_modules/tsx/dist/loader.mjs",
        "/absolute/path/swapguard/server/mcp.ts"
      ],
      "env": {
        "SWAPGUARD_LEDGER_PATH": "/absolute/private/path/swapguard/agent-ledger.jsonl"
      }
    }
  }
}
```

No key or RPC secret is needed. Do not provide a wallet private key. The public Workers website does **not** expose `/mcp` or a hosted task-store endpoint. The website's manual live analysis uses the existing separate `/api/analyze` endpoint and is not automatically coupled to these task reports.

The server uses the official MCP TypeScript v2 SDK (2.0.0). `npm run check:mcp` runs a real SDK client against the stdio server, checks all four tools and restarts the server to verify retained costs. Inputs are constructed; this is an integration test, not an evaluation of a live LLM or production trading agent.

## Suggested Agent operating instructions

1. Ask the user to confirm amount, original minimum output, total task gas budget, deadline and retry limit. Record them once. Preserve the same task ID across retries and restarts. Do not invent a new ID to bypass an exhausted budget.
2. Obtain fresh quotes and independently validated operation gas estimates through the existing integration. Count approval separately and use a conservative success/revert estimate for the next operation. Recheck after approval; an affordable approval does not mean the later swap is affordable. Record the gas conversion method outside this v1 ledger.
3. Call `swapguard_assess_attempt`. `WAIT` means obtain a new observation or resolve a pending receipt; `REJECT` means do not silently alter the original task; `STOP` means do not keep trying this task. None of these responses authorizes wallet use.
4. This server does not validate the actual transaction payload. A separate execution integration must bind the exact checked terms to calldata, validate wallet state and obtain the appropriate authorization. Do not execute a transaction solely because this accounting tool returned `ADVISORY_READY`.
5. Record the matching receipt, including reverted gas. Never fabricate a zero-cost success to clear pending state. After a crash, query the pending task and reconcile the actual operation through your execution channel before any new attempt.
6. Present the full report, including unfinished output, spent gas, overruns and missing verification. Never describe net output as guaranteed savings or investment P&L.

## Illustrative example, not live market data

For 0.04 WETH, assume an initial quote of 100 USDC, original minimum of 99.5 USDC and a total gas budget of 3 USDC-equivalent. An approval reports 0.4 and a reverted swap reports 1.0: **1.4 is already spent**.

- A new attempt estimated at 1.9 returns `WAIT`: 1.4 + 1.9 > 3.
- A request lowering the transaction minimum to 98 returns `REJECT`.
- A retry estimated at 0.5 can return `ADVISORY_READY`. If a caller reports 99.8 output and 0.5 actual gas, gross output is 99.8 and output after all task gas is 97.9. This does not mean the original **gross** 99.5 minimum was breached.
- If that receipt instead reports 2.1 gas, spent gas is 3.5 and the remaining budget is −0.5. Keep the overrun; the estimate was not an onchain cap.

The website's five Agent examples use these round numbers and an explicit replay clock. They run the same pure accounting module in the browser but make **no MCP connection** and keep no durable user ledger. Exports label them `synthetic-browser-example`. The calibrated older task replay and frozen pilot are separate evidence.

## Accounting definitions

- `approvals`, `failedSwaps`, `successfulSwaps` are disjoint gas categories. A failed approval is counted under approvals, not charged again under failed swaps.
- Gas is paid in ETH. This v1 interface accepts caller-converted USDC-equivalent costs; it does not independently verify feeds, receipt gas, conversion timestamps or rounding. Integrators should calculate from gas used × effective gas price and both asset reference prices, rounding costs upward.
- Pool fees and price impact already affect quoted/received output. Do not subtract the pool fee again.
- Gross output minus task gas is not investment P&L: inventory acquisition cost is outside scope. Difference from the initial quote is not pure slippage and does not isolate causes.
- Uncompleted tasks retain spent gas with null output/net output. Do not count non-completion as successful savings.
- Wrapping, token acquisition, revocations, RPC/Agent operating costs and unrelated wallet activity are outside this task's cost coverage.

## Persistence and trust

The default journal is `.swapguard/agent-ledger.jsonl`, resolved relative to the process working directory and ignored by Git. Prefer an explicit private absolute path. Mutating operations are appended and flushed before returning success; state is reconstructed by replay on restart. Existing recorded totals are not trusted directly. A single-writer lock prevents two local processes from writing the same file. Protect the parent directory; do not share this server or journal among unrelated users.

A truncated, invalid or oversized journal fails closed. It is never silently reset. After an unclean process kill, a stale `.lock` can require operator recovery: first confirm the recorded process has stopped, preserve the journal, then remove **only that stale lock**. Do not delete active locks or the ledger to get around budget checks. Pending operation cancellation, crash recovery from partial writes and a production storage migration tool are not implemented.

The file is **not authenticated or tamper-proof**; its owner can modify it. Tool callers can invent quotes/receipts or create separate tasks. There is no wallet-wide cap, multi-user authentication, signed user intent, chain finality, nonce/replacement/reorg management or full transaction simulation. A separate signer can bypass MCP. Production enforcement requires a verified execution adapter and authorization boundary, not just a Skill instruction.

## Evidence, limits and next validation

The public website's **Test reports** section hosts the fixed `agent-ledger-2026-09-10` batch: 8 predefined scenarios, 46 actual local MCP calls, 2 expected tool errors and 2 process-restart scenarios. Full input/output transcripts, synthetic journal events, a readable Markdown report and source SHA-256 fingerprints are downloadable. This is distinct from the browser-only interactive examples. All behavior assertions passed; that is not a swap success rate. No live LLM, wallet or RPC was used. The publisher owns these constructed test records; the website does not upload or expose a visitor's private MCP journal.

Run `npm run record:agent-evidence -- agent-ledger-YYYY-MM-DD-your-run` to create a new batch. Never rewrite existing frozen JSON to update a result; its digest is verified by tests. A future implementation revision needs a new matched source/evidence batch if it changes the exercised source files.

Implemented: schema validation, immutable in-task terms, exact decimal accounting, pending-state checks, duplicate/conflict handling, late/overrun receipt retention, durable local journal and SDK transport integration.

Not established: authentic chain receipts through MCP, actual LLM adherence, customer demand, universality across swap channels, cost optimality, improved completion or superiority over Uniswap smart routing. The existing pilot's **28/48 versus 34/48** completion result remains unchanged; it is not an Agent benchmark.

Next useful increment: independently verify receipts and gas conversion for one supported execution adapter, bind its exact calldata to user-confirmed conditions, then compare against an equally constrained baseline using held-out scenarios. Include total gas, failure gas, completed/unfinished tasks and latency together.

## Source and protocol references

- Core and schemas: `src/lib/agent-ledger.ts`; explanatory examples: `src/lib/agent-examples.ts`.
- Local persistence: `server/agent-journal.ts`; MCP adapter: `server/mcp.ts`; SDK integration check: `scripts/check-mcp.ts`.
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
- [Uniswap's existing Agent tools](https://github.com/Uniswap/uniswap-ai). We complement, and have not demonstrated replacement or superiority over, those tools.

## Human-approved direction and implementation specification

The participant asked to keep the manual swap analysis page, add scenarios for other agents, and clarify the service audience, problem, outputs, capability boundaries, background and cost-recording pain. The agreed scope was task-level accounting/original constraints rather than “minimum loss.” This extension implements a local advisory MCP interface and constructed website examples, preserves manual read-only analysis and all frozen evidence, and makes missing receipt verification explicit. Website publication, GitHub synchronization and ETHGlobal form/video changes are separate actions.
