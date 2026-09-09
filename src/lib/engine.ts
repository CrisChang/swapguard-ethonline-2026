import { formatUnits, parseUnits } from "viem";
import { TOKENS } from "./contracts";
import type { AnalyzeRequest, Check, Feed, Report, Snapshot } from "./types";
import { minimumFromQuote } from "./protection-math";

export const POLICY = {
  quoteTtlSeconds: 60,
  maxBlockAgeSeconds: 120,
  clockSkewSeconds: 30,
  warnDeviationBps: 50,
  blockDeviationBps: 150,
  warnSlippageBps: 100,
  blockSlippageBps: 300,
} as const;
const abs = (n: bigint) => (n < 0n ? -n : n);
export function validFeed(feed: Feed, now: number) {
  return (
    Number.isInteger(feed.decimals) &&
    feed.decimals >= 0 &&
    feed.decimals <= 18 &&
    BigInt(feed.answerRaw) > 0n &&
    BigInt(feed.roundId) > 0n &&
    BigInt(feed.answeredInRound) >= BigInt(feed.roundId) &&
    feed.updatedAt > 0 &&
    feed.updatedAt <= now + POLICY.clockSkewSeconds &&
    now - feed.updatedAt <= feed.maxAgeSeconds
  );
}
export function referenceOutput(
  req: AnalyzeRequest,
  snapshot: Snapshot,
): bigint {
  const price = (f: Feed) =>
    BigInt(f.answerRaw) * 10n ** BigInt(18 - f.decimals);
  const eth = price(snapshot.feeds.ETH),
    usd = price(snapshot.feeds.USDC);
  const tokenOut = req.tokenIn === "WETH" ? "USDC" : "WETH";
  const inPrice = req.tokenIn === "WETH" ? eth : usd;
  const outPrice = req.tokenIn === "WETH" ? usd : eth;
  return (
    (parseUnits(req.amount, TOKENS[req.tokenIn].decimals) *
      inPrice *
      10n ** BigInt(TOKENS[tokenOut].decimals)) /
    (10n ** BigInt(TOKENS[req.tokenIn].decimals) * outPrice)
  );
}
export function analyze(
  req: AnalyzeRequest,
  snapshot: Snapshot,
  now = Math.floor(Date.now() / 1000),
): Report {
  const tokenOut = req.tokenIn === "WETH" ? "USDC" : "WETH";
  const output = TOKENS[tokenOut],
    input = TOKENS[req.tokenIn];
  const amountIn = parseUnits(req.amount, input.decimals);
  const routes = snapshot.routes.filter((r) => BigInt(r.amountOutRaw) > 0n);
  if (!routes.length)
    throw new Error("No usable quote. No sample data was substituted.");
  const best = routes.reduce((a, b) =>
    BigInt(a.amountOutRaw) >= BigInt(b.amountOutRaw) ? a : b,
  );
  const quoted = BigInt(best.amountOutRaw);
  const minimum = minimumFromQuote(quoted, req.slippageBps);
  const checks: Check[] = [];
  const push = (
    id: string,
    title: string,
    status: Check["status"],
    detail: string,
  ) => checks.push({ id, title, status, detail });
  const age = now - snapshot.block.timestamp;
  const fresh =
    age >= -POLICY.clockSkewSeconds && age <= POLICY.maxBlockAgeSeconds;
  push(
    "block",
    "Snapshot freshness",
    fresh ? "pass" : "block",
    fresh
      ? `All reads pinned to ${req.mode === "demo" ? "sample" : "Ethereum"} block ${snapshot.block.number}.`
      : `Block is ${age}s old or ahead of the clock; policy allows ${POLICY.maxBlockAgeSeconds}s.`,
  );
  const feedsValid =
    validFeed(snapshot.feeds.ETH, now) && validFeed(snapshot.feeds.USDC, now);
  push(
    "oracle",
    "Independent reference",
    feedsValid ? "pass" : "block",
    feedsValid
      ? "ETH/USD and USDC/USD rounds pass positive-price, round and age checks. WETH is valued as ETH."
      : "One or more oracle rounds are stale, incomplete, future-dated or non-positive. Price comparison is unavailable.",
  );
  const reference = feedsValid ? referenceOutput(req, snapshot) : null;
  const deviation =
    reference && reference > 0n
      ? Number((abs(quoted - reference) * 10000n) / reference)
      : null;
  push(
    "deviation",
    "Quote vs. reference",
    deviation === null
      ? "unknown"
      : deviation >= POLICY.blockDeviationBps
        ? "block"
        : deviation >= POLICY.warnDeviationBps
          ? "warn"
          : "pass",
    deviation === null
      ? "Cannot compare this quote against a valid reference."
      : `${(deviation / 100).toFixed(2)}% absolute deviation. This includes pool fees and market/oracle differences; it is not a pure price-impact or MEV estimate.`,
  );
  push(
    "slippage",
    "Slippage exposure",
    req.slippageBps >= POLICY.blockSlippageBps
      ? "block"
      : req.slippageBps >= POLICY.warnSlippageBps
        ? "warn"
        : "pass",
    `${(req.slippageBps / 100).toFixed(2)}% tolerance; minimum output ${formatUnits(minimum, output.decimals)} ${tokenOut}. Rounded down in token base units; gas is excluded.`,
  );
  if (minimum <= 0n)
    push(
      "dust",
      "Minimum output",
      "block",
      "Minimum output rounds to zero. Increase the input amount.",
    );
  if (snapshot.unavailableFees.length)
    push(
      "coverage",
      "Route coverage",
      "warn",
      `Fee tiers ${snapshot.unavailableFees.map((f) => `${f / 10000}%`).join(", ")} unavailable. Best quote is only among successful single-pool quotes, not all market routes.`,
    );
  const wallet = snapshot.wallet;
  if (!wallet) {
    push(
      "balance",
      "Wallet balance",
      "unknown",
      "No wallet address supplied. This is a market-only analysis, not a wallet readiness check.",
    );
    push(
      "allowance",
      "Token allowances",
      "unknown",
      "Add a public wallet address to inspect ERC-20 allowances to SwapRouter02 and Permit2. No wallet connection is needed.",
    );
  } else {
    push(
      "balance",
      "Wallet balance",
      wallet.balanceRaw === null
        ? "unknown"
        : BigInt(wallet.balanceRaw) < amountIn
          ? "block"
          : "pass",
      wallet.balanceRaw === null
        ? "Balance RPC read failed; no readiness assumption is made."
        : `${wallet.sample ? "Synthetic wallet" : "Wallet"} holds ${formatUnits(BigInt(wallet.balanceRaw), input.decimals)} ${input.symbol}. Native ETH for gas is not checked.`,
    );
    const missing =
      wallet.allowances.some((a) => a.amountRaw === null) ||
      wallet.allowances.length !== 2;
    const exposed = wallet.allowances.filter(
      (a) => a.amountRaw !== null && BigInt(a.amountRaw) > amountIn * 10n,
    );
    push(
      "allowance",
      "Token allowances",
      missing ? "unknown" : exposed.length ? "warn" : "pass",
      missing
        ? "At least one allowance read failed. Permit2 signatures and per-spender permissions are not inspected."
        : exposed.length
          ? `${exposed.map((a) => a.name).join(", ")} can spend more than 10× this input amount. Consider reviewing or reducing allowance in a trusted wallet; SwapGuard never requests approval.`
          : "No inspected ERC-20 allowance exceeds 10× this input. Zero allowance is not execution-ready. Other spenders and Permit2 permissions are outside scope.",
    );
  }
  const decision = checks.some((c) => c.status === "block")
    ? "blocked"
    : checks.some((c) => c.status === "warn" || c.status === "unknown")
      ? "review"
      : "clear";
  return {
    version: "0.1.0",
    request: req,
    chainId: 1,
    tokenOut,
    createdAt: new Date(now * 1000).toISOString(),
    expiresAt: new Date((now + POLICY.quoteTtlSeconds) * 1000).toISOString(),
    decision,
    checks,
    snapshot,
    quote: {
      amountInRaw: amountIn.toString(),
      amountOutRaw: quoted.toString(),
      amountOut: formatUnits(quoted, output.decimals),
      minimumOutRaw: minimum.toString(),
      minimumOut: formatUnits(minimum, output.decimals),
      referenceOut:
        reference === null ? null : formatUnits(reference, output.decimals),
      deviationBps: deviation,
      selectedFee: best.fee,
      gasEstimate: best.gasEstimate,
      pool: best.pool,
    },
    limitations: [
      "Read-only preflight, not an execution simulation, token audit or guarantee of safety. No signatures or transactions are requested.",
      "Ethereum mainnet WETH/USDC only; compares Uniswap v3 single pools at 0.05% and 0.30%. Not full Uniswap smart routing.",
      "Price deviation includes swap fees and oracle timing; it does not isolate price impact or detect sandwich attacks.",
      "Only ERC-20 allowances to SwapRouter02 and Permit2 are inspected. Permit2 per-spender allowances, signatures, other spenders and native gas balance are not checked.",
      "An exported report is a reproducible observation, not a signed attestation. Wallet addresses are sent to the RPC provider if supplied.",
    ],
  };
}
