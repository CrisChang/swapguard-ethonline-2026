/** Real SDK client -> local stdio server. Constructed inputs, no chain or LLM calls. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { AgentResult } from "../src/lib/agent-ledger";

const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "swapguard-mcp-check-"));
const journal = join(directory, "ledger.jsonl");
async function connect() {
  const client = new Client({
    name: "swapguard-integration-check",
    version: "1.0.0",
  });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      join(root, "node_modules/tsx/dist/loader.mjs"),
      join(root, "server/mcp.ts"),
    ],
    // Matches the documented absolute-path setup even outside the repository.
    cwd: directory,
    env: { SWAPGUARD_LEDGER_PATH: journal },
    stderr: "inherit",
  });
  await client.connect(transport);
  return client;
}
let client = await connect();
let calls = 0;
async function call(name: string, args: Record<string, unknown>, fail = false) {
  const result = await client.callTool({ name, arguments: args });
  calls++;
  assert.equal(!!result.isError, fail);
  return result.structuredContent as AgentResult;
}
try {
  assert.equal((await client.listTools()).tools.length, 4);
  const terms = {
    taskId: "sdk-demo",
    amountWeth: "0.04",
    initialQuoteUsdc: "100",
    minimumOutputUsdc: "99.5",
    gasBudgetUsdc: "3",
    maxAttempts: 3,
    expiresAtMs: Date.now() + 600000,
  };
  const request = (
    attemptId: string,
    kind: "approval" | "swap",
    estimatedGasUsdc: string,
  ) => ({
    taskId: terms.taskId,
    attemptId,
    kind,
    amountWeth: "0.04",
    quotedOutputUsdc: "100",
    transactionMinimumUsdc: "99.5",
    estimatedGasUsdc,
    quoteAtMs: Date.now(),
  });
  await call("swapguard_open_task", terms);
  assert.equal(
    (
      await call(
        "swapguard_assess_attempt",
        request("approve", "approval", "0.4"),
      )
    ).decision,
    "ADVISORY_READY",
  );
  await call("swapguard_record_receipt", {
    taskId: terms.taskId,
    attemptId: "approve",
    receiptId: "receipt-approve",
    status: "success",
    gasCostUsdc: "0.4",
    outputUsdc: "0",
  });
  await call("swapguard_assess_attempt", request("swap-1", "swap", "1"));
  assert.equal(
    (
      await call(
        "swapguard_assess_attempt",
        request("duplicate-send", "swap", "1"),
      )
    ).decision,
    "WAIT",
  );
  const reverted = {
    taskId: terms.taskId,
    attemptId: "swap-1",
    receiptId: "receipt-revert",
    status: "reverted",
    gasCostUsdc: "1",
    outputUsdc: "0",
  };
  await call("swapguard_record_receipt", reverted);
  assert.equal(
    (await call("swapguard_record_receipt", reverted)).spentGasUsdc,
    "1.4",
  );
  await call(
    "swapguard_record_receipt",
    { ...reverted, gasCostUsdc: "0" },
    true,
  );
  await client.close();
  client = await connect();
  assert.equal(
    (await call("swapguard_get_task", { taskId: terms.taskId })).spentGasUsdc,
    "1.4",
  );
  await call("swapguard_open_task", { ...terms, gasBudgetUsdc: "9" }, true);
  assert.equal(
    (
      await call(
        "swapguard_assess_attempt",
        request("too-costly", "swap", "1.9"),
      )
    ).decision,
    "WAIT",
  );
  assert.equal(
    (
      await call("swapguard_assess_attempt", {
        ...request("weaker-floor", "swap", "0.5"),
        transactionMinimumUsdc: "98",
      })
    ).decision,
    "REJECT",
  );
  await call("swapguard_assess_attempt", request("swap-2", "swap", "0.5"));
  const result = await call("swapguard_record_receipt", {
    taskId: terms.taskId,
    attemptId: "swap-2",
    receiptId: "receipt-success",
    status: "success",
    gasCostUsdc: "0.5",
    outputUsdc: "99.8",
  });
  assert.equal(result.spentGasUsdc, "1.9");
  assert.equal(result.netOutputAfterGasUsdc, "97.9");
  assert.equal(result.evidence, "caller-reported-unverified");
  assert.equal(result.status, "completed_reported");
  assert.ok(readFileSync(journal, "utf8").includes("receipt-revert"));
  console.log(
    JSON.stringify(
      {
        status: "passed",
        tools: 4,
        toolCalls: calls,
        restartPersistence: true,
        actualMcpTransport: "stdio",
        evidence:
          "constructed caller reports; not mainnet receipts or a live LLM evaluation",
        finalReport: result,
        journal,
      },
      null,
      2,
    ),
  );
} finally {
  await client.close();
}
