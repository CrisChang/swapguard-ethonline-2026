/** Publishable synthetic evidence captured through the real local MCP transport. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { AGENT_EXAMPLES, runAgentExample } from "../src/lib/agent-examples";
import type { AgentResult, ToolName } from "../src/lib/agent-ledger";

const root = resolve(import.meta.dirname, "..");
const runId = process.argv[2];
if (!runId || !/^agent-ledger-\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/.test(runId))
  throw new Error(
    "Supply a new run ID, e.g. agent-ledger-2026-09-10. Existing runs are never overwritten.",
  );
const output = join(root, "public/evidence");
const names = ["json", "manifest.json", "md"].map((ext) => `${runId}.${ext}`);
for (const name of names)
  assert(!existsSync(join(output, name)), `Already exists: ${name}`);
const directory = mkdtempSync(join(tmpdir(), "swapguard-evidence-"));
const sourceFiles = [
  "src/lib/agent-ledger.ts",
  "src/lib/agent-examples.ts",
  "server/agent-journal.ts",
  "server/mcp.ts",
  "scripts/record-agent-evidence.ts",
  "package.json",
  "package-lock.json",
];
const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const sourceSha256 = Object.fromEntries(
  sourceFiles.map((path) => [path, sha256(readFileSync(join(root, path)))]),
);
const startedAt = new Date().toISOString();
const baseCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: root,
  encoding: "utf8",
}).trim();
type Observation = {
  tool: ToolName;
  input: Record<string, unknown>;
  at: string;
  isError: boolean;
  output: AgentResult | null;
  error: unknown;
};
type Expected = Partial<
  Pick<
    AgentResult,
    | "decision"
    | "status"
    | "spentGasUsdc"
    | "remainingGasBudgetUsdc"
    | "grossOutputUsdc"
    | "netOutputAfterGasUsdc"
    | "pendingAttemptId"
    | "budgetBreach"
    | "floorBreach"
    | "duplicate"
  >
>;
const cases: {
  id: string;
  label: string;
  expected: Expected;
  actual: Expected;
  checksPassed: boolean;
  restarted: boolean;
  calls: Observation[];
  finalReport: AgentResult;
  journal: unknown[];
}[] = [];

async function withTask(
  id: string,
  label: string,
  expected: Expected,
  exercise: (
    call: (
      tool: ToolName,
      input: Record<string, unknown>,
      error?: boolean,
    ) => Promise<AgentResult>,
    restart: () => Promise<void>,
  ) => Promise<AgentResult>,
) {
  const journalPath = join(directory, `${id}.jsonl`);
  const calls: Observation[] = [];
  let restarted = false;
  async function connect() {
    const client = new Client({
      name: "swapguard-evidence-recorder",
      version: "1.0.0",
    });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [
          "--import",
          join(root, "node_modules/tsx/dist/loader.mjs"),
          join(root, "server/mcp.ts"),
        ],
        cwd: directory,
        env: { SWAPGUARD_LEDGER_PATH: journalPath },
        stderr: "inherit",
      }),
    );
    assert.equal((await client.listTools()).tools.length, 4);
    return client;
  }
  let client = await connect();
  try {
    const call = async (
      tool: ToolName,
      input: Record<string, unknown>,
      error = false,
    ) => {
      const result = await client.callTool({ name: tool, arguments: input });
      calls.push({
        tool,
        input,
        at: new Date().toISOString(),
        isError: !!result.isError,
        output: (result.structuredContent as AgentResult) ?? null,
        error: result.isError ? result.content : null,
      });
      assert.equal(
        !!result.isError,
        error,
        `${id}: unexpected tool error state`,
      );
      return result.structuredContent as AgentResult;
    };
    const finalReport = await exercise(call, async () => {
      await client.close();
      client = await connect();
      restarted = true;
    });
    const actual = Object.fromEntries(
      Object.keys(expected).map((key) => [
        key,
        finalReport[key as keyof AgentResult],
      ]),
    ) as Expected;
    assert.deepEqual(
      actual,
      expected,
      `${id}: observed values differ from declared expectations`,
    );
    cases.push({
      id,
      label,
      expected,
      actual,
      checksPassed: true,
      restarted,
      calls,
      finalReport,
      journal: readFileSync(journalPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    });
  } finally {
    await client.close();
  }
}

// Expectations are fixed assertions, not calculated from the implementation's results.
const expectations: Record<string, Expected> = {
  recover: {
    status: "completed_reported",
    spentGasUsdc: "1.9",
    remainingGasBudgetUsdc: "1.1",
    grossOutputUsdc: "99.8",
    netOutputAfterGasUsdc: "97.9",
  },
  budget: {
    decision: "WAIT",
    spentGasUsdc: "1.4",
    remainingGasBudgetUsdc: "1.6",
    grossOutputUsdc: null,
  },
  floor: { decision: "REJECT", spentGasUsdc: "1.4", grossOutputUsdc: null },
  pending: {
    decision: "WAIT",
    spentGasUsdc: "0.4",
    pendingAttemptId: "swap-1",
    grossOutputUsdc: null,
  },
  overrun: {
    status: "constraint_breach",
    budgetBreach: true,
    spentGasUsdc: "3.5",
    remainingGasBudgetUsdc: "-0.5",
    grossOutputUsdc: "99.8",
    netOutputAfterGasUsdc: "96.3",
  },
};
for (const example of AGENT_EXAMPLES) {
  await withTask(
    example.id,
    example.label,
    expectations[example.id],
    async (call, restart) => {
      let result: AgentResult | undefined;
      for (const fixture of runAgentExample(example.id).calls) {
        const input: Record<string, unknown> = {
          ...fixture.input,
          taskId: `evidence-${example.id}`,
        };
        if ("quoteAtMs" in input) input.quoteAtMs = Date.now();
        if ("expiresAtMs" in input) input.expiresAtMs = Date.now() + 600000;
        result = await call(fixture.tool, input);
        // Preserve unresolved state across a real process restart before duplicate preparation.
        if (
          example.id === "pending" &&
          fixture.tool === "swapguard_assess_attempt" &&
          input.attemptId === "swap-1"
        )
          await restart();
      }
      assert(result);
      return result;
    },
  );
}
for (const id of [
  "duplicate-receipt",
  "budget-reset",
  "below-floor",
] as const) {
  const expected: Expected =
    id === "duplicate-receipt"
      ? { duplicate: true, spentGasUsdc: "0.4", remainingGasBudgetUsdc: "2.6" }
      : id === "budget-reset"
        ? { spentGasUsdc: "0.4", remainingGasBudgetUsdc: "2.6" }
        : {
            status: "constraint_breach",
            floorBreach: true,
            spentGasUsdc: "1.4",
            grossOutputUsdc: "98",
            netOutputAfterGasUsdc: "96.6",
          };
  const label = {
    "duplicate-receipt": "Repeated receipt charges once",
    "budget-reset": "Restart cannot reset existing task terms",
    "below-floor": "Below-floor reported output stays visible",
  }[id];
  await withTask(id, label, expected, async (call, restart) => {
    const taskId = `evidence-${id}`;
    const terms = {
      taskId,
      amountWeth: "0.04",
      initialQuoteUsdc: "100",
      minimumOutputUsdc: "99.5",
      gasBudgetUsdc: "3",
      maxAttempts: 3,
      expiresAtMs: Date.now() + 600000,
    };
    const assess = (
      attemptId: string,
      kind: "approval" | "swap",
      estimatedGasUsdc: string,
    ) =>
      call("swapguard_assess_attempt", {
        taskId,
        attemptId,
        kind,
        amountWeth: "0.04",
        quotedOutputUsdc: "100",
        transactionMinimumUsdc: "99.5",
        estimatedGasUsdc,
        quoteAtMs: Date.now(),
      });
    await call("swapguard_open_task", terms);
    await assess("approve", "approval", "0.4");
    const receipt = {
      taskId,
      attemptId: "approve",
      receiptId: `${id}-approval`,
      status: "success",
      gasCostUsdc: "0.4",
      outputUsdc: "0",
    };
    await call("swapguard_record_receipt", receipt);
    if (id === "duplicate-receipt") {
      await call(
        "swapguard_record_receipt",
        { ...receipt, gasCostUsdc: "0" },
        true,
      );
      return call("swapguard_record_receipt", receipt);
    }
    if (id === "budget-reset") {
      await restart();
      await call("swapguard_open_task", { ...terms, gasBudgetUsdc: "9" }, true);
      const result = await call("swapguard_get_task", { taskId });
      assert.equal(result.terms.gasBudgetUsdc, "3");
      return result;
    }
    await assess("swap", "swap", "1");
    return call("swapguard_record_receipt", {
      taskId,
      attemptId: "swap",
      receiptId: `${id}-swap`,
      status: "success",
      gasCostUsdc: "1",
      outputUsdc: "98",
    });
  });
}
for (const path of sourceFiles)
  assert.equal(
    sha256(readFileSync(join(root, path))),
    sourceSha256[path],
    "Source changed during recording; do not publish mixed-version evidence.",
  );
const evidence = {
  schemaVersion: "swapguard-frozen-agent-evidence-v1",
  runId,
  startedAt,
  completedAt: new Date().toISOString(),
  evidenceType: "synthetic-caller-inputs-real-local-mcp-transport",
  transport: "stdio",
  sourceBaseCommit: baseCommit,
  sourceRevisionNote:
    "Base commit is provenance only; exact exercised source bytes are identified by sourceSha256 (may include uncommitted changes).",
  sourceSha256,
  runtime: { node: process.version, mcpSdk: "2.0.0" },
  methodology:
    "Eight predefined constructed scenarios, captured via the official MCP SDK against isolated local journals. All cases and tool errors retained. Not independent validation, live LLM behavior, real transaction receipts, or a savings/accuracy benchmark.",
  exclusions: [
    "No real funds or wallet",
    "No chain receipt verification",
    "No live prices",
    "No production agent adoption",
    "No cost-optimality comparison",
    "No aggregate gas sum across alternative scenarios",
  ],
  summary: {
    scenarios: cases.length,
    passed: cases.filter((c) => c.checksPassed).length,
    toolCalls: cases.reduce((n, c) => n + c.calls.length, 0),
    expectedToolErrors: cases.flatMap((c) => c.calls).filter((c) => c.isError)
      .length,
    restartCases: cases.filter((c) => c.restarted).length,
  },
  cases,
};
const raw = `${JSON.stringify(evidence, null, 2)}\n`;
const manifest = {
  ...evidence,
  cases: cases.map(({ calls, journal, finalReport, ...c }) => ({
    ...c,
    callCount: calls.length,
    status: finalReport.status,
    decision: finalReport.decision ?? null,
    spentGasUsdc: finalReport.spentGasUsdc,
    remainingGasBudgetUsdc: finalReport.remainingGasBudgetUsdc,
    grossOutputUsdc: finalReport.grossOutputUsdc,
    netOutputAfterGasUsdc: finalReport.netOutputAfterGasUsdc,
  })),
  artifact: {
    path: `/evidence/${names[0]}`,
    sha256: sha256(raw),
    bytes: Buffer.byteLength(raw),
  },
  reportPath: `/evidence/${names[2]}`,
};
const markdown = `# SwapGuard frozen Agent test report\n\nRun: ${runId}\n\nRecorded: ${startedAt} → ${evidence.completedAt}\n\n${evidence.methodology}\n\n## Observed results\n\n${evidence.summary.passed}/${cases.length} scenarios matched their predefined assertions; ${evidence.summary.toolCalls} MCP calls; ${evidence.summary.expectedToolErrors} expected tool errors; ${evidence.summary.restartCases} restart cases. Passing a scenario is not a successful swap or a real-world success rate.\n\n| Scenario | Observed state / decision | Reported gas | Remaining budget | Reported gross output |\n| --- | --- | --- | --- | --- |\n${manifest.cases.map((c) => `| ${c.label} | ${c.decision ?? c.status} | ${c.spentGasUsdc} | ${c.remainingGasBudgetUsdc} | ${c.grossOutputUsdc ?? "unfinished"} |`).join("\n")}\n\nGas is USDC-equivalent supplied by the caller. Scenarios are alternatives, not independent sampled trades; do not sum them into claimed savings. Completed output below a floor or over budget remains a breach.\n\n## Reproduce and inspect\n\nFull inputs, outputs, tool errors and synthetic journal events: [JSON](${names[0]}). Exact source fingerprints and runtime: [manifest](${names[1]}).\n\nArtifact SHA-256: \`${manifest.artifact.sha256}\`. This detects file changes, not an independent audit or signed attestation.\n\nRun \`npm run record:agent-evidence -- agent-ledger-YYYY-MM-DD-your-run\` from a matching checkout. A new run uses current timestamps; compare semantic results, not byte equality. Existing report files are never overwritten by the recorder.\n\nNo RPC calls, chain transactions, wallet keys, customer data or live LLM calls were used. The website hosts this fixed published batch; it does not collect visitor wallet activity or upload private local MCP journals.\n`;
mkdirSync(output, { recursive: true });
writeFileSync(join(output, names[0]), raw, { flag: "wx" });
writeFileSync(
  join(output, names[1]),
  `${JSON.stringify(manifest, null, 2)}\n`,
  { flag: "wx" },
);
writeFileSync(join(output, names[2]), markdown, { flag: "wx" });
console.log(
  JSON.stringify(
    {
      runId,
      ...evidence.summary,
      artifactSha256: manifest.artifact.sha256,
      files: names,
    },
    null,
    2,
  ),
);
