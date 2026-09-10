# Protocol sources and attribution

References reviewed during the 2026-09-08 build. Deployment addresses must be rechecked before expanding chains or adding execution.

- [Uniswap v3 Ethereum deployment registry](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments): Factory, QuoterV2, legacy SwapRouter02, Permit2, WETH/USDC addresses. The registry distinguishes legacy SwapRouter02 from the current recommended Universal Router. This app does not execute through either router.
- [Uniswap v3 quoting guide](https://developers.uniswap.org/docs/sdks/v3/guides/swapping/quoting): read-only quote simulation and amount-out use.
- [QuoterV2 interface](https://github.com/Uniswap/v3-periphery/blob/main/contracts/interfaces/IQuoterV2.sol): tuple input and returned values. Our minimal ABI uses the public interface; no implementation was copied.
- [Chainlink ETH/USD feed](https://data.chain.link/feeds/ethereum/mainnet/eth-usd): Ethereum reference feed.
- [Chainlink USDC/USD feed](https://data.chain.link/feeds/ethereum/mainnet/usdc-usd): Ethereum stablecoin reference feed.
- [Chainlink Data Feeds API reference](https://docs.chain.link/data-feeds/api-reference): `decimals` and `latestRoundData` fields.
- [viem readContract](https://viem.sh/docs/contract/readContract) and [simulateContract](https://viem.sh/docs/contract/simulateContract): server-side read-only calls.
- [ETHOnline 2026 prize criteria](https://ethglobal.com/events/ethonline2026/prizes): partner-specific integration and feedback requirements.
- [ETHOnline 2026 event information](https://ethglobal.com/events/ethonline2026/info/details): project, video and submission guidelines. Recheck before final submission.
- [Cloudflare Worker rate-limit binding](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/): checked 2026-09-09. Native binding configuration, local-to-location counters and eventual consistency; this implementation uses a shared anonymous route quota, not a strict global budget.

## Mainnet registry used by this app

Parameter-verifier references reviewed on 2026-09-09:

- [SwapRouter02 IV3SwapRouter](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/interfaces/IV3SwapRouter.sol): inner tuple without deadline; amountIn=0 has router-balance semantics. Upstream is archived; this is legacy coverage.
- [MulticallExtended](https://github.com/Uniswap/swap-router-contracts/blob/main/contracts/base/MulticallExtended.sol): deadline-bound overload. This verifier permits one inner operation, not all supported compositions.
- [Universal Router commands](https://developers.uniswap.org/docs/protocols/universal-router/concepts/commands): a different format, unsupported here.

Our output-relative minimum formula is a local convention, not a claim of exact SDK formula parity. See [PROTECTION.md](PROTECTION.md).

| Contract              | Address                                      |
| --------------------- | -------------------------------------------- |
| WETH                  | `0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2` |
| USDC                  | `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` |
| Uniswap v3 Factory    | `0x1F98431c8aD98523631AE4a59f267346ea31F984` |
| QuoterV2              | `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` |
| SwapRouter02 (legacy) | `0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45` |
| Permit2               | `0x000000000022D473030F116dDEE9F6B43aC78BA3` |
| Chainlink ETH/USD     | `0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419` |
| Chainlink USDC/USD    | `0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6` |

Oracle max ages of 1 hour / 24 hours are SwapGuard policy choices, not claims about official heartbeat or deviation settings. Onchain decimals and round values are read from contracts rather than hardcoded. The 2026-09-08 smoke test returned 8 decimals for both feeds.

Third-party package versions and integrity hashes are in `package-lock.json`. UI icons are from `lucide-react`; DM Sans / Manrope Latin fonts are bundled from `@fontsource/dm-sans` and `@fontsource/manrope` with system fallbacks. Their original license notices are distributed in `public/FONT_LICENSES.txt`. The shield SVG is a new code-authored asset. No old project code, API secrets, screenshots or deployments were copied into this project.

## Agent extension references — 2026-09-10

- [Official MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk): v2 server/client APIs and stdio transport. The locally installed `@modelcontextprotocol/server` and `@modelcontextprotocol/client` are pinned to 2.0.0; Zod schemas are pinned to 4.6.1. Dependency licenses and integrity hashes remain in the lockfile.
- [MCP architecture](https://modelcontextprotocol.io/docs/learn/architecture): separation of tool integration from model behavior. Protocol availability is not a safety guarantee or proof of Agent adoption.
- [Uniswap Agent tools](https://github.com/Uniswap/uniswap-ai): existing swap, DCA and rebalancing integrations. Task cost accounting is positioned as complementary; no superiority or missing-competitor-capability claim was established.
