/** Deterministic auto-retry reference agent. No LLM or user-wallet integration. */
import { parseUnits } from "viem";
export type AgentPolicy = "per-attempt" | "cumulative" | "swapguard-mcp";
export type Candidate = {
  attemptId: string;
  kind: "approval" | "swap";
  estimateUsdc: string;
  minimumUsdc: string;
  quoteUsdc: string;
  gasLimit: bigint;
};
export type ExecutionObservation = {
  status: "success" | "reverted";
  gasCostUsdc: string;
  outputUsdc: string;
};
export async function runReferenceAgent(options: {
  policy: AgentPolicy;
  budgetUsdc: string;
  minimumUsdc: string;
  candidates: Candidate[];
  deadlineMs: number;
  assess: (candidate: Candidate) => Promise<boolean>;
  execute: (candidate: Candidate) => Promise<ExecutionObservation>;
}) {
  let spent = 0n,
    swaps = 0;
  const events: { attemptId: string; decision: string }[] = [];
  const receipts: ExecutionObservation[] = [];
  let output: string | null = null;
  for (const candidate of options.candidates) {
    if (Date.now() >= options.deadlineMs || swaps >= 3) break;
    const floorOk =
      parseUnits(candidate.minimumUsdc, 6) >=
        parseUnits(options.minimumUsdc, 6) &&
      parseUnits(candidate.quoteUsdc, 6) >=
        parseUnits(candidate.minimumUsdc, 6);
    const fits =
      (options.policy === "cumulative" ? spent : 0n) +
        parseUnits(candidate.estimateUsdc, 6) <=
      parseUnits(options.budgetUsdc, 6);
    const ready =
      floorOk &&
      (options.policy === "swapguard-mcp"
        ? await options.assess(candidate)
        : fits);
    events.push({
      attemptId: candidate.attemptId,
      decision: ready ? "send-local" : "wait-no-more-opportunities",
    });
    if (!ready) break;
    const receipt = await options.execute(candidate);
    receipts.push(receipt);
    spent += parseUnits(receipt.gasCostUsdc, 6);
    if (candidate.kind === "swap") {
      swaps++;
      if (receipt.status === "success") {
        output = receipt.outputUsdc;
        break;
      }
    }
    if (candidate.kind === "approval" && receipt.status !== "success") break;
  }
  return { events, receipts, output, spent, swaps };
}
