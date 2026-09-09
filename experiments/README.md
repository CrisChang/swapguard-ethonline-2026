# Task-budget experiment: first results and reproduction

This extension is **local research code**, not a deployed trading service. The
public website remains read-only and unchanged. No user funds were used.

## Outcome — 2026-09-09

Read the [full report](results/REPORT-25938600.md),
[gas receipts](results/fork-25938600.json),
[all 144 modeled task outcomes](results/tasks-25938600.json) and
[predeclared protocol](PROTOCOL.md).

We measured six route/size combinations at mainnet fork block **25938600**:
0.01, 0.04 and 0.2 WETH into USDC, with 500/3000 fee pools. Independent local
snapshots produced six successful swaps, six deliberately reverted swaps, and
six exact-amount approvals. Gas used was 134,241–135,253 for success,
139,347–140,359 for revert, and 46,040–46,052 for approval. The funding deposit
is fixture preparation, excluded from task gas because tasks start with WETH.
Local receipts are not transactions on mainnet and their hashes should not be
looked up on Etherscan. The fork runs Anvil 1.7.1's default `latest` EVM rules;
we have not independently checked the historical mainnet hardfork schedule.

Using those gas measurements in the **constructed**, non-historical task replay:

- Both immediate baselines completed **34/48**; task-budget completed **28/48**.
- The task policy did NOT improve completion. Six additional tasks failed to
  complete: two because the price floor was missed, four because gas rose.
- On the **28 tasks both completed**, modeled total gas was **15.4572 vs 8.7412
  USDC-equivalent**. This conditional reduction does not compensate automatically
  for the six missed trades and is not an expected real-world saving rate.
- The simple gross-output and gas-adjusted two-pool policies selected identically
  in this dataset. There is **no demonstrated routing advantage** here.
- All three policies respected the original floor and estimated hard gas cap in
  the model. This is a model invariant, not an onchain safety guarantee.

**Decision:** do not publish “higher fill rate” or “always saves gas.” The useful
product question is whether a user prefers immediate execution or a cost-limited
task allowed to wait/miss execution. A fixed 0.1% cost target is too restrictive
for some small tasks. We have NOT tuned the threshold after looking at outcomes.

## Next bounded iteration, not implemented yet

1. Expose task intent: **time-sensitive** (send a feasible net-best route promptly)
   versus **cost-sensitive** (explicit user budget and latest acceptable time,
   including consent to non-completion). Do not hide this tradeoff behind “AI.”
2. Derive a feasible cost range from current full-transaction estimates plus
   required approval. Do not silently turn a small task into a three-minute wait
   for a cost target that is already unrealistic.
3. Freeze a new evaluation protocol and evaluate separate historical block windows,
   both price and gas trajectories, before tuning. Add an official gas-aware
   router baseline; two single-hop pools cannot establish superiority over SOR.
4. Revalidate before approval and again before swap, account for changing gas
   between the two, and test stale estimates, dropped transactions and RPC failure.
   Only then consider a public read-only comparison panel and a narrated demo.

## Reproduce offline (no RPC or wallet needed)

```sh
npm ci
npm test
npm run experiment:replay
npm run build
```

The replay consumes the checked-in gas file. It writes generated task JSON and a
Markdown report. The calibration file's SHA-256 is embedded in the replay file;
test coverage verifies it and recomputes every stored task trace.

## Repeat the local-fork calibration

Requirements: Node 22, the pinned project-local Anvil npm package, access to a
public mainnet RPC supporting historical state. First start a **new** isolated
Anvil instance in a separate terminal:

```sh
node node_modules/@foundry-rs/anvil/bin.mjs --host 127.0.0.1 --port 18545 --chain-id 31337 --fork-url https://ethereum-rpc.publicnode.com --fork-block-number 25938600 --no-storage-caching --accounts 2 --quiet --timeout 15000 --retries 2
```

From the repo, in the other terminal:

```sh
EXPERIMENT_OUTPUT_DIR=.cache/repeated-calibration npm run experiment:measure
```

Stop the owned Anvil process with Ctrl-C after the run. Do not substitute a user's
wallet or real RPC for the local endpoint. Writes refuse any URL other than the
hard-coded loopback/port and chain 31337. The script also verifies the initial
fork block/hash and will refuse an already-mutated node. Output uses exclusive
creation to avoid overwriting recorded evidence. Choose a new output directory
for each repeat. Compare quotes/gas/status, not wall-clock timestamps or hashes.

If the machine requires a proxy, use its normal HTTPS/HTTP proxy environment for
the upstream connection and **NO_PROXY=127.0.0.1,localhost** for local calls;
Node 22 may require `NODE_USE_ENV_PROXY=1`. Never disable TLS verification.

## First-run engineering notes

- The first receipt lookup occurred before Anvil finished automining. That run
  aborted before any result file was created; it was not counted as a passing
  measurement. The script now waits for the receipt, with a 45-second timeout.
- Only the owned disposable fork was reset before the successful run. The fork
  process was stopped afterward; no mainnet state was changed.
- An independent fresh-fork repeat at **2026-09-09 08:37:00 UTC** matched the first
  run at **08:32:28 UTC** for all six profiles: block/hash/time, feed values,
  quotes, Quoter gas, approval gas, swap/revert gas, receipt status, actual output
  and floor. Timestamps of the runs and local transaction hashes are not the
  reproducibility criterion. Temporary repeat data is in
  `.cache/replication-1/fork-25938600.json` (not shipped as a second market sample).
- The first compiler pass on the replay script found an inferred-array typing
  error. Explicit result types fixed it; the final compiler/test checks are the
  relevant evidence, not that intermediate failure.

The predeclared stress set is deliberately small. No statistical significance,
market-representative frequency, learned success probability or production-ready
optimizer is claimed.
