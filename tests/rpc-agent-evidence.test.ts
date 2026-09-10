import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../public/evidence/rpc-agent-2026-09-10.manifest.json";
import { applyAgentTool, emptyAgentState } from "../src/lib/agent-ledger";
const root = resolve(import.meta.dirname, "..");
const bytes = readFileSync(resolve(root, `public${manifest.artifact.path}`));
const data = JSON.parse(bytes.toString());
const sha = (value: Buffer) => createHash("sha256").update(value).digest("hex");
describe("Pinned local fork / real reference-agent receipts", () => {
  it("matches the exact artifact and current exercised source fingerprints", () => {
    expect(sha(bytes)).toBe(manifest.artifact.sha256);
    expect(bytes.length).toBe(manifest.artifact.bytes);
    for (const [path, hash] of Object.entries(manifest.sourceSha256))
      expect(sha(readFileSync(resolve(root, path))), path).toBe(hash);
  });
  it("retains equal cumulative baseline results, noncompletion and the estimation failure", () => {
    expect(data.runs).toHaveLength(12);
    expect(
      data.summary.map((s: any) => [
        s.completed,
        s.compliantCompleted,
        s.overBudget,
      ]),
    ).toEqual([
      [4, 2, 2],
      [3, 2, 1],
      [3, 2, 1],
    ]);
    for (const scenario of [
      "normal",
      "tight-retry",
      "affordable-retry",
      "underestimated-cost",
    ]) {
      const rows = data.runs.filter((r: any) => r.scenario === scenario);
      const a = rows.find((r: any) => r.policy === "cumulative"),
        b = rows.find((r: any) => r.policy === "swapguard-mcp");
      for (const key of [
        "completed",
        "overBudget",
        "gasCostUsdc",
        "grossOutputUsdc",
      ])
        expect(a[key]).toBe(b[key]);
    }
    expect(data.runs.filter((r: any) => r.restarted)).toHaveLength(1);
  });
  it("recomputes costs from receipt gas and replays verified MCP journals", () => {
    for (const run of data.runs) {
      expect(
        run.receipts
          .reduce(
            (n: bigint, r: any) =>
              n +
              BigInt(r.verification.gasUsed) *
                BigInt(r.verification.effectiveGasPriceWei),
            0n,
          )
          .toString(),
      ).toBe(run.gasCostWei);
      for (const r of run.receipts) {
        expect(r.verification.kind).toBe("rpc-local-fork");
        expect(BigInt(r.verification.blockNumber)).toBeGreaterThan(
          BigInt(run.anchor.blockNumber),
        );
      }
      if (!run.journal) continue;
      const state = emptyAgentState();
      for (const e of run.journal)
        applyAgentTool(state, e.tool, e.input, e.atMs, e.trusted);
      const result = applyAgentTool(
        state,
        "swapguard_get_task",
        { taskId: run.terms.taskId },
        Date.parse(data.completedAt),
      );
      expect(result.evidence).toBe("rpc-verified-receipts");
      expect(result.spentGasUsdc).toBe(run.gasCostUsdc);
      expect(result.grossOutputUsdc).toBe(run.grossOutputUsdc);
    }
  });
});
