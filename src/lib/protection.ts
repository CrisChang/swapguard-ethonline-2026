import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  keccak256,
  maxUint256,
  parseAbi,
  parseUnits,
  stringToHex,
  zeroAddress,
  type Hex,
} from "viem";
import { CONTRACTS, FEES, TOKENS, type TokenSymbol } from "./contracts";
import { minimumFromQuote } from "./protection-math";
import type { Report } from "./types";

// SwapRouter02 is legacy, not Universal Router. Its exactInputSingle has NO
// deadline. Require the deadline-bound multicall overload with exactly one call.
export const SWAP_ABI = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
]);
export const DEADLINE_ABI = parseAbi([
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);
export interface IntentInput {
  source: "synthetic" | "live";
  tokenIn: TokenSymbol;
  amountInRaw: string;
  quoteOutRaw: string;
  slippageBps: number;
  sender: string;
  recipient: string;
  fee: number;
  quoteBlock: string;
  quotedAt: number;
  quoteExpiresAt: number;
  deadline: number;
}
export interface LockedIntent extends IntentInput {
  version: "protection-v1";
  chainId: 1;
  router: string;
  minimumOutRaw: string;
  fingerprint: Hex;
}
export interface TransactionDraft {
  chainId: number;
  from: string;
  to: string;
  value: string;
  data: Hex;
}
export type ProtectionDecision =
  "MATCH" | "MISMATCH" | "UNSUPPORTED" | "EXPIRED" | "INVALID";
export interface ProtectionCheck {
  id: string;
  label: string;
  expected: string;
  actual: string;
  matches: boolean;
}
export interface ProtectionResult {
  decision: ProtectionDecision;
  reason: string;
  checks: ProtectionCheck[];
  intentFingerprint: string;
  transactionFingerprint?: string;
  checkedAt: number;
  minimumGapRaw?: string;
}
function uint(value: unknown): bigint {
  if (typeof value !== "string" || !/^(0|[1-9]\d{0,77})$/.test(value))
    throw new Error(
      "Amounts must be canonical decimal integer strings in base units.",
    );
  const n = BigInt(value);
  if (n > maxUint256) throw new Error("Amount exceeds uint256.");
  return n;
}
function address(value: unknown): string {
  if (typeof value !== "string" || !isAddress(value, { strict: true }))
    throw new Error("Enter a valid Ethereum address.");
  return getAddress(value);
}
export function userAddress(value: unknown): string {
  const a = address(value);
  if (
    [
      zeroAddress,
      "0x0000000000000000000000000000000000000001",
      "0x0000000000000000000000000000000000000002",
      CONTRACTS.router.toLowerCase(),
    ].includes(a.toLowerCase())
  )
    throw new Error(
      "Use a real sender/recipient address, not zero, router or a router sentinel.",
    );
  return a;
}
const fingerprint = (value: unknown) =>
  keccak256(stringToHex(JSON.stringify(value)));

/** This local commitment is a content hash, NOT a signature or proof of consent. */
export function lockIntent(input: IntentInput): Readonly<LockedIntent> {
  if (!["live", "synthetic"].includes(input.source))
    throw new Error("Unknown quote provenance.");
  if (input.tokenIn !== "WETH" && input.tokenIn !== "USDC")
    throw new Error("Unsupported pair.");
  if (uint(input.amountInRaw) <= 0n) throw new Error("Input must be positive.");
  const minimum = minimumFromQuote(uint(input.quoteOutRaw), input.slippageBps);
  if (minimum <= 0n)
    throw new Error("Minimum rounds to zero; a meaningful floor is required.");
  if (!(FEES as readonly number[]).includes(input.fee))
    throw new Error("Unsupported pool fee.");
  if (uint(input.quoteBlock) <= 0n) throw new Error("Invalid quote block.");
  for (const t of [input.quotedAt, input.quoteExpiresAt, input.deadline])
    if (!Number.isSafeInteger(t) || t <= 0) throw new Error("Invalid time.");
  if (
    input.quoteExpiresAt <= input.quotedAt ||
    input.quoteExpiresAt - input.quotedAt > 60 ||
    input.deadline <= input.quotedAt ||
    input.deadline - input.quotedAt > 300
  )
    throw new Error(
      "Quote validity must be ≤60s; transaction deadline must be ≤5 minutes from quote.",
    );
  // Explicit canonical fields: caller-supplied extras cannot replace the router or floor.
  const fields = {
    version: "protection-v1" as const,
    chainId: 1 as const,
    router: CONTRACTS.router,
    source: input.source,
    tokenIn: input.tokenIn,
    amountInRaw: input.amountInRaw,
    quoteOutRaw: input.quoteOutRaw,
    slippageBps: input.slippageBps,
    minimumOutRaw: minimum.toString(),
    sender: userAddress(input.sender),
    recipient: userAddress(input.recipient),
    fee: input.fee,
    quoteBlock: input.quoteBlock,
    quotedAt: input.quotedAt,
    quoteExpiresAt: input.quoteExpiresAt,
    deadline: input.deadline,
  };
  return Object.freeze({ ...fields, fingerprint: fingerprint(fields) });
}
export function intentFromReport(
  report: Report,
  sender: string,
  recipient: string,
  now: number,
): Readonly<LockedIntent> {
  const quotedAt = Math.floor(Date.parse(report.createdAt) / 1000);
  const quoteExpiresAt = Math.floor(Date.parse(report.expiresAt) / 1000);
  if (now >= quoteExpiresAt || now < quotedAt || report.decision === "blocked")
    throw new Error(
      "Refresh the quote and resolve its blocking flags before locking conditions.",
    );
  if (
    report.checks.some(
      (c) => ["block", "oracle"].includes(c.id) && c.status !== "pass",
    )
  )
    throw new Error("A fresh quote and valid reference are required.");
  return lockIntent({
    source: report.request.mode === "demo" ? "synthetic" : "live",
    tokenIn: report.request.tokenIn,
    amountInRaw: parseUnits(
      report.request.amount,
      TOKENS[report.request.tokenIn].decimals,
    ).toString(),
    quoteOutRaw: report.quote.amountOutRaw,
    slippageBps: report.request.slippageBps,
    sender,
    recipient,
    fee: report.quote.selectedFee,
    quoteBlock: report.snapshot.block.number,
    quotedAt,
    quoteExpiresAt,
    deadline: quotedAt + 300,
  });
}

/** Imported transaction only. Never import an intent from the same JSON payload. */
export function parseDraft(input: unknown): TransactionDraft {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Expected a transaction JSON object.");
  const v = input as Record<string, unknown>;
  const keys = ["chainId", "from", "to", "value", "data"];
  if (
    Object.keys(v).length !== keys.length ||
    !keys.every((k) => Object.hasOwn(v, k))
  )
    throw new Error(
      "Only chainId, from, to, value and data are accepted. Do not include or overwrite an intent.",
    );
  if (!Number.isSafeInteger(v.chainId) || Number(v.chainId) <= 0)
    throw new Error("chainId must be a positive integer.");
  uint(v.value);
  if (
    typeof v.data !== "string" ||
    v.data.length > 8194 ||
    !/^0x(?:[0-9a-fA-F]{2}){4,}$/.test(v.data)
  )
    throw new Error("Calldata must be complete hex bytes, 4–4096 bytes long.");
  return {
    chainId: v.chainId as number,
    from: address(v.from),
    to: address(v.to),
    value: v.value as string,
    data: v.data.toLowerCase() as Hex,
  };
}
export function parseDraftText(text: string): TransactionDraft {
  if (text.length > 12000)
    throw new Error("Transaction JSON is too large (12KB limit).");
  return parseDraft(JSON.parse(text));
}
type SwapParams = {
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  fee: number;
  recipient: `0x${string}`;
  amountIn: bigint;
  amountOutMinimum: bigint;
  sqrtPriceLimitX96: bigint;
};
/** Fixture encoder only: produces unsigned test data, never sends it. */
export function exampleDraft(
  intent: LockedIntent,
  changes: Partial<SwapParams> = {},
  deadline = intent.deadline,
): TransactionDraft {
  const out = intent.tokenIn === "WETH" ? "USDC" : "WETH";
  const inner = encodeFunctionData({
    abi: SWAP_ABI,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn: TOKENS[intent.tokenIn].address,
        tokenOut: TOKENS[out].address,
        fee: intent.fee,
        recipient: intent.recipient as Hex,
        amountIn: BigInt(intent.amountInRaw),
        amountOutMinimum: BigInt(intent.minimumOutRaw),
        sqrtPriceLimitX96: 0n,
        ...changes,
      },
    ],
  });
  return {
    chainId: 1,
    from: intent.sender,
    to: intent.router,
    value: "0",
    data: encodeFunctionData({
      abi: DEADLINE_ABI,
      functionName: "multicall",
      args: [BigInt(deadline), [inner]],
    }),
  };
}

