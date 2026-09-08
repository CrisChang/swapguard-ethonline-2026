import { parseUnits, maxUint256 } from "viem";
import { CONTRACTS, SPENDERS, TOKENS } from "../src/lib/contracts";
import { referenceOutput } from "../src/lib/engine";
import type { AnalyzeRequest, Snapshot } from "../src/lib/types";

// Explicit, synthetic fixtures. Never used as fallback for live RPC failures.
export function demoSnapshot(req: AnalyzeRequest, now: number): Snapshot {
  const risky = req.scenario === "risky";
  const snapshot: Snapshot = {
    block: { number: "20000000", timestamp: now - 8 },
    routes: [],
    unavailableFees: [],
    feeds: {
      ETH: {
        name: "ETH / USD",
        address: CONTRACTS.ethUsd,
        answerRaw: "250000000000",
        decimals: 8,
        updatedAt: now - (req.scenario === "stale" ? 7200 : 120),
        roundId: "100",
        answeredInRound: "100",
        maxAgeSeconds: 3600,
      },
      USDC: {
        name: "USDC / USD",
        address: CONTRACTS.usdcUsd,
        answerRaw: "100000000",
        decimals: 8,
        updatedAt: now - 300,
        roundId: "200",
        answeredInRound: "200",
        maxAgeSeconds: 86400,
      },
    },
    wallet: {
      address: null,
      sample: true,
      balanceRaw: parseUnits(
        req.tokenIn === "WETH" ? "1000" : "5000000",
        TOKENS[req.tokenIn].decimals,
      ).toString(),
      allowances: SPENDERS.map((s) => ({
        ...s,
        amountRaw: risky ? maxUint256.toString() : "0",
      })),
    },
  };
  const reference = referenceOutput(req, snapshot);
  snapshot.routes = [500, 3000].map((fee) => ({
    fee,
    amountOutRaw: (
      (reference * BigInt(risky ? 9300 - fee / 100 : 10000 - fee / 100)) /
      10000n
    ).toString(),
    gasEstimate: fee === 500 ? "95000" : "110000",
    pool: "synthetic",
  }));
  return snapshot;
}
