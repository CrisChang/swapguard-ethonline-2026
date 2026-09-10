import { describe, expect, it, vi } from "vitest";
import {
  encodeFunctionData,
  encodeEventTopics,
  encodeAbiParameters,
  erc20Abi,
  parseUnits,
  type Hex,
} from "viem";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ReceiptVerifier,
  gasToUsdcRaw,
  verifyReceiptSchema,
} from "../server/receipt-verifier";
import { AgentJournal } from "../server/agent-journal";
import { TOKENS, CONTRACTS } from "../src/lib/contracts";
import { SWAP_ABI, DEADLINE_ABI } from "../src/lib/protection";
import {
  recordReceiptSchema,
  type AgentTask,
  type TaskTerms,
} from "../src/lib/agent-ledger";

const wallet = "0x1111111111111111111111111111111111111111";
const other = "0x2222222222222222222222222222222222222222";
const hash = `0x${"ab".repeat(32)}` as Hex,
  blockHash = `0x${"cd".repeat(32)}` as Hex,
  anchorHash = `0x${"ef".repeat(32)}` as Hex;
const now = 1800000000000;
const terms: TaskTerms = {
  taskId: "verified",
  amountWeth: "0.04",
  initialQuoteUsdc: "100",
  minimumOutputUsdc: "99.5",
  gasBudgetUsdc: "3",
  maxAttempts: 3,
  expiresAtMs: now + 180000,
  execution: { chainId: 31337, wallet },
};
const params = {
  tokenIn: TOKENS.WETH.address,
  tokenOut: TOKENS.USDC.address,
  fee: 500,
  recipient: wallet,
  amountIn: parseUnits("0.04", 18),
  amountOutMinimum: 99500000n,
  sqrtPriceLimitX96: 0n,
} as const;
const swapData = (overrides = {}, deadline = 1180n) =>
  encodeFunctionData({
    abi: DEADLINE_ABI,
    functionName: "multicall",
    args: [
      deadline,
      [
        encodeFunctionData({
          abi: SWAP_ABI,
          functionName: "exactInputSingle",
          args: [{ ...params, ...overrides }],
        }),
      ],
    ],
  });
