import { expect, it } from "vitest";
import proof from "../experiments/results/task-loop-25938600.json";
import {
  DEFAULT_CONFIG,
  createSession,
  exportSession,
  nextAction,
  reconcile,
} from "../src/lib/task-session";

it("reconciles all checked-in actual fork receipts into the recorded task result", () => {
  expect(proof.localChainId).toBe(31337);
  expect(proof.operations.map((o) => o.status)).toEqual([
    "success",
    "reverted",
    "success",
  ]);
  let s = createSession(DEFAULT_CONFIG, "fork-receipt-proof");
  for (const op of proof.operations) {
    s = nextAction(s);
    expect(s.pending?.id).toBe(op.id);
    expect(s.pending?.kind).toBe(op.kind);
    if (op.kind !== "approval" && op.kind !== "swap")
      throw new Error("Invalid kind");
    if (op.status !== "success" && op.status !== "reverted")
      throw new Error("Invalid status");
    s = reconcile(s, {
      id: op.id,
      kind: op.kind,
      status: op.status,
      gasUsed: BigInt(op.gasUsed),
      gasPriceWei: BigInt(op.gasPriceWei),
      output: BigInt(op.actualOutput),
      evidence: "local-fork",
    });
  }
  expect(exportSession(s)).toEqual(proof.session);
  expect(s.approvalAttempts).toBe(1);
  expect(s.attempts).toBe(2);
  expect(s.spent).toBe(807383n);
});

it("retains deliberate-revert provenance, original floor and successful balance delta", () => {
  expect(proof.kind).toContain("NOT_MAINNET");
  expect(proof.funding.excludedFromTask).toBe(true);
  const failed = proof.operations[1],
    success = proof.operations[2];
  expect(failed.actualOutput).toBe("0");
  expect(BigInt(failed.encodedFloor!)).toBe(
    BigInt(proof.session.initialQuoteRaw) + 1n,
  );
  expect(success.encodedFloor).toBe(proof.session.task.minimumOutput);
  expect(success.actualOutput).toBe(proof.session.result.outputRaw);
  expect(proof.limitations.join(" ")).toContain("deliberately induced");
  expect(failed.verification?.decision).toBe("MATCH");
  expect(success.verification?.decision).toBe("MATCH");
});