/** Independent parameter comparison. Does not simulate execution or prove safety. */
export function verifyProtection(
  intent: LockedIntent,
  input: unknown,
  now: number,
): ProtectionResult {
  const base = {
    checks: [] as ProtectionCheck[],
    intentFingerprint: intent?.fingerprint ?? "",
    checkedAt: now,
  };
  try {
    if (!Number.isSafeInteger(now) || now <= 0)
      throw new Error("Invalid verification time.");
    const canonical = lockIntent(intent);
    if (
      intent.version !== canonical.version ||
      intent.chainId !== 1 ||
      intent.router !== canonical.router ||
      intent.minimumOutRaw !== canonical.minimumOutRaw ||
      intent.fingerprint !== canonical.fingerprint
    )
      throw new Error(
        "The locked conditions were modified. Confirm them again independently.",
      );
  } catch (e) {
    return {
      ...base,
      decision: "INVALID",
      reason: e instanceof Error ? e.message : "Invalid intent.",
    };
  }
  if (now >= intent.quoteExpiresAt || now < intent.quotedAt)
    return {
      ...base,
      decision: "EXPIRED",
      reason:
        "The locked quote is no longer current. Refresh and reconfirm; no match verdict is retained.",
    };
  let tx: TransactionDraft;
  try {
    tx = parseDraft(input);
  } catch (e) {
    return {
      ...base,
      decision: "INVALID",
      reason: e instanceof Error ? e.message : "Invalid draft.",
    };
  }
  const result = { ...base, transactionFingerprint: fingerprint(tx) };
  const check = (
    id: string,
    label: string,
    expected: string,
    actual: string,
    matches = expected.toLowerCase() === actual.toLowerCase(),
  ) => result.checks.push({ id, label, expected, actual, matches });
  check("chain", "Chain", "1", String(tx.chainId));
  check("router", "Router", intent.router, tx.to);
  check("sender", "Sender", intent.sender, tx.from);
  check("value", "Native ETH attached", "0", tx.value);
  if (result.checks.some((c) => !c.matches))
    return {
      ...result,
      decision: "MISMATCH",
      reason:
        "Transaction envelope differs from the confirmed conditions. Its contract semantics were not assumed.",
    };
  let swap: SwapParams, deadline: bigint;
  try {
    const outer = decodeFunctionData({ abi: DEADLINE_ABI, data: tx.data });
    const [t, calls] = outer.args;
    if (calls.length !== 1)
      throw new Error(
        "Exactly one inner swap is required; extra/nested operations are not inspected.",
      );
    if (
      encodeFunctionData({
        abi: DEADLINE_ABI,
        functionName: "multicall",
        args: [t, calls],
      }).toLowerCase() !== tx.data
    )
      throw new Error(
        "Non-canonical or trailing outer calldata is unsupported.",
      );
    const inner = decodeFunctionData({ abi: SWAP_ABI, data: calls[0] });
    swap = inner.args[0];
    deadline = t;
    if (
      encodeFunctionData({
        abi: SWAP_ABI,
        functionName: "exactInputSingle",
        args: [swap],
      }).toLowerCase() !== calls[0].toLowerCase()
    )
      throw new Error(
        "Non-canonical or trailing inner calldata is unsupported.",
      );
    if (swap.sqrtPriceLimitX96 !== 0n)
      throw new Error(
        "Partial-input price limits are outside this verifier's scope.",
      );
    if (swap.amountIn === 0n)
      throw new Error("Router-balance amountIn=0 semantics are unsupported.");
    if (
      [
        zeroAddress,
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
        intent.router.toLowerCase(),
      ].includes(swap.recipient.toLowerCase())
    )
      throw new Error("Special router recipient semantics are unsupported.");
  } catch (e) {
    return {
      ...result,
      decision: "UNSUPPORTED",
      reason:
        e instanceof Error && e.message.length < 180
          ? e.message
          : "Only canonical SwapRouter02 deadline-bound multicall with one exactInputSingle is supported. No pass is issued.",
    };
  }
  const out = intent.tokenIn === "WETH" ? "USDC" : "WETH";
  check("tokenIn", "Input token", TOKENS[intent.tokenIn].address, swap.tokenIn);
  check("tokenOut", "Output token", TOKENS[out].address, swap.tokenOut);
  check("fee", "Pool fee", String(intent.fee), String(swap.fee));
  check(
    "amount",
    "Input amount (base units)",
    intent.amountInRaw,
    swap.amountIn.toString(),
  );
  check("recipient", "Receive address", intent.recipient, swap.recipient);
  const floor = BigInt(intent.minimumOutRaw);
  check(
    "minimum",
    "Minimum output (base units)",
    `≥ ${floor}`,
    swap.amountOutMinimum.toString(),
    swap.amountOutMinimum >= floor,
  );
  check(
    "deadline",
    "Deadline (Unix seconds)",
    `${now} … ${intent.deadline}`,
    deadline.toString(),
    deadline >= BigInt(now) && deadline <= BigInt(intent.deadline),
  );
  const mismatch = result.checks.some((c) => !c.matches);
  return {
    ...result,
    decision: mismatch ? "MISMATCH" : "MATCH",
    minimumGapRaw: (swap.amountOutMinimum < floor
      ? floor - swap.amountOutMinimum
      : 0n
    ).toString(),
    reason: mismatch
      ? "The encoded transaction does not preserve all confirmed conditions. No transaction was sent."
      : "The supported parameters match. This does not prove execution readiness, price fairness, authorization, or safety. A stronger floor may still make a swap revert.",
  };
}
