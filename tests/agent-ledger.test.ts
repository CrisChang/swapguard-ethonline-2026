import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AgentJournal } from "../server/agent-journal";
import {
  applyAgentTool,
  emptyAgentState,
  type ToolName,
} from "../src/lib/agent-ledger";
import { AGENT_EXAMPLES, runAgentExample } from "../src/lib/agent-examples";

const now = 1_800_000_000_000;
const terms = {
  taskId: "test-task",
  amountWeth: "0.04",
  initialQuoteUsdc: "100",
  minimumOutputUsdc: "99.5",
  gasBudgetUsdc: "3",
  maxAttempts: 3,
  expiresAtMs: now + 180000,
};
const attempt = {
  taskId: terms.taskId,
  attemptId: "swap-1",
  kind: "swap",
  amountWeth: "0.04",
  quotedOutputUsdc: "100",
  transactionMinimumUsdc: "99.5",
  estimatedGasUsdc: "1",
  quoteAtMs: now,
};
const receipt = {
  taskId: terms.taskId,
  attemptId: "swap-1",
  receiptId: "receipt-1",
  status: "reverted",
  gasCostUsdc: "1",
  outputUsdc: "0",
};
function fixture() {
  const state = emptyAgentState();
  const call = (tool: ToolName, input: unknown, at = now) =>
    applyAgentTool(state, tool, input, at);
  call("swapguard_open_task", terms);
  return { state, call };
}
describe("Agent advisory ledger", () => {
  it("marks a receipt below the stronger assessed minimum as inconsistent", () => {
    const { call } = fixture();
    call("swapguard_assess_attempt", {
      ...attempt,
      transactionMinimumUsdc: "99.9",
    });
    const result = call("swapguard_record_receipt", {
      ...receipt,
      status: "success",
      outputUsdc: "99.6",
    });
    expect(result.floorBreach).toBe(false);
    expect(result.attemptFloorBreach).toBe(true);
    expect(result.status).toBe("constraint_breach");
  });
  it("keeps one original floor/budget across a revert and retry", () => {
    const result = runAgentExample("recover").report;
    expect(result.spentGasUsdc).toBe("1.9");
    expect(result.netOutputAfterGasUsdc).toBe("97.9");
    expect(result.outputDifferenceFromInitialQuoteUsdc).toBe("-0.2");
    expect(result.gasBreakdownUsdc).toEqual({
      approvals: "0.4",
      failedSwaps: "1",
      successfulSwaps: "0.5",
    });
    expect(result.terms.minimumOutputUsdc).toBe("99.5");
    expect(result.evidence).toBe("caller-reported-unverified");
    expect(result.advisoryOnly).toBe(true);
  });
  it.each(AGENT_EXAMPLES.map((e) => [e.id] as const))(
    "runs the documented %s example",
    (scenario) => {
      const run = runAgentExample(scenario);
      expect(run.calls.length).toBeGreaterThan(2);
      expect(run.report.terms.gasBudgetUsdc).toBe("3");
    },
  );
  it("keeps spent gas when a retry no longer fits, with null unfinished output", () => {
    const r = runAgentExample("budget").report;
    expect(r.decision).toBe("WAIT");
    expect(r.spentGasUsdc).toBe("1.4");
    expect(r.grossOutputUsdc).toBeNull();
    expect(r.netOutputAfterGasUsdc).toBeNull();
  });
  it("rejects a weaker reported floor", () =>
    expect(runAgentExample("floor").report.decision).toBe("REJECT"));
  it("keeps pending operations and blocks a duplicate send", () => {
    const r = runAgentExample("pending").report;
    expect(r.decision).toBe("WAIT");
    expect(r.pendingAttemptId).toBe("swap-1");
  });
  it("retains a cost overrun instead of clipping it to budget", () => {
    const r = runAgentExample("overrun").report;
    expect(r.budgetBreach).toBe(true);
    expect(r.spentGasUsdc).toBe("3.5");
    expect(r.remainingGasBudgetUsdc).toBe("-0.5");
  });
  it("does not reset an existing task with changed terms", () => {
    const { call } = fixture();
    expect(() =>
      call("swapguard_open_task", { ...terms, gasBudgetUsdc: "10" }),
    ).toThrow(/immutable/);
    expect(call("swapguard_open_task", terms).duplicate).toBe(true);
  });
  it("rejects changed attempt inputs and never replays readiness as resend permission", () => {
    const { call } = fixture();
    call("swapguard_assess_attempt", attempt);
    expect(call("swapguard_assess_attempt", attempt).decision).toBe("REJECT");
    expect(() =>
      call("swapguard_assess_attempt", {
        ...attempt,
        transactionMinimumUsdc: "90",
      }),
    ).toThrow(/already used/);
  });
  it("charges exact receipt duplicates once and rejects conflicts", () => {
    const { call } = fixture();
    call("swapguard_assess_attempt", attempt);
    call("swapguard_record_receipt", receipt);
    const duplicate = call("swapguard_record_receipt", receipt);
    expect(duplicate.spentGasUsdc).toBe("1");
    expect(duplicate.duplicate).toBe(true);
    expect(() =>
      call("swapguard_record_receipt", { ...receipt, gasCostUsdc: "0" }),
    ).toThrow(/Conflicting/);
  });
  it("rejects receipts not tied to the pending operation", () => {
    const { call } = fixture();
    expect(() => call("swapguard_record_receipt", receipt)).toThrow(/pending/);
  });
  it("records late receipts even after the deadline", () => {
    const { call } = fixture();
    call("swapguard_assess_attempt", attempt);
    const r = call("swapguard_record_receipt", receipt, terms.expiresAtMs + 1);
    expect(r.spentGasUsdc).toBe("1");
    expect(r.expired).toBe(true);
    expect(r.status).toBe("stopped");
  });
  it("retains below-floor successful reports and stops further checks", () => {
    const { call } = fixture();
    call("swapguard_assess_attempt", attempt);
    const r = call("swapguard_record_receipt", {
      ...receipt,
      status: "success",
      outputUsdc: "98",
    });
    expect(r.floorBreach).toBe(true);
    expect(r.grossOutputUsdc).toBe("98");
    expect(
      call("swapguard_assess_attempt", { ...attempt, attemptId: "next" })
        .decision,
    ).toBe("STOP");
  });
  it.each([now - 60001, now + 5001])(
    "waits on stale/future quote %s",
    (quoteAtMs) => {
      expect(
        fixture().call("swapguard_assess_attempt", { ...attempt, quoteAtMs })
          .decision,
      ).toBe("WAIT");
    },
  );
  it("rejects changed input amount and enforces a stronger candidate minimum", () => {
    expect(
      fixture().call("swapguard_assess_attempt", {
        ...attempt,
        amountWeth: "0.2",
      }).decision,
    ).toBe("REJECT");
    expect(
      fixture().call("swapguard_assess_attempt", {
        ...attempt,
        transactionMinimumUsdc: "101",
      }).decision,
    ).toBe("WAIT");
  });
  it("limits attempts without resetting the budget", () => {
    const { call } = fixture();
    for (let i = 0; i < 3; i++) {
      call("swapguard_assess_attempt", {
        ...attempt,
        attemptId: `try-${i}`,
        estimatedGasUsdc: "0.1",
      });
      call("swapguard_record_receipt", {
        ...receipt,
        attemptId: `try-${i}`,
        receiptId: `receipt-${i}`,
        gasCostUsdc: "0.1",
      });
    }
    const r = call("swapguard_assess_attempt", {
      ...attempt,
      attemptId: "too-many",
    });
    expect(r.decision).toBe("STOP");
    expect(r.spentGasUsdc).toBe("0.3");
  });
  it("rejects fabricated output from an approval or revert", () => {
    const { call } = fixture();
    call("swapguard_assess_attempt", { ...attempt, kind: "approval" });
    expect(() =>
      call("swapguard_record_receipt", {
        ...receipt,
        status: "success",
        outputUsdc: "1",
      }),
    ).toThrow(/cannot report swap output/);
  });
  it("does not reuse one receipt across multiple task budgets", () => {
    const { call } = fixture();
    call("swapguard_assess_attempt", attempt);
    call("swapguard_record_receipt", receipt);
    call("swapguard_open_task", { ...terms, taskId: "task-2" });
    call("swapguard_assess_attempt", { ...attempt, taskId: "task-2" });
    expect(() =>
      call("swapguard_record_receipt", { ...receipt, taskId: "task-2" }),
    ).toThrow(/another task/);
  });
  it.each(["-1", "NaN", "1e3", "0.0000001", "01"])(
    "rejects malformed cost %s",
    (gasCostUsdc) => {
      const { call } = fixture();
      call("swapguard_assess_attempt", attempt);
      expect(() =>
        call("swapguard_record_receipt", { ...receipt, gasCostUsdc }),
      ).toThrow();
    },
  );
  it("rejects extra fields, impossible initial terms and prototype identifiers", () => {
    const { call } = fixture();
    expect(() =>
      call("swapguard_assess_attempt", { ...attempt, resetBudget: true }),
    ).toThrow();
    expect(() =>
      call("swapguard_open_task", { ...terms, taskId: "constructor" }),
    ).toThrow();
    expect(() =>
      call("swapguard_open_task", {
        ...terms,
        taskId: "new",
        minimumOutputUsdc: "101",
      }),
    ).toThrow();
  });
});
describe("Local durable advisory journal", () => {
  function path() {
    return join(
      mkdtempSync(join(tmpdir(), "swapguard-ledger-test-")),
      "ledger.jsonl",
    );
  }
  it("replays pending state and settled costs across process-style reopen", () => {
    const file = path();
    let journal = new AgentJournal(file);
    try {
      journal.execute("swapguard_open_task", terms, now);
      journal.execute("swapguard_assess_attempt", attempt, now);
      journal.close();
      journal = new AgentJournal(file);
      expect(
        journal.execute("swapguard_get_task", { taskId: terms.taskId }, now)
          .pendingAttemptId,
      ).toBe("swap-1");
      journal.execute("swapguard_record_receipt", receipt, now);
      journal.close();
      journal = new AgentJournal(file);
      expect(
        journal.execute("swapguard_get_task", { taskId: terms.taskId }, now)
          .spentGasUsdc,
      ).toBe("1");
      expect(() =>
        journal.execute(
          "swapguard_open_task",
          { ...terms, gasBudgetUsdc: "8" },
          now,
        ),
      ).toThrow();
    } finally {
      journal.close();
    }
  });
  it("refuses a second writer without removing the first writer's lock", () => {
    const file = path();
    const journal = new AgentJournal(file);
    try {
      expect(() => new AgentJournal(file)).toThrow();
      expect(existsSync(`${file}.lock`)).toBe(true);
    } finally {
      journal.close();
    }
    expect(existsSync(`${file}.lock`)).toBe(false);
  });
  it("fails closed on truncated storage and never resets it", () => {
    const file = path();
    const journal = new AgentJournal(file);
    journal.execute("swapguard_open_task", terms, now);
    journal.close();
    appendFileSync(file, '{"partial":');
    const before = readFileSync(file, "utf8");
    expect(() => new AgentJournal(file)).toThrow(/Incomplete/);
    expect(readFileSync(file, "utf8")).toBe(before);
  });
  it("does not persist invalid operations or mutate the committed state", () => {
    const file = path();
    const journal = new AgentJournal(file);
    try {
      journal.execute("swapguard_open_task", terms, now);
      const before = readFileSync(file, "utf8");
      expect(() =>
        journal.execute("swapguard_record_receipt", receipt, now),
      ).toThrow();
      expect(readFileSync(file, "utf8")).toBe(before);
      expect(
        journal.execute("swapguard_get_task", { taskId: terms.taskId }, now)
          .spentGasUsdc,
      ).toBe("0");
    } finally {
      journal.close();
    }
  });
});
