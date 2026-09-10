import type { AgentResult } from "./agent-ledger";

/** Execution of a check and completion of a swap are different states. */
export function presentAgentResult(report?: AgentResult) {
  if (!report)
    return {
      title: "What did the whole task cost?",
      output: "Not run yet",
      net: "Not run yet",
      explanation:
        "Run a scenario to inspect the original terms and cumulative costs.",
    };
  const output =
    report.grossOutputUsdc === null
      ? "No completed swap"
      : report.grossOutputUsdc;
  const net =
    report.netOutputAfterGasUsdc === null
      ? "Not calculated"
      : report.netOutputAfterGasUsdc;
  if (report.status === "constraint_breach")
    return {
      title: "Check complete: reported limits exceeded",
      output,
      net,
      explanation:
        "The example ran successfully. Reported costs or output violated the task terms; the ledger keeps the violation visible. This is not onchain enforcement.",
    };
  if (report.status === "completed_reported")
    return {
      title: "Check complete: example swap completed",
      output,
      net,
      explanation:
        "The constructed successful receipt and all earlier costs are recorded. No real transaction was sent.",
    };
  if (report.decision === "REJECT")
    return {
      title: "Check complete: retry does not meet the original terms",
      output,
      net,
      explanation:
        "Expected advisory rejection, not a system error. The retry is not recommended; without a completed swap there is no output to deduct gas from.",
    };
  return {
    title:
      report.decision === "STOP"
        ? "Check complete: task should stop"
        : "Check complete: wait before retrying",
    output,
    net,
    explanation:
      "Expected check result, not a system error. No completed swap is recorded, so output after gas is not calculated. Previously spent gas remains in the ledger.",
  };
}
