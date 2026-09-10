import {
  applyAgentTool,
  emptyAgentState,
  type AgentResult,
  type ToolName,
} from "./agent-ledger";

export const AGENT_EXAMPLES = [
  {
    id: "recover",
    label: "Revert, then complete",
    detail: "An approval and failed swap stay charged when a retry completes.",
  },
  {
    id: "budget",
    label: "Retry exceeds remaining budget",
    detail:
      "1.4 already spent + 1.9 estimated for the retry does not fit a 3 USDC-equivalent budget.",
  },
  {
    id: "floor",
    label: "Agent proposes a weaker minimum",
    detail:
      "A new quote is not permission to lower the task's original 99.5 USDC floor.",
  },
  {
    id: "pending",
    label: "Agent tries a duplicate send",
    detail:
      "An unresolved operation blocks a second preparation; no invented receipt clears it.",
  },
  {
    id: "overrun",
    label: "Receipt costs exceed the estimate",
    detail:
      "Reported overruns remain visible, with negative remaining budget. This is not onchain enforcement.",
  },
] as const;
export type AgentExampleId = (typeof AGENT_EXAMPLES)[number]["id"];
export type AgentExampleRun = {
  scenario: AgentExampleId;
  calls: {
    tool: ToolName;
    input: Record<string, unknown>;
    output: AgentResult;
  }[];
  report: AgentResult;
};
/** Made-up round numbers for explanation, NOT calibrated market observations. */
export function runAgentExample(
  scenario: AgentExampleId,
  budget = "3",
): AgentExampleRun {
  const state = emptyAgentState();
  const now = 1_800_000_000_000;
  const calls: AgentExampleRun["calls"] = [];
  const taskId = "illustrative-agent-task";
  function call(tool: ToolName, input: Record<string, unknown>) {
    const output = applyAgentTool(state, tool, input, now);
    calls.push({ tool, input, output });
    return output;
  }
  function assess(
    attemptId: string,
    kind: "approval" | "swap",
    estimatedGasUsdc: string,
    minimum = "99.5",
  ) {
    return call("swapguard_assess_attempt", {
      taskId,
      attemptId,
      kind,
      amountWeth: "0.04",
      quotedOutputUsdc: "100",
      transactionMinimumUsdc: minimum,
      estimatedGasUsdc,
      quoteAtMs: now,
    });
  }
  function receipt(
    attemptId: string,
    status: "success" | "reverted",
    gasCostUsdc: string,
    outputUsdc = "0",
  ) {
    return call("swapguard_record_receipt", {
      taskId,
      attemptId,
      receiptId: `sample-${attemptId}`,
      status,
      gasCostUsdc,
      outputUsdc,
    });
  }
  let report = call("swapguard_open_task", {
    taskId,
    amountWeth: "0.04",
    initialQuoteUsdc: "100",
    minimumOutputUsdc: "99.5",
    gasBudgetUsdc: budget,
    maxAttempts: 3,
    expiresAtMs: now + 180000,
  });
  report = assess("approval-1", "approval", "0.4");
  if (report.decision !== "ADVISORY_READY") return { scenario, calls, report };
  report = receipt("approval-1", "success", "0.4");
  report = assess("swap-1", "swap", "1");
  if (report.decision !== "ADVISORY_READY") return { scenario, calls, report };
  if (scenario === "pending") {
    report = assess("swap-duplicate", "swap", "1");
    return { scenario, calls, report };
  }
  report = receipt("swap-1", "reverted", "1");
  if (scenario === "floor")
    report = assess("weaker-minimum", "swap", "0.5", "98");
  else {
    report = assess("swap-2", "swap", scenario === "budget" ? "1.9" : "0.5");
    if (report.decision === "ADVISORY_READY")
      report = receipt(
        "swap-2",
        "success",
        scenario === "overrun" ? "2.1" : scenario === "budget" ? "1.9" : "0.5",
        "99.8",
      );
  }
  return { scenario, calls, report };
}
