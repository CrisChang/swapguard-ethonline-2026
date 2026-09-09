import { decodeFunctionData, encodeFunctionData, type Hex } from "viem";
import { CONTRACTS, TOKENS } from "./contracts";
import {
  DEADLINE_ABI,
  exampleDraft,
  lockIntent,
  verifyProtection,
  type LockedIntent,
  type ProtectionDecision,
  type TransactionDraft,
} from "./protection";

export const REPLAY_TIME = Math.floor(
  Date.parse("2026-09-09T00:00:00Z") / 1000,
);
export const SAMPLE_SENDER = "0x1111111111111111111111111111111111111111";
export const OTHER_ADDRESS = "0x2222222222222222222222222222222222222222";
export const FIXTURE_VERSION = "protection-fixtures-v1";
export interface ProtectionFixture {
  id: string;
  title: string;
  explanation: string;
  kind: "control" | "fault" | "scope" | "freshness";
  expected: ProtectionDecision;
  expectedFailure?: string;
  intent: LockedIntent;
  draft: TransactionDraft;
  replayAt: number;
}
const baseline = lockIntent({
  source: "synthetic",
  tokenIn: "USDC",
  amountInRaw: "1000000000",
  quoteOutRaw: "400000000000000000",
  slippageBps: 50,
  sender: SAMPLE_SENDER,
  recipient: SAMPLE_SENDER,
  fee: 500,
  quoteBlock: "20000000",
  quotedAt: REPLAY_TIME - 5,
  quoteExpiresAt: REPLAY_TIME + 55,
  deadline: REPLAY_TIME + 295,
});
const original = exampleDraft(baseline);
const inner = decodeFunctionData({ abi: DEADLINE_ABI, data: original.data })
  .args[1][0];
const bundle = (calls: readonly Hex[]) => ({
  ...original,
  data: encodeFunctionData({
    abi: DEADLINE_ABI,
    functionName: "multicall",
    args: [BigInt(baseline.deadline), calls],
  }),
});
const reverse = lockIntent({
  ...baseline,
  tokenIn: "WETH",
  amountInRaw: "1000000000000000000",
  quoteOutRaw: "2500000001",
});
function fixture(
  id: string,
  title: string,
  explanation: string,
  kind: ProtectionFixture["kind"],
  expected: ProtectionDecision,
  draft: TransactionDraft,
  expectedFailure?: string,
  intent: LockedIntent = baseline,
  replayAt = REPLAY_TIME,
): ProtectionFixture {
  return {
    id,
    title,
    explanation,
    kind,
    expected,
    draft,
    expectedFailure,
    intent,
    replayAt,
  };
}

