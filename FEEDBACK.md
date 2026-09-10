# Uniswap Developer Feedback — SwapGuard

Updated: 2026-09-10. Status: integration notes prepared; **completion of the external Uniswap Developer Feedback Form is unverified**. The historical notes below retain what was known on 2026-09-09.

## Integration used

Ethereum mainnet Uniswap v3 Factory and QuoterV2, via viem `readContract` and `simulateContract`. Exact-input WETH/USDC quotes at 500 and 3000 fee tiers are compared at the same block. See `server/live.ts` and `src/lib/contracts.ts`. The website makes no transactions and deploys no custom smart contracts. Separate local-only scripts execute forked contracts with fake funds.

SwapGuard is a preflight UI, not a swap router. We also read the input token's ERC-20 allowance to legacy SwapRouter02 and Permit2 for exposure context. Those reads do not constitute Universal Router integration or inspection of Permit2's internal per-spender permissions.

## What worked

- The official deployment registry made the canonical mainnet addresses discoverable without a hosted API key.
- QuoterV2's amount-out result can be consumed directly by integer minimum-output math.
- A fixed block lets the UI expose the same observation point for quotes, reference prices and optional balances.
- Supporting both WETH/USDC directions immediately exercises different token decimal precision.

## Friction encountered

- QuoterV2 uses a tuple parameter and read-only simulation of a non-view contract function. A newcomer could mistake this for a wallet transaction requirement. A minimal `eth_call` example with explicit “no signing/broadcast” wording would help.
- The deployment page identifies legacy vs current routers, while token allowances, Permit2 allowances and Permit2 signatures are distinct surfaces. A concise allowance-scope matrix would help tooling authors avoid overstating coverage.
- Parallel calls to public RPCs were intermittently failing. Later diagnosis found that oversized JSON-RPC batches violate the backup provider's free limit, and the cloud deployment separately receives upstream rate limits. The app now uses independent single-call requests and explicit upstream-throttling errors; a dedicated RPC still needs configuration/verification. This is an infrastructure issue, not evidence of a Uniswap contract failure.
- Price deviation from an independent feed includes pool fees and oracle timing. It must not be labelled as pure price impact or MEV risk. A reference UX explaining these distinctions would be useful.

## Concrete suggestions

1. A viem QuoterV2 example covering both exact-input directions, token decimals, fixed-block reads, and revert/no-liquidity handling.
2. A current-vs-legacy router / ERC-20 / Permit2 permission diagram linked from quoting and swapping docs.
3. A checklist for advisory tools: quote age, partial route coverage, fee-inclusive output, excluded gas, and incomplete-wallet-data labels.

## Parameter-consistency extension — 2026-09-09

Added a browser-local legacy SwapRouter02 decoder for a deadline-bound multicall with one exactInputSingle. It compares encoded minimum and related fields to independently confirmed conditions using 25 public synthetic cases. See `src/lib/protection.ts` and `docs/PROTECTION.md`. No transaction was executed. The external feedback form remains unsubmitted.

Additional friction: original v3 SwapRouter examples and SwapRouter02 have different inner tuples. The latter has no inner deadline; our check requires the deadline overload on multicall. Middleware examples should distinguish these shapes, amount/recipient sentinels and unsupported operations. Tolerance conventions also matter: output-relative subtraction and price-relative division can produce different minima at the same displayed percentage.

Suggested reference: independently captured user intent mapped to decoded router fields, with normal, mutated and unsupported cases. This checker does not yet cover Universal Router or replace wallet simulation.

## Coverage boundary

This first version compares only two single pools. It does not offer Uniswap smart routing, Universal Router execution, Permit2 signing, hooks or MEV protection. Future work should improve actual coverage before adding broader marketing claims.

## Task-level cost workbench — 2026-09-09

The updated workbench addresses approval and retry costs across one automated WETH/USDC task. It locks an original floor, total gas budget and retry/deadline limits, then reconciles receipts without erasing failed gas. Timely/cost-first preferences expose the waiting-versus-completion tradeoff. Online receipts remain explicitly synthetic; actual local-fork approval/revert/retry receipts exercise the same ledger in `scripts/check-task-fork.ts`. No mainnet transaction occurred.

Measured full transaction gas (including reverted execution) was materially different from QuoterV2's internal gas estimate. A reference task-cost example should separately account for approval, successful execution, reverted execution and transaction replacement; it should never treat an internal quote gas figure as the entire user's transaction cost.

Our first fixed constructed-path pilot completed fewer tasks under a wait-for-cheaper-gas policy. Both immediate routing baselines behaved identically. We suggest publishing non-completion and original-floor retention alongside gas numbers, not advertising cheaper completed subsets as universal savings. This is tooling feedback, not a claim to improve Uniswap's existing gas-aware router.

## Agent integration and updated availability — 2026-09-10

The product now targets developers of existing swap agents. A local advisory MCP interface records original task terms, cumulative reported gas and pending operations across restarts. Browser examples show approval/failure/retry accounting, weakening a floor, duplicate preparation, budget exhaustion and receipt overruns. Inputs and receipts in this MCP version are caller-reported, not independently authenticated; this is not Universal Router execution or a production wallet guard. Manual read-only quoting and the earlier narrow draft verifier remain available.

Suggested ecosystem example: show how an existing swap Agent preserves a user's original minimum and reconciles full approval/revert/retry receipts across a task without interpreting a refreshed quote as renewed consent. Explicitly separate gas estimates from actual receipts and avoid subtracting pool fees already reflected in output. A reference for exact transaction binding, receipt finality and task-id reuse would help integrations move from advisory tools to enforceable workflows.

The separate readiness audit passed both live quote directions on the public website at block 25944202 after dedicated RPC configuration. Earlier errors described above remain valid historical observations, not the latest availability result. No new claim of mainnet execution, human code-review completion or external feedback-form submission is made.
