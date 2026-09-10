/** Local fork ONLY. Executes a deterministic reference agent; never a user's wallet. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  parseUnits,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { TOKENS, CONTRACTS, QUOTER_ABI } from "../src/lib/contracts";
import { SWAP_ABI, DEADLINE_ABI } from "../src/lib/protection";
import { ReceiptVerifier, gasToUsdcRaw } from "../server/receipt-verifier";
import {
  runReferenceAgent,
  type AgentPolicy,
  type Candidate,
} from "../server/reference-swap-agent";
import type {
  AgentTask,
  AgentResult,
  Attempt,
  TaskTerms,
} from "../src/lib/agent-ledger";

const root = resolve(import.meta.dirname, "..");
const runId = process.argv[2];
assert(
  runId && /^rpc-agent-\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/.test(runId),
  "Supply a NEW rpc-agent-YYYY-MM-DD run ID.",
);
const paths = ["json", "manifest.json", "md"].map((ext) =>
  join(root, `public/evidence/${runId}.${ext}`),
);
paths.forEach((path) =>
  assert(!existsSync(path), "Never overwrite published runs."),
);
// Fixed literal loopback endpoint. No configurable write endpoint or private key.
const url = "http://127.0.0.1:18546";
const client = createPublicClient({
  transport: http(url, { timeout: 60000, retryCount: 0 }),
});
const rpc = async (method: string, params: unknown[] = []) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as {
    result: any;
    error?: { message: string };
  };
  assert(!body.error, body.error?.message);
  return body.result;
};
const blockNumber = 25938600n;
const blockHash =
  "0xd7274bebf8aca6ada1e7c82fd176ccac973ae1fc35f080ffff060c692203157f";
assert.equal(await client.getChainId(), 31337);
const runtime = await rpc("web3_clientVersion");
assert.match(runtime, /anvil/i);
const initial = await client.getBlock();
assert.equal(
  initial.number,
  blockNumber,
  "Requires a fresh fork; restart Anvil before another run.",
);
assert.equal(initial.hash, blockHash);
const [wallet] = (await rpc("eth_accounts")) as Address[];
assert(wallet);
const verifier = new ReceiptVerifier(url, 31337);
let chainTime = Number(initial.timestamp);
const gasPrice = 1_000_000_000n;
async function send(to: Address, data: Hex, gas: bigint, value = 0n) {
  await rpc("evm_setNextBlockTimestamp", [++chainTime]);
  await rpc("anvil_setNextBlockBaseFeePerGas", ["0x0"]);
  const hash = (await rpc("eth_sendTransaction", [
    {
      from: wallet,
      to,
      data,
      gas: toHex(gas),
      gasPrice: toHex(gasPrice),
      value: toHex(value),
    },
  ])) as Hex;
  await client.waitForTransactionReceipt({
    hash,
    pollingInterval: 50,
    timeout: 60000,
  });
  return hash;
}
// Test-only inventory setup is excluded from task costs and precedes all snapshots.
await send(TOKENS.WETH.address, "0xd0e30db0", 100_000n, parseUnits("2", 18));
const setup = await client.getBlock();
const quote = (
  await client.simulateContract({
    address: CONTRACTS.quoter,
    abi: QUOTER_ABI,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: TOKENS.WETH.address,
        tokenOut: TOKENS.USDC.address,
        amountIn: parseUnits("0.04", 18),
        fee: 500,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })
).result[0];
const minimum = (quote * 9950n) / 10000n;
const prices = await verifier.prices(setup.number!, setup.timestamp);
const estimate = (gas: bigint) =>
  formatUnits(gasToUsdcRaw(gas * gasPrice, prices.eth, prices.usdc), 6);
let snapshot = await rpc("evm_snapshot");
const directory = mkdtempSync(join(tmpdir(), "swapguard-rpc-agent-"));
const policies: AgentPolicy[] = ["per-attempt", "cumulative", "swapguard-mcp"];
const scenarios = [
  { id: "normal", budget: "3", retry: false, estimate: 200_000n },
  { id: "tight-retry", budget: "0.6", retry: true, estimate: 200_000n },
  { id: "affordable-retry", budget: "3", retry: true, estimate: 200_000n },
  {
    id: "underestimated-cost",
    budget: "0.35",
    retry: false,
    estimate: 50_000n,
  },
];
const startedAt = new Date().toISOString();
const runs: any[] = [];
for (const scenario of scenarios)
  for (const policy of policies) {
    assert.equal(await rpc("evm_revert", [snapshot]), true);
    snapshot = await rpc("evm_snapshot");
    chainTime = Number(setup.timestamp);
    const taskId = `${scenario.id}-${policy}`;
    const terms: TaskTerms = {
      taskId,
      amountWeth: "0.04",
      initialQuoteUsdc: formatUnits(quote, 6),
      minimumOutputUsdc: formatUnits(minimum, 6),
      gasBudgetUsdc: scenario.budget,
      maxAttempts: 3,
      expiresAtMs: Date.now() + 180000,
      execution: { wallet, chainId: 31337 },
    };
    const anchor = await verifier.anchor(terms);
    // Baseline receipt expectations are NOT SwapGuard recommendations. They only
    // bind the selected operation for the same post-send verifier used by MCP.
    const expectation: AgentTask = {
      terms,
      receiptAnchor: anchor,
      checks: {},
      receipts: [],
      pending: null,
      events: [],
    };
    const calls: any[] = [],
      receipts: any[] = [];
    let mcp: Client | undefined;
    const journal = join(directory, `${taskId}.jsonl`);
    const connect = async () => {
      const next = new Client({
        name: "swapguard-reference-execution-agent",
        version: "0.1.0",
      });
      await next.connect(
        new StdioClientTransport({
          command: process.execPath,
          args: [
            "--import",
            join(root, "node_modules/tsx/dist/loader.mjs"),
            join(root, "server/mcp.ts"),
          ],
          cwd: directory,
          env: {
            SWAPGUARD_LEDGER_PATH: journal,
            SWAPGUARD_VERIFY_RPC_URL: url,
            SWAPGUARD_VERIFY_CHAIN_ID: "31337",
          },
          stderr: "inherit",
        }),
      );
      assert.equal((await next.listTools()).tools.length, 5);
      return next;
    };
    const call = async (name: string, args: Record<string, unknown>) => {
      const response = await mcp!.callTool({ name, arguments: args });
      calls.push({
        name,
        input: args,
        isError: !!response.isError,
        output: response.structuredContent ?? response.content,
      });
      assert(
        !response.isError,
        `${name} failed: ${JSON.stringify(response.content)}`,
      );
      return response.structuredContent as AgentResult;
    };
    let latest: AgentResult | undefined,
      restarted = false;
    try {
      if (policy === "swapguard-mcp") {
        mcp = await connect();
        latest = await call("swapguard_open_task", terms);
        expectation.receiptAnchor = latest.receiptVerification!.anchor!;
      }
      const candidate = (
        attemptId: string,
        kind: "approval" | "swap",
        gas: bigint,
        gasLimit: bigint,
      ): Candidate => ({
        attemptId,
        kind,
        estimateUsdc: estimate(gas),
        gasLimit,
        minimumUsdc: terms.minimumOutputUsdc,
        quoteUsdc: terms.initialQuoteUsdc,
      });
      const candidates = [
        candidate("approve", "approval", 50_000n, 100_000n),
        ...(scenario.retry
          ? [candidate("swap-1", "swap", 80_000n, 80_000n)]
          : []),
        candidate(
          scenario.retry ? "swap-2" : "swap-1",
          "swap",
          scenario.estimate,
          500_000n,
        ),
      ];
      const request = (c: Candidate): Attempt => ({
        taskId,
        attemptId: c.attemptId,
        kind: c.kind,
        amountWeth: terms.amountWeth,
        quotedOutputUsdc: c.quoteUsdc,
        transactionMinimumUsdc: c.minimumUsdc,
        estimatedGasUsdc: c.estimateUsdc,
        quoteAtMs: Date.now(),
      });
      const result = await runReferenceAgent({
        policy,
        budgetUsdc: scenario.budget,
        minimumUsdc: terms.minimumOutputUsdc,
        deadlineMs: terms.expiresAtMs,
        candidates,
        assess: async (c) => {
          latest = await call("swapguard_assess_attempt", request(c));
          return latest.decision === "ADVISORY_READY";
        },
        execute: async (c) => {
          expectation.checks[c.attemptId] = {
            input: request(c),
            outcome: "ADVISORY_READY",
            reason:
              "Baseline selected-operation expectation; not an MCP recommendation.",
          };
          const swap = encodeFunctionData({
            abi: SWAP_ABI,
            functionName: "exactInputSingle",
            args: [
              {
                tokenIn: TOKENS.WETH.address,
                tokenOut: TOKENS.USDC.address,
                fee: 500,
                recipient: wallet,
                amountIn: parseUnits("0.04", 18),
                amountOutMinimum: minimum,
                sqrtPriceLimitX96: 0n,
              },
            ],
          });
          const data =
            c.kind === "approval"
              ? encodeFunctionData({
                  abi: erc20Abi,
                  functionName: "approve",
                  args: [CONTRACTS.router, parseUnits("0.04", 18)],
                })
              : encodeFunctionData({
                  abi: DEADLINE_ABI,
                  functionName: "multicall",
                  args: [
                    BigInt(expectation.receiptAnchor!.deadlineSeconds),
                    [swap],
                  ],
                });
          const hash = await send(
            c.kind === "approval" ? TOKENS.WETH.address : CONTRACTS.router,
            data,
            c.gasLimit,
          );
          const verified = await verifier.verify(expectation, {
            taskId,
            attemptId: c.attemptId,
            transactionHash: hash,
          });
          if (mcp) {
            latest = await call("swapguard_verify_receipt", {
              taskId,
              attemptId: c.attemptId,
              transactionHash: hash,
            });
            const recorded = latest.events.find(
              (e) => e.receipt?.attemptId === c.attemptId,
            )!.receipt!;
            assert.equal(recorded.gasCostUsdc, verified.input.gasCostUsdc);
            assert.equal(recorded.outputUsdc, verified.input.outputUsdc);
            assert(recorded.verification);
            // One restart between failure and next decision, with no budget reset.
            if (
              scenario.id === "affordable-retry" &&
              verified.input.status === "reverted"
            ) {
              const spent = latest.spentGasUsdc;
              await mcp.close();
              mcp = await connect();
              restarted = true;
              latest = await call("swapguard_get_task", { taskId });
              assert.equal(latest.spentGasUsdc, spent);
            }
          }
          receipts.push({
            kind: c.kind,
            ...verified.input,
            verification: verified.proof,
          });
          return verified.input;
        },
      });
      if (mcp) latest = await call("swapguard_get_task", { taskId });
      const completed = result.output !== null,
        overBudget = result.spent > parseUnits(scenario.budget, 6);
      const floorBreach = completed && parseUnits(result.output!, 6) < minimum;
      const gasOf = (filter: (r: any) => boolean) =>
        formatUnits(
          receipts
            .filter(filter)
            .reduce((n, r) => n + parseUnits(r.gasCostUsdc, 6), 0n),
          6,
        );
      runs.push({
        scenario: scenario.id,
        policy,
        terms,
        anchor: expectation.receiptAnchor,
        candidates,
        events: result.events,
        receipts,
        completed,
        compliantCompleted: completed && !overBudget && !floorBreach,
        overBudget,
        floorBreach,
        swapAttempts: result.swaps,
        gasCostUsdc: formatUnits(result.spent, 6),
        gasCostWei: receipts
          .reduce((n, r) => n + BigInt(r.verification.gasCostWei), 0n)
          .toString(),
        grossOutputUsdc: result.output,
        netOutputAfterGasUsdc:
          result.output === null
            ? null
            : formatUnits(parseUnits(result.output, 6) - result.spent, 6),
        gasBreakdownUsdc: {
          approvals: gasOf((r) => r.kind === "approval"),
          failedSwaps: gasOf(
            (r) => r.kind === "swap" && r.status === "reverted",
          ),
          successfulSwaps: gasOf(
            (r) => r.kind === "swap" && r.status === "success",
          ),
        },
        calls,
        restarted,
        finalReport: latest ?? null,
        journal: mcp
          ? readFileSync(journal, "utf8")
              .trim()
              .split("\n")
              .map((line) => JSON.parse(line))
          : null,
      });
      console.log(
        `${taskId}: completed=${completed} overBudget=${overBudget} gas=${formatUnits(result.spent, 6)}`,
      );
    } finally {
      await mcp?.close();
    }
  }
const summary = policies.map((policy) => {
  const rows = runs.filter((r) => r.policy === policy);
  return {
    policy,
    tasks: rows.length,
    completed: rows.filter((r) => r.completed).length,
    compliantCompleted: rows.filter((r) => r.compliantCompleted).length,
    uncompleted: rows.filter((r) => !r.completed).length,
    overBudget: rows.filter((r) => r.overBudget).length,
    swapAttempts: rows.reduce((n, r) => n + r.swapAttempts, 0),
    revertedSwaps: rows
      .flatMap((r) => r.receipts)
      .filter((r) => r.kind === "swap" && r.status === "reverted").length,
    gasCostUsdc: formatUnits(
      rows.reduce((n, r) => n + parseUnits(r.gasCostUsdc, 6), 0n),
      6,
    ),
    gasCostWei: rows.reduce((n, r) => n + BigInt(r.gasCostWei), 0n).toString(),
  };
});
const limitations = [
  "Project-authored deterministic reference agent, not an LLM or third-party agent integration.",
  "Real local EVM execution on a pinned mainnet fork; fake inventory, fixed gas price, injected out-of-gas faults. No public-chain transactions or observed market trace.",
  "Four hand-designed cases, not a statistical savings estimate. Cumulative baseline is an equally constrained control. Report completion differences alongside cost.",
  "RPC provider trust, not cryptographic inclusion proof; no continuous reorg monitoring or wallet-level budget enforcement. Gas estimates may understate actual cost.",
  "Setup inventory, RPC/agent operating costs and future revocations excluded; approval and failed/successful swap gas included. Net output is not investment P&L.",
  "The Graph remains a candidate, not an implemented integration.",
];
const sourceFiles = [
  "experiments/AGENT_RPC_PROTOCOL.md",
  "scripts/record-rpc-agent-evidence.ts",
  "server/reference-swap-agent.ts",
  "server/receipt-verifier.ts",
  "server/mcp.ts",
  "server/agent-journal.ts",
  "src/lib/agent-ledger.ts",
  "src/lib/receipt-proof.ts",
  "src/lib/contracts.ts",
  "src/lib/protection.ts",
  "package.json",
  "package-lock.json",
];
const sha = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const sources = Object.fromEntries(
  sourceFiles.map((p) => [p, sha(readFileSync(join(root, p)))]),
);
const data = {
  schemaVersion: "swapguard-rpc-agent-evidence-v1",
  runId,
  startedAt,
  completedAt: new Date().toISOString(),
  environment: {
    runtime,
    chainId: 31337,
    forkBlock: blockNumber.toString(),
    forkBlockHash: blockHash,
    upstreamReadProvider: "eth.drpc.org",
    wallet,
    resetSnapshotBetweenEveryCaseAndPolicy: true,
    gasPriceWei: gasPrice.toString(),
    setupExcluded: true,
  },
  initialQuoteUsdc: formatUnits(quote, 6),
  minimumOutputUsdc: formatUnits(minimum, 6),
  protocolSha256: sources["experiments/AGENT_RPC_PROTOCOL.md"],
  limitations,
  summary,
  runs,
};
const json =
  JSON.stringify(
    data,
    (_, v) => (typeof v === "bigint" ? v.toString() : v),
    2,
  ) + "\n";
const manifest = {
  schemaVersion: "swapguard-rpc-agent-manifest-v1",
  runId,
  generatedAt: data.completedAt,
  sourceBaseCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  sourceSha256: sources,
  artifact: {
    path: `/evidence/${runId}.json`,
    sha256: sha(json),
    bytes: Buffer.byteLength(json),
  },
  summary,
  limitations,
};
const md = `# SwapGuard: receipt-verified reference agent\n\nRun: ${runId}\n\n${limitations.map((s) => `- ${s}`).join("\n")}\n\n| Policy | Completed | Within constraints | Over budget | Total gas USDC-eq |\n|---|---:|---:|---:|---:|\n${summary.map((r) => `| ${r.policy} | ${r.completed}/${r.tasks} | ${r.compliantCompleted}/${r.tasks} | ${r.overBudget}/${r.tasks} | ${r.gasCostUsdc} |`).join("\n")}\n\n## Per-case observations\n\n| Case | Policy | Completed | Over budget | Gas USDC-eq | Gross USDC | Net after gas |\n|---|---|---|---|---:|---:|---:|\n${runs.map((r) => `| ${r.scenario} | ${r.policy} | ${r.completed} | ${r.overBudget} | ${r.gasCostUsdc} | ${r.grossOutputUsdc ?? "No completed swap"} | ${r.netOutputAfterGasUsdc ?? "Not calculated"} |`).join("\n")}\n\n[Full calls, receipts and journal](/evidence/${runId}.json) · [Source and artifact SHA-256](/evidence/${runId}.manifest.json)\n`;
writeFileSync(paths[0], json, { flag: "wx" });
writeFileSync(paths[1], JSON.stringify(manifest, null, 2) + "\n", {
  flag: "wx",
});
writeFileSync(paths[2], md, { flag: "wx" });
console.log(JSON.stringify(summary, null, 2));