const event = (token: Hex, from: Hex, to: Hex, value: bigint) => ({
  address: token,
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  topics: encodeEventTopics({
    abi: erc20Abi,
    eventName: "Transfer",
    args: { from, to },
  }),
});
function fixture(approval = false) {
  const attempt = {
    taskId: "verified",
    attemptId: "attempt",
    kind: approval ? ("approval" as const) : ("swap" as const),
    amountWeth: "0.04",
    quotedOutputUsdc: "100",
    transactionMinimumUsdc: "99.5",
    estimatedGasUsdc: "1",
    quoteAtMs: now,
  };
  const task: AgentTask = {
    terms,
    receiptAnchor: {
      blockNumber: "10",
      blockHash: anchorHash,
      deadlineSeconds: 1180,
    },
    pending: attempt,
    checks: {
      attempt: { input: attempt, outcome: "ADVISORY_READY", reason: "fixture" },
    },
    receipts: [],
    events: [],
  };
  const tx: any = {
    hash,
    from: wallet,
    to: approval ? TOKENS.WETH.address : CONTRACTS.router,
    value: 0n,
    type: "legacy",
    blockHash,
    blockNumber: 11n,
    input: approval
      ? encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [CONTRACTS.router, params.amountIn],
        })
      : swapData(),
  };
  const receipt: any = {
    transactionHash: hash,
    from: wallet,
    to: tx.to,
    blockHash,
    blockNumber: 11n,
    status: "success",
    gasUsed: 100000n,
    effectiveGasPrice: 1000000000n,
    logs: approval
      ? [
          {
            address: TOKENS.WETH.address,
            topics: encodeEventTopics({
              abi: erc20Abi,
              eventName: "Approval",
              args: { owner: wallet, spender: CONTRACTS.router },
            }),
            data: encodeAbiParameters([{ type: "uint256" }], [params.amountIn]),
          },
        ]
      : [
          event(TOKENS.WETH.address, wallet, other, params.amountIn),
          event(TOKENS.USDC.address, other, wallet, 100000000n),
        ],
  };
  const rpc: any = {
    getChainId: vi.fn(async () => 31337),
    getTransaction: vi.fn(async () => tx),
    getTransactionReceipt: vi.fn(async () => receipt),
    getBlock: vi.fn(async ({ blockNumber }: any = {}) => ({
      number: blockNumber ?? 10n,
      hash: blockNumber === 11n ? blockHash : anchorHash,
      timestamp: 1001n,
    })),
    getBlockNumber: vi.fn(async () => 11n),
    readContract: vi.fn(async (r: any) =>
      r.functionName === "decimals"
        ? 8
        : [
            1n,
            r.address === CONTRACTS.ethUsd ? 250000000000n : 100000000n,
            900n,
            900n,
            1n,
          ],
    ),
  };
  const verifier = new ReceiptVerifier("http://127.0.0.1:18546", 31337, 1, rpc);
  const verify = () =>
    verifier.verify(task, {
      taskId: "verified",
      attemptId: "attempt",
      transactionHash: hash,
    });
  return { task, tx, receipt, rpc, verifier, verify, attempt };
}
describe("RPC receipt verifier: independent values, strict supported adapter", () => {
  it("derives swap output and actual gas, ignoring the one-USDC estimate", async () => {
    const f = fixture(),
      result = await f.verify();
    expect(result.input.gasCostUsdc).toBe("0.25");
    expect(result.input.outputUsdc).toBe("100");
    expect(result.proof.gasCostWei).toBe("100000000000000");
    expect(result.proof.kind).toBe("rpc-local-fork");
    expect(
      f.rpc.readContract.mock.calls.every(
        ([r]: any[]) => r.blockNumber === 11n,
      ),
    ).toBe(true);
  });
  it("subtracts recipient USDC outflow instead of counting only inflows", async () => {
    const f = fixture();
    f.receipt.logs.push(event(TOKENS.USDC.address, wallet, other, 100000n));
    expect((await f.verify()).input.outputUsdc).toBe("99.9");
  });
  it("charges reverted transaction gas and never fabricates swap output", async () => {
    const f = fixture();
    f.receipt.status = "reverted";
    f.receipt.logs = [];
    expect((await f.verify()).input).toMatchObject({
      status: "reverted",
      gasCostUsdc: "0.25",
      outputUsdc: "0",
    });
  });
  it("checks exact approval and requires its matching event", async () => {
    const f = fixture(true);
    expect((await f.verify()).input.outputUsdc).toBe("0");
    f.receipt.logs = [];
    await expect(f.verify()).rejects.toThrow(/Approval event/);
  });
  it.each([
    ["amount", { amountIn: 1n }],
    ["minimum", { amountOutMinimum: 99000000n }],
    ["recipient", { recipient: other }],
    ["token", { tokenOut: TOKENS.WETH.address }],
    ["fee", { fee: 100 }],
    ["price limit", { sqrtPriceLimitX96: 1n }],
  ])("rejects mismatched %s", async (_, change) => {
    const f = fixture();
    f.tx.input = swapData(change);
    await expect(f.verify()).rejects.toThrow();
  });
  it("rejects deadlines later than original anchored terms", async () => {
    const f = fixture();
    f.tx.input = swapData({}, 1181n);
    await expect(f.verify()).rejects.toThrow(/deadline/);
  });
  it.each([
    [
      "wrong wallet",
      (f: any) => {
        f.tx.from = other;
      },
    ],
    [
      "wrong chain",
      (f: any) => {
        f.rpc.getChainId.mockResolvedValue(1);
      },
    ],
    [
      "wrong transaction",
      (f: any) => {
        f.receipt.transactionHash = anchorHash;
      },
    ],
    [
      "receipt predates task",
      (f: any) => {
        f.task.receiptAnchor.blockNumber = "11";
      },
    ],
    [
      "unconfirmed",
      (f: any) => {
        f.rpc.getBlockNumber.mockResolvedValue(10n);
      },
    ],
    [
      "canonical hash changed",
      (f: any) => {
        f.task.receiptAnchor.blockHash = hash;
      },
    ],
    [
      "missing output",
      (f: any) => {
        f.receipt.logs = [];
      },
    ],
    [
      "unsupported tx",
      (f: any) => {
        f.tx.type = "eip7702";
      },
    ],
    [
      "native value",
      (f: any) => {
        f.tx.value = 1n;
      },
    ],
    [
      "not assessed",
      (f: any) => {
        f.task.checks.attempt.outcome = "WAIT";
      },
    ],
    [
      "no binding",
      (f: any) => {
        f.task.terms = { ...terms, execution: undefined };
      },
    ],
  ])("fails closed: %s", async (_, change) => {
    const f = fixture();
    change(f);
    await expect(f.verify()).rejects.toThrow();
  });
  it("rejects a reorg during the verification reads", async () => {
    const f = fixture();
    let reads = 0;
    f.rpc.getBlock.mockImplementation(async ({ blockNumber }: any) => ({
      number: blockNumber,
      timestamp: 1001n,
      hash: blockNumber === 10n ? anchorHash : ++reads === 1 ? blockHash : hash,
    }));
    await expect(f.verify()).rejects.toThrow(/changed during/);
  });
  it.each([0n, -1n])("rejects invalid price %s", async (answer) => {
    const f = fixture();
    f.rpc.readContract.mockImplementation(async (r: any) =>
      r.functionName === "decimals" ? 8 : [1n, answer, 900n, 900n, 1n],
    );
    await expect(f.verify()).rejects.toThrow(/Price feed/);
  });
  it("rejects stale or incomplete feeds", async () => {
    const f = fixture();
    f.rpc.getBlock.mockImplementation(async ({ blockNumber }: any) => ({
      number: blockNumber,
      hash: blockNumber === 11n ? blockHash : anchorHash,
      timestamp: 5001n,
    }));
    await expect(f.verify()).rejects.toThrow(/stale/);
    f.rpc.readContract.mockImplementation(async (r: any) =>
      r.functionName === "decimals" ? 8 : [2n, 1n, 4900n, 4900n, 1n],
    );
    await expect(f.verify()).rejects.toThrow(/incomplete/);
  });
  it("accounts for both feed decimals, USDC depeg and conservative rounding", () => {
    expect(
      gasToUsdcRaw(
        100000000000000n,
        { answer: 250000000000n, decimals: 8 },
        { answer: 500000n, decimals: 6 },
      ),
    ).toBe(500000n);
    expect(
      gasToUsdcRaw(
        1n,
        { answer: 2500n, decimals: 0 },
        { answer: 1n, decimals: 0 },
      ),
    ).toBe(1n);
  });
  it("refuses caller-supplied cost or fabricated verification metadata", () => {
    expect(
      verifyReceiptSchema.safeParse({
        taskId: "verified",
        attemptId: "attempt",
        transactionHash: hash,
        gasCostUsdc: "0",
      }).success,
    ).toBe(false);
    expect(
      recordReceiptSchema.safeParse({
        taskId: "verified",
        attemptId: "attempt",
        receiptId: "r",
        status: "success",
        gasCostUsdc: "0",
        outputUsdc: "100",
        verification: { kind: "rpc-mainnet" },
      }).success,
    ).toBe(false);
  });
  it("restricts configured networks and confirmation thresholds", () => {
    expect(() => new ReceiptVerifier("http://example.com", 1)).toThrow();
    expect(() => new ReceiptVerifier("https://example.com", 1, 1)).toThrow();
    expect(() => new ReceiptVerifier("http://example.com", 31337)).toThrow();
  });
  it("preserves derived evidence through journal restart and charges duplicates once", async () => {
    const f = fixture(),
      verified = await f.verify();
    const file = join(
      mkdtempSync(join(tmpdir(), "swapguard-proof-test-")),
      "journal.jsonl",
    );
    let journal = new AgentJournal(file);
    try {
      journal.execute("swapguard_open_task", terms, now, {
        anchor: f.task.receiptAnchor,
      });
      journal.execute("swapguard_assess_attempt", f.attempt, now);
      journal.execute("swapguard_record_receipt", verified.input, now, {
        receiptProof: verified.proof,
      });
      journal.close();
      journal = new AgentJournal(file);
      const duplicate = journal.execute(
        "swapguard_record_receipt",
        verified.input,
        now,
        { receiptProof: verified.proof },
      );
      expect(duplicate.evidence).toBe("rpc-verified-receipts");
      expect(duplicate.spentGasUsdc).toBe("0.25");
      expect(duplicate.duplicate).toBe(true);
      expect(duplicate.receiptVerification?.verifiedCount).toBe(1);
    } finally {
      journal.close();
    }
  });
});
