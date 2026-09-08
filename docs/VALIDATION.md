# Validation record — v0.1

2026-09-08. These are development observations, not an audit or a promise of current prices.

## Deterministic checks

- `npm test`: **66 / 66 passed**. Exact integer math, both token directions, USDC depeg reference, threshold boundaries, oracle freshness/round validity, unknown wallet reads, high allowances, partial/no routes, input rejection, API error isolation and concurrency behavior.
- `npm run build`: TypeScript and Vite build passed.
- `npm run test:e2e`: **7 / 7 deterministic browser tests passed**. Desktop and 390px mobile layout, explicit sample labels, risky/stale scenarios, invalidation after editing, live-failure behavior, request validation, expiry and JSON export.
- Desktop and mobile screenshots visually inspected: no clipped controls or horizontal overflow; sample labels and read-only boundaries visible.
- `wrangler deploy --dry-run`: Worker bundle and static assets built successfully. **Not deployed.** Existing CLI authentication required reauthentication.

Headless Chrome initially could not launch inside the filesystem sandbox; the browser suite then passed using an approved isolated temporary profile. This is an environment issue, not a browser-test pass from the failed launch.

## Read-only mainnet smoke observation

`npm run check:live` succeeded at **2026-09-08 06:10:26 UTC**:

| Field                      | Observation                                      |
| -------------------------- | ------------------------------------------------ |
| Network                    | Ethereum mainnet, chain ID 1                     |
| Block                      | 25930766                                         |
| Input                      | 0.1 WETH                                         |
| 0.05% pool output          | 247.1894 USDC                                    |
| 0.30% pool output          | 246.984902 USDC                                  |
| Selected pool              | `0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640`     |
| Minimum at 0.50% tolerance | 245.953453 USDC                                  |
| Feed decimals              | ETH/USD: 8; USDC/USD: 8                          |
| Feed validation            | Both passed the local policy at observation time |
| Wallet                     | Not supplied; balance and allowance UNKNOWN      |
| Decision                   | REVIEW, correctly not “all checks passed”        |

Amounts above are historical validation evidence and must never be used as current quotes. No transaction hash exists because no transaction was sent.

Separate `LIVE_SMOKE=1` browser checks: **2 / 2 passed**, using real API calls at block **25930804**. WETH → USDC returned 247.158808 USDC for 0.1 WETH; the reverse returned 0.101048216310103637 WETH for 250 USDC. Token balance and both allowances were read successfully for neutral public probe address `0x0000000000000000000000000000000000000001` (not the participant's wallet). A live-mode screenshot was also visually inspected. These opt-in tests are not part of the deterministic default suite.

`npm audit --omit=dev` reported zero known production dependency vulnerabilities at the time of this check. This says nothing about unidentified vulnerabilities or the correctness of the application.

## Remaining release checks

- Public GitHub repository and deploy URL, with anonymous-access checks.
- Production RPC reliability, rate limits and privacy review.
- Human review of AI-assisted code and demo narration.
- Sponsor feedback form and final ETHGlobal submission.

No statement here implies those remaining checks are complete.
