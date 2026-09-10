# SwapGuard frozen Agent test report

Run: agent-ledger-2026-09-10

Recorded: 2026-09-10T06:06:57.595Z → 2026-09-10T06:07:00.580Z

Eight predefined constructed scenarios, captured via the official MCP SDK against isolated local journals. All cases and tool errors retained. Not independent validation, live LLM behavior, real transaction receipts, or a savings/accuracy benchmark.

## Observed results

8/8 scenarios matched their predefined assertions; 46 MCP calls; 2 expected tool errors; 2 restart cases. Passing a scenario is not a successful swap or a real-world success rate.

| Scenario | Observed state / decision | Reported gas | Remaining budget | Reported gross output |
| --- | --- | --- | --- | --- |
| Revert, then complete | completed_reported | 1.9 | 1.1 | 99.8 |
| Retry exceeds remaining budget | WAIT | 1.4 | 1.6 | unfinished |
| Agent proposes a weaker minimum | REJECT | 1.4 | 1.6 | unfinished |
| Agent tries a duplicate send | WAIT | 0.4 | 2.6 | unfinished |
| Receipt costs exceed the estimate | constraint_breach | 3.5 | -0.5 | 99.8 |
| Repeated receipt charges once | open | 0.4 | 2.6 | unfinished |
| Restart cannot reset existing task terms | open | 0.4 | 2.6 | unfinished |
| Below-floor reported output stays visible | constraint_breach | 1.4 | 1.6 | 98 |

Gas is USDC-equivalent supplied by the caller. Scenarios are alternatives, not independent sampled trades; do not sum them into claimed savings. Completed output below a floor or over budget remains a breach.

## Reproduce and inspect

Full inputs, outputs, tool errors and synthetic journal events: [JSON](agent-ledger-2026-09-10.json). Exact source fingerprints and runtime: [manifest](agent-ledger-2026-09-10.manifest.json).

Artifact SHA-256: `952df7cb42c1d05f4a1e12f661dcb10de70c4fc735226fa7b9fc17ec8485dc4d`. This detects file changes, not an independent audit or signed attestation.

Run `npm run record:agent-evidence -- agent-ledger-YYYY-MM-DD-your-run` from a matching checkout. A new run uses current timestamps; compare semantic results, not byte equality. Existing report files are never overwritten by the recorder.

No RPC calls, chain transactions, wallet keys, customer data or live LLM calls were used. The website hosts this fixed published batch; it does not collect visitor wallet activity or upload private local MCP journals.
