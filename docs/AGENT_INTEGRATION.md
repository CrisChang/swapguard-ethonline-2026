# SwapGuard for existing swap agents

Version: local advisory ledger with optional RPC receipt verification, 2026-09-10. No signing, broadcasting or wallet-level budget enforcement. Four default tools preserve compatibility; a configured verifier adds a fifth tool.

## Audience, pain and result

The first audience is developers of existing DCA, rebalancing or conversion agents. The bounded task is one Ethereum WETH → USDC conversion with approval and retry accounting. Keep the existing quote/execution channel; call SwapGuard for task-level accounting and checks. This does **not** mean arbitrary routers or their calldata are supported.

Individual receipts can already be found in a block explorer. The problem hypothesis is that a workflow may not carry the original user constraints and cumulative costs across those receipts, refreshed quotes, retries and Agent restarts. We have not established how many users have this problem, interviewed customers or measured adoption. “Most traders do not record losses” is not a verified claim.

Output: original terms, every assessed attempt, pending state, reported receipts, disjoint gas categories, remaining budget, gross output and output after task gas. Decisions are deterministic code, not an LLM's price prediction. An exported report includes unsuccessful and unfinished tasks, not just cheaper completed trades.

## Four default tools

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

No key or RPC secret is needed for the four default tools. Do not provide a wallet private key. The public Workers website does **not** expose `/mcp` or a hosted task-store endpoint. The website's manual live analysis uses the separate `/api/analyze` endpoint and is not automatically coupled to these task reports.

The server uses the official MCP TypeScript v2 SDK (2.0.0). `npm run check:mcp` runs a real SDK client against the stdio server, checks all four tools and restarts the server to verify retained costs. Inputs are constructed; this is an integration test, not an evaluation of a live LLM or production trading agent.

## Optional fifth tool: RPC receipt reconciliation

Add `SWAPGUARD_VERIFY_RPC_URL` and `SWAPGUARD_VERIFY_CHAIN_ID` to the child process environment in the configuration above. The server reads process environment, not a `.env` file automatically.

- Mainnet: operator-configured **HTTPS** Ethereum RPC, chain `1`, minimum 12 confirmations. Personal RPC credentials stay in private environment/configuration; never commit them. Historical feed calls require appropriate RPC state access. This mode is implemented and mock-tested; the recorded end-to-end experiment uses a local fork, not mainnet execution.
- Local Ethereum fork: `http://127.0.0.1:18546`, chain `31337`, minimum 1 confirmation. Non-loopback fork URLs are refused.
- Bind a new task with `execution: { "chainId": 31337, "wallet": "0x..." }` (use the actual complete address). Creation reads the chain and block anchor; unavailable/mismatched RPC fails without creating a bound task. Binding cannot be retrofitted onto an existing task ID. An anchor is not signed wallet consent.
- After an assessed operation is actually mined, call `swapguard_verify_receipt` with **only** `taskId`, `attemptId`, `transactionHash`. Costs/status/output are not accepted from the caller. Retry verification after the required confirmations; do not resend the transaction.

The verifier reads transaction and receipt, matches the bound wallet and supported calldata, checks canonical hashes/confirmations, reads receipt-block ETH/USD and USDC/USD feed values/decimals/freshness, and derives gas used × effective gas price. Conversion is rounded up to 1 micro-USDC. Net USDC transfers to the recipient determine output, reconciled against the exact WETH debit. Native gas, feed values, block/hash and verification time remain in the journal. Successful, reverted, late and over-budget observations retain their costs. Exact verified duplicates charge once.

Supported adapter: exact WETH approval to the configured SwapRouter02 and a single deadline-bound `multicall` containing one WETH → USDC `exactInputSingle`, fee 500 or 3000, exact task amount, assessed minimum and bound recipient. The calldata deadline cannot exceed the creation anchor's derived deadline. No wrapping, arbitrary multi-call, native ETH input, Universal Router, Permit2 signing, blobs or EIP-7702 execution. Unsupported/mismatched transactions, missing logs, stale feeds, insufficient confirmations or RPC errors **leave the operation unresolved**; they are not automatically assigned zero cost or converted to successful receipts. Reconciliation of a mismatched external transaction needs operator investigation. Do not interpret absence of a verified record as absence of expense.

Report provenance is `rpc-verified-receipts`, `mixed-verified-and-reported`, or `caller-reported-unverified`. The legacy record tool still allows caller reports and explicitly labels them; it cannot accept fabricated verification metadata. Quotes and estimates remain unverified in every mode. Journal entries are operator-owned local data, not tamper-proof proofs. RPC verification trusts the provider; it does not cryptographically prove inclusion or monitor later reorgs continuously. It is **post-send reconciliation**, not pre-signature enforcement, and does not bind every transaction property such as gas limit/price or nonce. Mainnet confirmation checks reduce uncertainty; they do not guarantee finality.

