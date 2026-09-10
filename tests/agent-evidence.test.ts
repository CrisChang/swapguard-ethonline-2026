import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../public/evidence/agent-ledger-2026-09-10.manifest.json";
import { applyAgentTool, emptyAgentState } from "../src/lib/agent-ledger";

const root = resolve(import.meta.dirname, "..");
const raw = readFileSync(resolve(root, `public${manifest.artifact.path}`));
const data = JSON.parse(raw.toString());
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

describe("Frozen Agent MCP evidence", () => {
  it("matches the immutable historical artifact digest and retains historical source fingerprints", () => {
    expect(hash(raw)).toBe(manifest.artifact.sha256);
    expect(raw.length).toBe(manifest.artifact.bytes);
    // This batch predates optional RPC verification. Its original files stay
    // immutable; current source hashes are checked by rpc-agent-evidence.test.
    for (const digest of Object.values(manifest.sourceSha256))
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
  });
  it("retains all scenarios, expected errors, restarts and unfavorable outcomes", () => {
    expect(data.cases).toHaveLength(8);
    expect(
      data.cases.reduce((n: number, c: any) => n + c.calls.length, 0),
    ).toBe(46);
    expect(
      data.cases.flatMap((c: any) => c.calls).filter((c: any) => c.isError),
    ).toHaveLength(2);
    expect(data.cases.filter((c: any) => c.restarted)).toHaveLength(2);
    expect(
      data.cases.find((c: any) => c.id === "budget").finalReport
        .grossOutputUsdc,
    ).toBeNull();
    expect(
      data.cases.find((c: any) => c.id === "overrun").finalReport
        .remainingGasBudgetUsdc,
    ).toBe("-0.5");
    expect(
      data.cases.find((c: any) => c.id === "below-floor").finalReport
        .floorBreach,
    ).toBe(true);
    expect(data.evidenceType).toBe(
      "synthetic-caller-inputs-real-local-mcp-transport",
    );
    for (const c of data.cases) expect(c.actual).toEqual(c.expected);
  });
  it("replays published journal events to the recorded gas and output without treating them as verified chain receipts", () => {
    for (const c of data.cases) {
      const state = emptyAgentState();
      for (const entry of c.journal)
        applyAgentTool(state, entry.tool, entry.input, entry.atMs);
      const result = applyAgentTool(
        state,
        "swapguard_get_task",
        { taskId: c.finalReport.taskId },
        Date.parse(data.completedAt),
      );
      expect(result.spentGasUsdc).toBe(c.finalReport.spentGasUsdc);
      expect(result.grossOutputUsdc).toBe(c.finalReport.grossOutputUsdc);
      expect(result.pendingAttemptId).toBe(c.finalReport.pendingAttemptId);
      expect(result.evidence).toBe("caller-reported-unverified");
    }
  });
});