// Expectations are declared independently of the verifier. The dataset is not
// representative incident evidence; builders and checker still share ABI tools.
export const PROTECTION_FIXTURES: readonly ProtectionFixture[] = [
  fixture(
    "unchanged",
    "Unchanged transaction",
    "Control: 1,000 USDC, 0.400 WETH quote, 0.5% tolerance → 0.398 WETH minimum.",
    "control",
    "MATCH",
    original,
  ),
  fixture(
    "zero-floor",
    "Minimum protection removed",
    "Only amountOutMinimum is changed to zero. The displayed quote is unchanged; the transaction no longer preserves the user's floor.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, { amountOutMinimum: 0n }),
    "minimum",
  ),
  fixture(
    "weakened-floor",
    "Minimum quietly reduced",
    "Only the encoded floor is reduced from 0.398 to 0.360 WETH. The 0.038 WETH gap is weaker protection, not a realized loss.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, { amountOutMinimum: 360000000000000000n }),
    "minimum",
  ),
  fixture(
    "one-unit-low",
    "One base unit below the floor",
    "Boundary: a floor one wei below the confirmed amount must not pass due to display rounding.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, {
      amountOutMinimum: BigInt(baseline.minimumOutRaw) - 1n,
    }),
    "minimum",
  ),
  fixture(
    "stronger-floor",
    "Stronger minimum protection",
    "Control: a higher floor preserves the user's lower bound. It may reduce execution likelihood; this is not a readiness check.",
    "control",
    "MATCH",
    exampleDraft(baseline, { amountOutMinimum: 399000000000000000n }),
  ),
  fixture(
    "reverse-rounding",
    "Reverse pair & USDC rounding",
    "Control: WETH → USDC floors fractional base units once. Different token decimals must not cause a false mismatch.",
    "control",
    "MATCH",
    exampleDraft(reverse),
    undefined,
    reverse,
  ),
  fixture(
    "changed-recipient",
    "Different receive address",
    "Only the output recipient changes. A plausible quote says nothing about who will receive the tokens.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, { recipient: OTHER_ADDRESS }),
    "recipient",
  ),
  fixture(
    "tenfold-input",
    "Ten times the confirmed input",
    "Amount is encoded as 10,000 USDC instead of the confirmed 1,000 USDC.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, { amountIn: 10000000000n }),
    "amount",
  ),
  fixture(
    "wrong-token",
    "Different output token",
    "Token addresses, not a displayed ticker, define what is being bought.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, { tokenOut: TOKENS.USDC.address }),
    "tokenOut",
  ),
  fixture(
    "changed-fee",
    "Different quoted pool",
    "The fee tier changes from the confirmed 500 to 3000. A fresh independent quote and reconfirmation are needed for a route change.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, { fee: 3000 }),
    "fee",
  ),
  fixture(
    "expired-deadline",
    "Transaction deadline already passed",
    "The multicall deadline is earlier than the replay clock.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, {}, REPLAY_TIME - 1),
    "deadline",
  ),
  fixture(
    "extended-deadline",
    "Deadline extended without consent",
    "The transaction extends the user's confirmed validity window by an hour.",
    "fault",
    "MISMATCH",
    exampleDraft(baseline, {}, baseline.deadline + 3600),
    "deadline",
  ),
  fixture(
    "wrong-chain",
    "Wrong network",
    "The same calldata is attached to chainId 8453, outside the confirmed Ethereum transaction.",
    "fault",
    "MISMATCH",
    { ...original, chainId: 8453 },
    "chain",
  ),
  fixture(
    "wrong-router",
    "Wrong target contract",
    "A known method selector is insufficient: the target address also has to match the allowlisted router.",
    "fault",
    "MISMATCH",
    { ...original, to: OTHER_ADDRESS },
    "router",
  ),
  fixture(
    "wrong-sender",
    "Different sender",
    "The draft's from address differs from the independently confirmed sender. This does not authenticate either address.",
    "fault",
    "MISMATCH",
    { ...original, from: OTHER_ADDRESS },
    "sender",
  ),
  fixture(
    "native-value",
    "Unexpected ETH attached",
    "The supported flow uses ERC-20 WETH/USDC only and must not attach native ETH.",
    "fault",
    "MISMATCH",
    { ...original, value: "1" },
    "value",
  ),
  fixture(
    "no-deadline",
    "Bare swap without deadline wrapper",
    "SwapRouter02 exactInputSingle has no deadline field; a bare call is not our supported protected format.",
    "scope",
    "UNSUPPORTED",
    { ...original, data: inner },
  ),
  fixture(
    "extra-call",
    "Additional bundled operation",
    "Two inner calls are outside the allowlisted shape. The checker must not inspect the first one and ignore the second.",
    "scope",
    "UNSUPPORTED",
    bundle([inner, inner]),
  ),
  fixture(
    "nested-call",
    "Nested call bundle",
    "Nested multicalls are not recursively accepted in v1.",
    "scope",
    "UNSUPPORTED",
    bundle([original.data]),
  ),
  fixture(
    "trailing-bytes",
    "Trailing calldata",
    "Extra outer bytes are rejected even if a permissive ABI decoder can read a valid prefix.",
    "scope",
    "UNSUPPORTED",
    { ...original, data: `${original.data}00` },
  ),
  fixture(
    "partial-input",
    "Partial-input price limit",
    "A nonzero sqrtPriceLimitX96 introduces partial-input semantics outside this verifier's scope.",
    "scope",
    "UNSUPPORTED",
    exampleDraft(baseline, { sqrtPriceLimitX96: 1n }),
  ),
  fixture(
    "router-balance",
    "Router-balance input sentinel",
    "SwapRouter02 amountIn=0 means using router balance, not swapping zero. This flow is unsupported.",
    "scope",
    "UNSUPPORTED",
    exampleDraft(baseline, { amountIn: 0n }),
  ),
  fixture(
    "recipient-sentinel",
    "Special recipient sentinel",
    "Address 0x...01 has router-specific semantics. This verifier requires an explicit recipient instead of guessing.",
    "scope",
    "UNSUPPORTED",
    exampleDraft(baseline, {
      recipient: "0x0000000000000000000000000000000000000001",
    }),
  ),
  fixture(
    "malformed",
    "Truncated calldata",
    "Malformed input cannot produce a successful parameter match.",
    "scope",
    "INVALID",
    { ...original, data: "0x12" },
  ),
  fixture(
    "stale-lock",
    "Expired confirmation",
    "The exact original transaction must stop getting a MATCH once the locked quote's 60-second freshness window ends.",
    "freshness",
    "EXPIRED",
    original,
    undefined,
    baseline,
    baseline.quoteExpiresAt,
  ),
];

export function runFixture(f: ProtectionFixture) {
  const result = verifyProtection(f.intent, f.draft, f.replayAt);
  return {
    id: f.id,
    expected: f.expected,
    result,
    matchedExpectation:
      result.decision === f.expected &&
      (!f.expectedFailure ||
        result.checks.some((c) => c.id === f.expectedFailure && !c.matches)),
  };
}
export function fixtureDataset() {
  return {
    version: FIXTURE_VERSION,
    provenance:
      "Entirely synthetic, deliberately constructed cases. No historical incident, execution simulation, or real savings are claimed.",
    methodology:
      "Fixed replay clocks; normal controls and explicit mutations; expected outcomes declared independently of verifyProtection. ABI encoder is shared; unit tests also cover hand-encoded calldata. No representative sampling or independent audit.",
    router: {
      name: "SwapRouter02 (legacy)",
      address: CONTRACTS.router,
      shape: "multicall(uint256,bytes[]) with exactly one exactInputSingle",
    },
    fixtures: PROTECTION_FIXTURES,
  };
}
