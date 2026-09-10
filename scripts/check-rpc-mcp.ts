/** Negative SDK integration smoke: read-only local RPC, no transaction sends. */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { AgentResult } from "../src/lib/agent-ledger";

const root = resolve(import.meta.dirname, "..");
const directory = mkdtempSync(join(tmpdir(), "swapguard-rpc-negative-"));
const client = new Client({
  name: "swapguard-rpc-negative-check",
  version: "0.1.0",
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
    env: {
      SWAPGUARD_LEDGER_PATH: join(directory, "ledger.jsonl"),
      SWAPGUARD_VERIFY_RPC_URL: "http://127.0.0.1:18546",
      SWAPGUARD_VERIFY_CHAIN_ID: "31337",
    },
    stderr: "inherit",
  }),
);
let calls = 0;
async function call(
  name: string,
  args: Record<string, unknown>,
  error = false,
) {
  calls++;
  const result = await client.callTool({ name, arguments: args });
  assert.equal(!!result.isError, error);
  if (error) {
    const text = JSON.stringify(result.content);
    assert(
      !text.includes("127.0.0.1") && !text.includes("http://"),
      "Error must not expose RPC details.",
    );
  }
  return result.structuredContent as AgentResult;
}
try {
  assert.equal((await client.listTools()).tools.length, 5);
  const terms = {
    taskId: "negative-smoke",
    amountWeth: "0.04",
    initialQuoteUsdc: "100",
    minimumOutputUsdc: "99.5",
    gasBudgetUsdc: "3",
    maxAttempts: 3,
    expiresAtMs: Date.now() + 180000,
    execution: {
      chainId: 31337,
      wallet: "0x1111111111111111111111111111111111111111",
    },
  };
  const opened = await call("swapguard_open_task", terms);
  assert(opened.receiptVerification?.anchor);
  const ready = await call("swapguard_assess_attempt", {
    taskId: terms.taskId,
    attemptId: "missing",
    kind: "swap",
    amountWeth: "0.04",
    quotedOutputUsdc: "100",
    transactionMinimumUsdc: "99.5",
    estimatedGasUsdc: "0.5",
    quoteAtMs: Date.now(),
  });
  assert.equal(ready.decision, "ADVISORY_READY");
  await call(
    "swapguard_verify_receipt",
    {
      taskId: terms.taskId,
      attemptId: "missing",
      transactionHash: `0x${"11".repeat(32)}`,
    },
    true,
  );
  await call(
    "swapguard_verify_receipt",
    {
      taskId: terms.taskId,
      attemptId: "missing",
      transactionHash: `0x${"11".repeat(32)}`,
      gasCostUsdc: "0",
    },
    true,
  );
  await call(
    "swapguard_record_receipt",
    {
      taskId: terms.taskId,
      attemptId: "missing",
      receiptId: "fabricated",
      status: "success",
      gasCostUsdc: "0",
      outputUsdc: "100",
      verification: { kind: "rpc-mainnet" },
    },
    true,
  );
  const after = await call("swapguard_get_task", { taskId: terms.taskId });
  assert.equal(after.pendingAttemptId, "missing");
  assert.equal(after.spentGasUsdc, "0");
  assert.equal(after.receiptVerification?.verifiedCount, 0);
  console.log(
    JSON.stringify({
      status: "passed",
      tools: 5,
      calls,
      expectedErrors: 3,
      pendingRetained: true,
      fabricatedVerificationRefused: true,
      rpcErrorsSanitized: true,
      transactionSent: false,
    }),
  );
} finally {
  await client.close();
}
