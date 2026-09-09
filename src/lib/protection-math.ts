import { maxUint256 } from "viem";

/** Output-relative tolerance, floored once in output-token base units. */
export function minimumFromQuote(quote: bigint, slippageBps: number): bigint {
  if (quote <= 0n || quote > maxUint256)
    throw new Error("Invalid output quote.");
  if (!Number.isInteger(slippageBps) || slippageBps < 1 || slippageBps > 1000)
    throw new Error("Slippage must be 0.01%–10%.");
  return (quote * BigInt(10000 - slippageBps)) / 10000n;
}
