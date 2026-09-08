# Uniswap Developer Feedback — SwapGuard v0.1

Date: 2026-09-08. Status: integration notes prepared; **external Uniswap Developer Feedback Form has not been submitted**.

## Integration used

Ethereum mainnet Uniswap v3 Factory and QuoterV2, via viem `readContract` and `simulateContract`. Exact-input WETH/USDC quotes at 500 and 3000 fee tiers are compared at the same block. See `server/live.ts` and `src/lib/contracts.ts`. We make no transactions and deploy no custom smart contracts.

SwapGuard is a preflight UI, not a swap router. We also read the input token's ERC-20 allowance to legacy SwapRouter02 and Permit2 for exposure context. Those reads do not constitute Universal Router integration or inspection of Permit2's internal per-spender permissions.

## What worked

- The official deployment registry made the canonical mainnet addresses discoverable without a hosted API key.
- QuoterV2's amount-out result can be consumed directly by integer minimum-output math.
- A fixed block lets the UI expose the same observation point for quotes, reference prices and optional balances.
- Supporting both WETH/USDC directions immediately exercises different token decimal precision.

## Friction encountered

- QuoterV2 uses a tuple parameter and read-only simulation of a non-view contract function. A newcomer could mistake this for a wallet transaction requirement. A minimal `eth_call` example with explicit “no signing/broadcast” wording would help.
- The deployment page identifies legacy vs current routers, while token allowances, Permit2 allowances and Permit2 signatures are distinct surfaces. A concise allowance-scope matrix would help tooling authors avoid overstating coverage.
- Parallel calls to public RPCs were intermittently failing in our local setup. JSON-RPC batching reduced connections and the subsequent smoke test succeeded. This is an infrastructure observation, not proof of a Uniswap contract issue.
- Price deviation from an independent feed includes pool fees and oracle timing. It must not be labelled as pure price impact or MEV risk. A reference UX explaining these distinctions would be useful.

## Concrete suggestions

1. A viem QuoterV2 example covering both exact-input directions, token decimals, fixed-block reads, and revert/no-liquidity handling.
2. A current-vs-legacy router / ERC-20 / Permit2 permission diagram linked from quoting and swapping docs.
3. A checklist for advisory tools: quote age, partial route coverage, fee-inclusive output, excluded gas, and incomplete-wallet-data labels.

## Boundaries

This first version compares only two single pools. It does not offer Uniswap smart routing, Universal Router execution, Permit2 signing, hooks or MEV protection. Future work should improve actual coverage before adding broader marketing claims.
