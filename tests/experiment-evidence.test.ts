import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import calibration from "../experiments/results/fork-25938600.json";
import report from "../experiments/results/tasks-25938600.json";
import {
  replayTask,
  PATHS,
  POLICIES,
  type Candidate,
  type Task,
} from "../src/lib/task-budget";

describe("checked-in experimental evidence", () => {
  it("binds the replay to the exact recorded calibration bytes", () => {
    const bytes = readFileSync(
      new URL("../experiments/results/fork-25938600.json", import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      report.calibrationSha256,
    );
    expect(report.fork).toEqual(calibration.fork);
  });
  it("contains all six independently restored measured profiles", () => {
    expect(calibration.localChainId).toBe(31337);
    expect(calibration.profiles).toHaveLength(6);
    expect(
      new Set(calibration.profiles.map((p) => `${p.amount}/${p.fee}`)).size,
    ).toBe(6);
    for (const p of calibration.profiles) {
      expect(p.approval.status).toBe("success");
      expect(p.swaps).toHaveLength(2);
      const success = p.swaps.find((s) => s.outcome === "success")!;
      const failure = p.swaps.find((s) => s.outcome === "revert")!;
      expect(success.status).toBe("success");
      expect(success.actualOutputRaw).toBe(p.quotedOutputRaw);
      expect(failure.status).toBe("reverted");
      expect(failure.actualOutputRaw).toBe("0");
      expect(BigInt(failure.minimumOutputRaw)).toBe(
        BigInt(p.quotedOutputRaw) + 1n,
      );
      expect(BigInt(success.gasUsed)).toBeGreaterThan(
        BigInt(p.quoterInternalGasEstimate),
      );
    }
  });
  it("recomputes every stored task trace without RPC or future access in the policy", () => {
    expect(report.tasks).toHaveLength(48);
    expect(new Set(report.tasks.map((t) => t.id)).size).toBe(48);
    const prices = {
      eth: BigInt(calibration.feeds.ETH.answer),
      usdc: BigInt(calibration.feeds.USDC.answer),
    };
    expect(calibration.feeds.ETH.decimals).toBe(8);
    expect(calibration.feeds.USDC.decimals).toBe(8);
    const wire = (x: unknown) =>
      JSON.parse(
        JSON.stringify(x, (_k, v) =>
          typeof v === "bigint" ? v.toString() : v,
        ),
      );
    for (const t of report.tasks) {
      const task: Task = {
        ...t.task,
        minimumOutput: BigInt(t.task.minimumOutput),
        gasBudget: BigInt(t.task.gasBudget),
        targetGasCost: BigInt(t.task.targetGasCost),
      };
      const routes: Candidate[] = calibration.profiles
        .filter((p) => p.amount === t.amount)
        .map((p) => ({
          fee: p.fee,
          output: BigInt(p.quotedOutputRaw),
          approvalGas: BigInt(p.approval.gasUsed),
          swapGas: BigInt(
            p.swaps.find((s) => s.outcome === "success")!.gasUsed,
          ),
          revertGas: BigInt(
            p.swaps.find((s) => s.outcome === "revert")!.gasUsed,
          ),
        }));
      for (const policy of POLICIES) {
        const actual = t.results.find((r) => r.policy === policy)!;
        const path = PATHS.find((p) => p.name === actual.path)!;
        const expected = replayTask(
          policy,
          task,
          routes,
          prices,
          path,
          actual.approvedInitially,
        );
        expect(actual).toEqual(wire(expected));
      }
    }
  });
  it("retains all denominators, failed gas and the negative completion result", () => {
    for (const s of report.summaries) {
      const results = report.tasks.flatMap((t) =>
        t.results.filter((r) => r.policy === s.policy),
      );
      expect(s.completed + s.uncompleted).toBe(s.tasks);
      expect(s.tasks).toBe(48);
      expect(s.completed).toBe(results.filter((r) => r.completed).length);
      expect(s.reverts).toBe(results.reduce((n, r) => n + r.reverts, 0));
      expect(BigInt(s.totalGas)).toBe(
        results.reduce((n, r) => n + BigInt(r.gas), 0n),
      );
      expect(BigInt(s.failedGas)).toBe(
        results.reduce((n, r) => n + BigInt(r.failedGas), 0n),
      );
      for (const r of results) {
        expect(BigInt(r.gas)).toBe(
          r.events
            .filter((e) => e.action === "filled" || e.action === "reverted")
            .reduce((n, e) => {
              if (!("gas" in e) || typeof e.gas !== "string")
                throw new Error("Missing execution cost");
              return n + BigInt(e.gas);
            }, 0n),
        );
        if (!r.completed) {
          expect(r.output).toBeNull();
          expect(r.netOutput).toBeNull();
        }
      }
    }
    const immediate = report.summaries.find((s) => s.policy === "net-now")!;
    const delayed = report.summaries.find((s) => s.policy === "task-budget")!;
    expect(delayed.completed).toBeLessThan(immediate.completed);
    for (const c of report.comparisons) {
      expect(c.jointlyCompleted + c.baselineOnly + c.taskOnly + c.neither).toBe(
        48,
      );
      expect(BigInt(c.pairedGasDifference)).toBe(
        BigInt(c.baselineGas) - BigInt(c.taskGas),
      );
    }
  });
});