## Suggested Agent operating instructions

1. Ask the user to confirm amount, original minimum output, total task gas budget, deadline and retry limit. Record them once. Preserve the same task ID across retries and restarts. Do not invent a new ID to bypass an exhausted budget.
2. Obtain fresh quotes and independently validated operation gas estimates through the existing integration. Count approval separately and use a conservative success/revert estimate for the next operation. Recheck after approval; an affordable approval does not mean the later swap is affordable. Record the gas conversion method outside this v1 ledger.
3. Call `swapguard_assess_attempt`. `WAIT` means obtain a new observation or resolve a pending receipt; `REJECT` means do not silently alter the original task; `STOP` means do not keep trying this task. None of these responses authorizes wallet use.
4. This server does not validate the payload before signing. A separate execution integration must bind the exact checked terms to calldata, validate wallet state and obtain authorization. Do not execute solely because this accounting tool returned `ADVISORY_READY`.
5. Verify the matching mined receipt by hash when the optional supported adapter is configured; otherwise record a clearly unverified report. Include reverted gas. Never fabricate a zero-cost success to clear pending state. After a crash, query the pending task and reconcile the actual operation before any new attempt.
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
- Gas is paid in ETH. The legacy record tool accepts caller-converted USDC-equivalent costs without verifying them. The optional verifier calculates from receipt gas and receipt-block ETH/USD and USDC/USD feeds, rounding upward; feed values and timestamps are retained. These are valuation estimates, not a realized ETH-to-USDC sale.
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

Implemented: schema validation, immutable in-task terms, exact decimal accounting, pending-state checks, duplicate/conflict handling, late/overrun receipt retention, durable local journal, SDK transport, optional narrow RPC receipt verification and actual local-fork reference-agent execution through MCP.

New fixed batch `rpc-agent-2026-09-10`: 12 task runs (four hand-designed cases × three policies), real local Uniswap EVM receipts and one MCP restart across failure/retry. Per-attempt budget: completed 4/4, compliant 2/4, overruns 2/4, total gas 2.219848 USDC-eq. Independent cumulative baseline and MCP each: completed 3/4, compliant 2/4, overruns 1/4, total gas 1.880340. All tasks, including unfinished tasks, count toward total gas. The tight retry trades one completion for one fewer overrun; the estimator-understatement counterexample still overruns. MCP matches the equally constrained baseline—no inherent optimization advantage demonstrated. [Protocol](../experiments/AGENT_RPC_PROTOCOL.md) · [Report](../public/evidence/rpc-agent-2026-09-10.md).

Not established: actual LLM adherence, third-party Agent adoption, customer demand, arbitrary router support, cryptographic receipt authenticity, cost optimality, improved completion or superiority over Uniswap smart routing. The existing pilot's **28/48 versus 34/48** completion result remains unchanged; it is not an Agent benchmark.

Next useful increment: integrate a consenting third-party or LLM-driven swap agent, add pre-send simulation and a separate signer policy, test replacement/reorg recovery and held-out market traces, and measure latency/RPC cost alongside completion and all gas. The current project-authored deterministic agent proves a contract/MCP execution path, not that an LLM reliably follows constraints. Uniswap remains primary; The Graph is a candidate only if historical data has a meaningful role.

To reproduce the local execution batch, launch a **fresh isolated** Anvil at the protocol block on port 18546, then run `node --import tsx scripts/record-rpc-agent-evidence.ts rpc-agent-YYYY-MM-DD-your-run`. The script checks Anvil, local chain ID and fork hash, uses only the node's fake development account, resets the identical snapshot for every policy/case and refuses to overwrite output. It has no configurable external write endpoint and no private-key input. The upstream Ethereum provider is read-only. See the predeclared protocol for all estimates, budgets and fault injection. Existing local hashes can repeat after snapshot resets and are not explorer links.

## Source and protocol references

- Core and schemas: `src/lib/agent-ledger.ts`; explanatory examples: `src/lib/agent-examples.ts`.
- Local persistence: `server/agent-journal.ts`; MCP adapter: `server/mcp.ts`; SDK integration check: `scripts/check-mcp.ts`.
- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk).
- [Uniswap's existing Agent tools](https://github.com/Uniswap/uniswap-ai). We complement, and have not demonstrated replacement or superiority over, those tools.

## Human-approved direction and implementation specification

The participant approved a narrower agent-facing direction, preserving manual analysis, and then approved receipt verification plus same-condition before/after testing, with Uniswap primary and The Graph only a candidate. This increment implements a narrow read-only RPC verifier and a project-authored reference agent executing fake-money local contracts; it does not claim a third-party Agent integration. Existing evidence is preserved. Website/repository updates do not automatically change ETHGlobal forms, prize selections, the submitted video or external feedback submissions.
