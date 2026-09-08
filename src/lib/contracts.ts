import { parseAbi } from "viem";

// Ethereum mainnet only. See docs/SOURCES.md for upstream deployment registries.
export const TOKENS = {
  WETH: {
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  },
} as const;
export type TokenSymbol = keyof typeof TOKENS;
export const CONTRACTS = {
  quoter: "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",
  factory: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
  router: "0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
  ethUsd: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419",
  usdcUsd: "0x8fFfFfd4AfB6115b954Bd326cbe7B4BA576818f6",
} as const;
export const FEES = [500, 3000] as const;
export const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)",
]);
export const FEED_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)",
]);
export const FACTORY_ABI = parseAbi([
  "function getPool(address,address,uint24) view returns (address)",
]);
export const SPENDERS = [
  { name: "SwapRouter02 (legacy v3)", address: CONTRACTS.router },
  { name: "Permit2", address: CONTRACTS.permit2 },
] as const;
