import { describe, expect, it } from "vitest";
import { decodeFunctionData, parseAbi } from "viem";
import {
  DEFAULT_CONFIG,
  SCENARIOS,
  createSession,
  exportSession,
  inspectSession,
  nextAction,
  observation,
  persistSession,
  reconcile,
  restoreSession,
  settleSimulation,
  simulatedReceipt,
  stopSession,
  type Config,
  type Session,
} from "../src/lib/task-session";

const make = (config: Partial<Config> = {}) =>
  createSession({ ...DEFAULT_CONFIG, ...config }, "unit-task");
function run(s = make()) {
  for (
    let i = 0;
    i < 20 && ["ready", "awaiting_receipt"].includes(s.phase);
    i++
  )
    s = s.phase === "ready" ? nextAction(s) : settleSimulation(s);
  return s;
}
const swapReady = () => nextAction(settleSimulation(nextAction(make())));
describe("task session", () => {
  it("locks an original floor and canonical config independent of input object edits", () => {
    const config = { ...DEFAULT_CONFIG },
      s = createSession(config, "test");
    config.slippageBps = 100;
    expect(s.task.minimumOutput).toBe(100195216n);
    expect(s.config.slippageBps).toBe(50);
  });
  it.each([
    { budget: "NaN" },
    { budget: "-1" },
    { budget: "1e3" },
    { budget: "1001" },
    { budget: "0" },
    { costTarget: "4" },
    { amount: "1" },
    { slippageBps: 301 },
    { attempts: 4 },
    { scenario: "unknown" },
  ])("rejects invalid constraints %j", (config) =>
    expect(() => make(config)).toThrow(),
  );
  it("reserves approval, rechecks, charges a revert and recovers without another approval", () => {
    const s = run();
    expect(s.phase).toBe("completed");
    expect(s.approvalAttempts).toBe(1);
    expect(s.attempts).toBe(2);
    expect(s.spent).toBe(1743131n);
    expect(s.failedCost).toBe(1056887n);
    expect(s.approvalCost).toBe(346736n);
    expect(s.events.filter((e) => e.type === "recheck-required")).toHaveLength(
      1,
    );
    expect(s.events.reduce((n, e) => n + e.cost, 0n)).toBe(s.spent);
    expect(s.output).toBe(100698710n);
  });
  it("blocks a second operation and stop while a receipt is pending", () => {
    const s = nextAction(make());
    expect(s.spent).toBe(0n);
    expect(s.attempts).toBe(0);
    expect(() => nextAction(s)).toThrow(/pending receipt/);
    expect(() => stopSession(s)).toThrow(/pending receipts/);
  });
  it("duplicate settlement is idempotent but conflicting same-ID data is rejected", () => {
    const pending = nextAction(make()),
      receipt = simulatedReceipt(pending),
      settled = reconcile(pending, receipt);
    expect(reconcile(settled, receipt)).toBe(settled);
    expect(() =>
      reconcile(settled, { ...receipt, gasUsed: receipt.gasUsed + 1n }),
    ).toThrow(/Conflicting/);
  });
  it("rejects an unrelated operation or mismatched kind", () => {
    const s = nextAction(make()),
      receipt = simulatedReceipt(s);
    expect(() => reconcile(s, { ...receipt, id: "other" })).toThrow(
      /does not belong/,
    );
    expect(() => reconcile(s, { ...receipt, kind: "swap" })).toThrow(
      /does not belong/,
    );
  });
  it("rejects impossible receipt amounts", () => {
    const s = nextAction(make()),
      receipt = simulatedReceipt(s);
    expect(() => reconcile(s, { ...receipt, gasUsed: -1n })).toThrow(/Invalid/);
    expect(() => reconcile(s, { ...receipt, output: 1n })).toThrow(
      /cannot produce/,
    );
  });
  it("preserves actual over-budget gas rather than clamping to the budget", () => {
    const s = nextAction(make()),
      receipt = { ...simulatedReceipt(s), gasPriceWei: 1000000000000n };
    const settled = reconcile(s, receipt);
    expect(settled.phase).toBe("stopped");
    expect(settled.budgetBreach).toBe(true);
    expect(settled.spent).toBeGreaterThan(settled.task.gasBudget);
    expect(settled.events.at(-1)!.remaining).toBeLessThan(0n);
  });
  it("retains an unexpected below-floor output and blocks further attempts", () => {
    const s = swapReady(),
      receipt = {
        ...simulatedReceipt(s),
        status: "success" as const,
        output: 1n,
      };
    const settled = reconcile(s, receipt);
    expect(settled.floorBreach).toBe(true);
    expect(settled.output).toBe(1n);
    expect(settled.phase).toBe("stopped");
  });
  it("does not prepare the swap blindly after a gas spike following approval", () => {
    let s = settleSimulation(
      nextAction(make({ scenario: "approval-gas-spike" })),
    );
    expect(s.approved).toBe(true);
    expect(observation(s).gasPriceWei).toBe(30000000000n);
    s = nextAction(s);
    expect(s.phase).toBe("ready");
    expect(s.attempts).toBe(0);
    expect(s.spent).toBeGreaterThan(0n);
    expect(s.events.at(-1)?.type).toBe("wait");
  });
  it("failed approval is charged without granting allowance or counting a swap", () => {
    const s = nextAction(make()),
      settled = reconcile(s, { ...simulatedReceipt(s), status: "reverted" });
    expect(settled.approved).toBe(false);
    expect(settled.attempts).toBe(0);
    expect(settled.spent).toBeGreaterThan(0n);
    expect(settled.failedCost).toBe(settled.approvalCost);
  });
  it("stops repeated approval failure within three attempts", () => {
    let s = make({ scenario: "flat-cheap" });
    for (let i = 0; i < 3; i++) {
      s = nextAction(s);
      s = reconcile(s, { ...simulatedReceipt(s), status: "reverted" });
    }
    expect(s.phase).toBe("stopped");
    expect(s.approvalAttempts).toBe(3);
  });
  it("does not reset the original floor or absolute draft deadline on retry", () => {
    let s = swapReady();
    const original = s.pending!.envelope!;
    s = nextAction(settleSimulation(s));
    const retry = s.pending!.envelope!;
    expect(s.pending!.protection!.decision).toBe("MATCH");
    expect(s.task.minimumOutput).toBe(100195216n);
    const abi = parseAbi([
      "function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)",
    ]);
    expect(decodeFunctionData({ abi, data: retry.data }).args[0]).toBe(
      decodeFunctionData({ abi, data: original.data }).args[0],
    );
  });
  it("enforces swap attempt limit without erasing reverted gas", () => {
    const s = run(make({ attempts: 1 }));
    expect(s.phase).toBe("stopped");
    expect(s.attempts).toBe(1);
    expect(s.spent).toBeGreaterThan(0n);
    expect(s.output).toBeNull();
  });
  it("a hard budget too small never spends", () => {
    const s = run(make({ budget: "0.01", costTarget: "0.01" }));
    expect(s.spent).toBe(0n);
    expect(s.attempts).toBe(0);
    expect(s.phase).toBe("stopped");
  });
  it("cost-first can miss the original floor; no output or fictitious benefit is reported", () => {
    const s = run(make({ priority: "cost", scenario: "wait-misses-floor" }));
    expect(s.phase).toBe("stopped");
    expect(s.output).toBeNull();
    expect(exportSession(s).result.netOutputRaw).toBeNull();
    expect(s.task.minimumOutput).toBe(100195216n);
    expect(observation(s).second).toBe(180);
  });
  it("shows an infeasible soft target but can fall back to the hard budget at the final observation", () => {
    const s = make({ priority: "cost", scenario: "gas-stays-high" });
    expect(inspectSession(s).targetCurrentlyInfeasible).toBe(true);
    const final = run(s);
    expect(final.phase).toBe("completed");
    expect(final.spent).toBeGreaterThan(final.task.targetGasCost);
    expect(final.completedAt).toBe(150);
  });
  it("unavailable quotes fail closed without synthetic substitution", () => {
    const s = run(make({ scenario: "rpc-unavailable" }));
    expect(s.attempts).toBe(0);
    expect(s.spent).toBe(0n);
    expect(s.phase).toBe("stopped");
  });
  it("restores the same pending operation and all settled receipt costs", () => {
    const s = nextAction(settleSimulation(swapReady()));
    expect(exportSession(restoreSession(persistSession(s)))).toEqual(
      exportSession(s),
    );
    const final = run(s);
    expect(exportSession(restoreSession(persistSession(final)))).toEqual(
      exportSession(final),
    );
  });
  it("restores a user-stopped task and cannot resume a terminal task", () => {
    const s = stopSession(settleSimulation(nextAction(make())));
    expect(restoreSession(persistSession(s)).phase).toBe("stopped");
    expect(() => nextAction(s)).toThrow();
    expect(s.spent).toBeGreaterThan(0n);
  });
  it("ignores forged cached ledgers and rejects invalid command sequences", () => {
    const value = JSON.parse(persistSession(make()));
    value.spent = "999";
    value.events = [{ type: "completed" }];
    expect(restoreSession(JSON.stringify(value)).spent).toBe(0n);
    expect(() =>
      restoreSession(JSON.stringify({ ...value, commands: ["receipt"] })),
    ).toThrow();
    expect(() =>
      restoreSession(JSON.stringify({ ...value, commands: ["hacked"] })),
    ).toThrow();
    expect(() => restoreSession("a".repeat(20001))).toThrow();
  });
  it("exports provenance, a non-authenticated fingerprint and pending status", () => {
    const report = exportSession(nextAction(make()));
    expect(report.provenance.receipts).toBe("Synthetic");
    expect(report.result.hasPendingReceipt).toBe(true);
    expect(report.result.spentGas).toBe("0");
    expect(report.fingerprintMeaning).toContain("not a signature");
  });
  it("never restores local-fork evidence as fake receipt data", () => {
    const s = nextAction(make()),
      settled = reconcile(s, {
        ...simulatedReceipt(s),
        evidence: "local-fork",
      });
    expect(() => persistSession(settled)).toThrow(/Local-fork/);
    expect(exportSession(settled).provenance.receipts).toContain("local fork");
  });
  it.each(SCENARIOS.map((s) => s.id))(
    "terminates scenario %s and preserves accounting identities",
    (scenario) => {
      const s = run(make({ scenario }));
      expect(["completed", "stopped"]).toContain(s.phase);
      expect(s.pending).toBeNull();
      expect(s.events.reduce((n, e) => n + e.cost, 0n)).toBe(s.spent);
      const receipts = s.events
        .filter((e) => e.receipt)
        .map((e) => e.receipt!.id);
      expect(new Set(receipts).size).toBe(receipts.length);
      expect(s.budgetBreach).toBe(false);
      expect(s.floorBreach).toBe(false);
      expect(s.attempts).toBeLessThanOrEqual(3);
    },
  );
});
