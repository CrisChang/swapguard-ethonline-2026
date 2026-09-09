# Minimum-output consistency: scope and reproducibility

## Claim being tested

Given independently confirmed conditions and one supported unsigned draft, identify whether encoded parameters preserve those conditions. The primary failure is a lower/zero amountOutMinimum despite an unchanged displayed quote. This does not establish how often it occurs in real applications or whether it is malicious. The quote-only panel is a controlled display baseline, not a competing security tool being benchmarked.

## Tolerance vs minimum

Our exact-input, output-relative convention is:

`minimum = floor(quoteOutRaw × (10,000 − toleranceBps) / 10,000)`

Rounding happens once, in output-token base units. For 0.400 WETH and 50 bps, minimum is 0.398 WETH. Users select tolerance; the UI derives the amount. Other SDKs can use price-relative conventions such as division by `1 + tolerance`. Integrations must agree on the explicit amount and convention, not assume SDK parity.

Tolerance is a chosen percentage, minimum received is a transaction parameter, and realized slippage is an observed execution outcome. Reference-price deviation and price impact are different measures. SwapGuard neither replaces router enforcement nor measures an actual trade outcome.

## Accepted shape and independent conditions

Ethereum chain 1, legacy SwapRouter02, WETH/USDC in either direction, fee 500 or 3000, zero attached ETH. Exactly one exactInputSingle must be inside multicall(uint256 deadline, bytes[] data). SwapRouter02's inner tuple does **not** contain a deadline. Both layers must match canonical ABI re-encoding without trailing bytes. Nonzero price limits, router-balance amount sentinels, special recipients, extra/nested calls and other formats are unsupported.

Sender, recipient, exact input, pair, fee and envelope must match. Encoded minimum must be at least the confirmed floor; a stronger floor matches this check but may cause a revert. Encoded deadline must not have passed or exceed the confirmed limit. Quote confirmation lasts at most 60 seconds; the separate execution deadline is at most five minutes from quote creation. Edits require fresh confirmation.

Only the transaction may be imported: chainId, from, to, value (decimal wei string), data (hex). Conditions are separately created from a trusted source. Unknown imported fields are rejected. No wallet is connected and no draft is sent to the analysis API.

## Reproduce

```sh
npm ci
npm run check:protection
npm run check:protection -- --json
npm test
npm run test:e2e
```

Or run the website lab and download inputs/results. Each case includes full conditions, calldata, declared expectations and a fixed replay clock. A fixed-clock result is not a currently valid transaction.

There are three valid controls and 22 cases expected not to return MATCH. Expected decisions and specific failing comparisons are declared separately from the verifier. Unit tests include a hand-encoded ABI reference. Fixture encoder and verifier still share viem/ABI definitions: this is not independent validation or real-world attack accuracy. Browser elapsed time measures only this local suite, not RPC or transaction performance. Fork-based simulation and independent integration testing remain future work.

## Reuse and limits

`src/lib/protection.ts` exports lockIntent, intentFromReport, parseDraftText and verifyProtection. `scripts/check-protection.ts` is an executable example. Obtain conditions independently of the draft being checked. Fingerprints are deterministic content hashes, not wallet signatures or authenticated consent. Replacing both intent and draft can create a new matching pair; hashes do not protect a compromised client.

Results: MATCH, MISMATCH, UNSUPPORTED, EXPIRED, INVALID. Never convert unavailable data to a pass. This does not simulate balances, approvals, execution, MEV, gas or token behavior. It cannot bind a future wallet signing request: an independent signer must ensure the exact checked draft is the one submitted.
