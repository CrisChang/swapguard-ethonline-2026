/** Advisory accounting for caller-reported WETH -> USDC tasks. No RPC or signer. */
import { z } from "zod";
import { formatUnits, parseUnits } from "viem";
import {
  executionSchema,
  type TrustedReceiptContext,
  type ReceiptProof,
} from "./receipt-proof";

const id = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const money = z.string().regex(/^(?:0|[1-9]\d{0,8})(?:\.\d{1,6})?$/);
const positiveMoney = money.refine((v) => parseUnits(v, 6) > 0n);
const amount = z
  .string()
  .regex(/^(?:0|[1-9]\d{0,3})(?:\.\d{1,18})?$/)
  .refine((v) => parseUnits(v, 18) > 0n);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const openTaskSchema = z
  .object({
    taskId: id,
    amountWeth: amount,
    initialQuoteUsdc: positiveMoney,
    minimumOutputUsdc: positiveMoney,
    gasBudgetUsdc: positiveMoney,
    maxAttempts: z.number().int().min(1).max(3),
    expiresAtMs: timestamp,
    execution: executionSchema.optional(),
  })
  .strict();
export const assessAttemptSchema = z
  .object({
    taskId: id,
    attemptId: id,
    kind: z.enum(["approval", "swap"]),
    amountWeth: amount,
    quotedOutputUsdc: positiveMoney,
    transactionMinimumUsdc: positiveMoney,
    estimatedGasUsdc: positiveMoney,
    quoteAtMs: timestamp,
  })
  .strict();
export const recordReceiptSchema = z
  .object({
    taskId: id,
    attemptId: id,
    receiptId: id,
    status: z.enum(["success", "reverted"]),
    gasCostUsdc: money,
    outputUsdc: money,
  })
  .strict();
export const getTaskSchema = z.object({ taskId: id }).strict();
export const toolSchemas = {
  swapguard_open_task: openTaskSchema,
  swapguard_assess_attempt: assessAttemptSchema,
  swapguard_record_receipt: recordReceiptSchema,
  swapguard_get_task: getTaskSchema,
};
export type ToolName = keyof typeof toolSchemas;
export type TaskTerms = z.infer<typeof openTaskSchema>;
export type Attempt = z.infer<typeof assessAttemptSchema>;
export type ReportedReceipt = z.infer<typeof recordReceiptSchema> & {
  verification?: ReceiptProof;
};
export type Outcome = "ADVISORY_READY" | "WAIT" | "STOP" | "REJECT";
export type LedgerEvent = {
  atMs: number;
  type: string;
  reason: string;
  attemptId?: string;
  receipt?: ReportedReceipt;
};
export type AgentTask = {
  terms: TaskTerms;
  checks: Record<string, { input: Attempt; outcome: Outcome; reason: string }>;
  receipts: ReportedReceipt[];
  pending: Attempt | null;
  events: LedgerEvent[];
  receiptAnchor?: TrustedReceiptContext["anchor"];
};
export type AgentState = { tasks: Record<string, AgentTask> };
export const emptyAgentState = (): AgentState => ({ tasks: {} });
const raw = (value: string) => parseUnits(value, 6);
const display = (value: bigint) => formatUnits(value, 6);
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const owns = (object: object, key: string) => Object.hasOwn(object, key);
const sumGas = (receipts: ReportedReceipt[]) =>
  receipts.reduce((sum, r) => sum + raw(r.gasCostUsdc), 0n);
function taskFor(state: AgentState, taskId: string) {
  if (!owns(state.tasks, taskId))
    throw new Error("Task not found. Create explicit task terms first.");
  return state.tasks[taskId];
}
function facts(task: AgentTask, now: number) {
  const spent = sumGas(task.receipts);
  const swaps = Object.values(task.checks).filter(
    (c) => c.outcome === "ADVISORY_READY" && c.input.kind === "swap",
  );
  const completed = task.receipts.find(
    (r) =>
      r.status === "success" && task.checks[r.attemptId].input.kind === "swap",
  );
  const floorBreach =
    !!completed &&
    raw(completed.outputUsdc) < raw(task.terms.minimumOutputUsdc);
  const attemptFloorBreach =
    !!completed &&
    raw(completed.outputUsdc) <
      raw(task.checks[completed.attemptId].input.transactionMinimumUsdc);
  const budgetBreach = spent > raw(task.terms.gasBudgetUsdc);
  const expired = now >= task.terms.expiresAtMs;
  const attemptLimit = swaps.length >= task.terms.maxAttempts;
  const status = task.pending
    ? "awaiting_reported_receipt"
    : budgetBreach || floorBreach || attemptFloorBreach
      ? "constraint_breach"
      : completed
        ? "completed_reported"
        : expired || attemptLimit
          ? "stopped"
          : "open";
  return {
    spent,
    swaps,
    completed,
    floorBreach,
    attemptFloorBreach,
    budgetBreach,
    expired,
    attemptLimit,
    status,
  };
}
export function agentReport(task: AgentTask, now: number) {
  const f = facts(task, now);
  const approvals = task.receipts.filter(
    (r) => task.checks[r.attemptId].input.kind === "approval",
  );
  const failedSwaps = task.receipts.filter(
    (r) =>
      task.checks[r.attemptId].input.kind === "swap" && r.status === "reverted",
  );
  const successfulSwaps = task.receipts.filter(
    (r) =>
      task.checks[r.attemptId].input.kind === "swap" && r.status === "success",
  );
  return {
    schemaVersion: "swapguard-agent-ledger-v1",
    evidence:
      task.receipts.length && task.receipts.every((r) => r.verification)
        ? "rpc-verified-receipts"
        : task.receipts.some((r) => r.verification)
          ? "mixed-verified-and-reported"
          : "caller-reported-unverified",
    advisoryOnly: true,
    scope: task.terms.execution
      ? "Bound Ethereum WETH -> USDC task; optional RPC receipt reconciliation for exact WETH approval and deadline-bound single-hop SwapRouter02 calls. Estimates remain caller-supplied."
      : "Ethereum WETH -> USDC; caller-supplied observations, not a router integration or calldata validation",
    taskId: task.terms.taskId,
    terms: { ...task.terms },
    status: f.status,
    expired: f.expired,
    budgetBreach: f.budgetBreach,
    floorBreach: f.floorBreach,
    attemptFloorBreach: f.attemptFloorBreach,
    swapAttempts: f.swaps.length,
    pendingAttemptId: task.pending?.attemptId ?? null,
    pendingEstimatedGasUsdc: task.pending?.estimatedGasUsdc ?? null,
    spentGasUsdc: display(f.spent),
    remainingGasBudgetUsdc: display(raw(task.terms.gasBudgetUsdc) - f.spent),
    // These three categories are disjoint. Failed approvals are in approvals only.
    gasBreakdownUsdc: {
      approvals: display(sumGas(approvals)),
      failedSwaps: display(sumGas(failedSwaps)),
      successfulSwaps: display(sumGas(successfulSwaps)),
    },
    grossOutputUsdc: f.completed?.outputUsdc ?? null,
    netOutputAfterGasUsdc: f.completed
      ? display(raw(f.completed.outputUsdc) - f.spent)
      : null,
    outputDifferenceFromInitialQuoteUsdc: f.completed
      ? display(raw(f.completed.outputUsdc) - raw(task.terms.initialQuoteUsdc))
      : null,
    interpretation:
      "Output minus task gas is not investment P&L. Quote difference is not pure slippage. Pool fees are already in quotes/output. No completed swap means output and net output are null, not zero-cost success.",
    notChecked: task.terms.execution
      ? [
          "cryptographic receipt inclusion proof",
          "caller-reported receipts and estimates",
          "wallet consent or signing authority",
          "pre-send simulation or balance/allowance",
          "continuous finality/reorg monitoring",
          "gas-budget enforcement by the wallet",
        ]
      : [
          "receipt authenticity",
          "gas conversion inputs",
          "calldata",
          "wallet consent",
          "nonce",
          "balance/allowance",
          "execution/finality/reorgs",
        ],
    attemptChecks: structuredClone(Object.values(task.checks)),
    events: structuredClone(task.events),
    ...(task.terms.execution
      ? {
          receiptVerification: {
            verifiedCount: task.receipts.filter((r) => r.verification).length,
            unverifiedCount: task.receipts.filter((r) => !r.verification)
              .length,
            anchor: task.receiptAnchor ?? null,
            boundary:
              "RPC-provider trust, not cryptographic receipt inclusion proof. No signer authorization or continuous reorg monitoring. Legacy reported receipts remain unverified.",
          },
        }
      : {}),
  };
}
export type AgentResult = ReturnType<typeof agentReport> & {
  decision?: Outcome;
  reason?: string;
  duplicate?: boolean;
};

/** Mutates a private transaction copy; callers persist before returning success. */
export function applyAgentTool(
  state: AgentState,
  tool: ToolName,
  input: unknown,
  now: number,
  trusted: TrustedReceiptContext = {},
): AgentResult {
  timestamp.parse(now);
  if (tool === "swapguard_open_task") {
    const terms = openTaskSchema.parse(input);
    if (owns(state.tasks, terms.taskId)) {
      const old = state.tasks[terms.taskId];
      if (!same(old.terms, terms))
        throw new Error(
          "Task terms are immutable. Existing budget, floor and spent costs cannot be reset.",
        );
      return { ...agentReport(old, now), duplicate: true };
    }
    if (["__proto__", "constructor", "prototype"].includes(terms.taskId))
      throw new Error("Reserved task identifier.");
    if (Object.keys(state.tasks).length >= 100)
      throw new Error(
        "Local prototype task limit reached (100). Archive the journal explicitly; do not reset an active budget.",
      );
    if (terms.expiresAtMs <= now || terms.expiresAtMs > now + 86_400_000)
      throw new Error("Deadline must be in the next 24 hours.");
    if (raw(terms.minimumOutputUsdc) > raw(terms.initialQuoteUsdc))
      throw new Error("Initial quote must meet the minimum output.");
    const task: AgentTask = {
      terms,
      checks: {},
      receipts: [],
      pending: null,
      events: [
        {
          atMs: now,
          type: "task_opened",
          reason:
            "Original terms recorded; this is not authenticated wallet consent.",
        },
      ],
      ...(trusted.anchor ? { receiptAnchor: trusted.anchor } : {}),
    };
    state.tasks[terms.taskId] = task;
    return agentReport(task, now);
  }
  if (tool === "swapguard_get_task")
    return agentReport(taskFor(state, getTaskSchema.parse(input).taskId), now);
  if (tool === "swapguard_assess_attempt") {
    const request = assessAttemptSchema.parse(input);
    if (["__proto__", "constructor", "prototype"].includes(request.attemptId))
      throw new Error("Reserved attempt identifier.");
    const task = taskFor(state, request.taskId);
    if (owns(task.checks, request.attemptId)) {
      const old = task.checks[request.attemptId];
      if (!same(old.input, request))
        throw new Error(
          "Attempt identifier already used with different inputs.",
        );
      return {
        ...agentReport(task, now),
        decision: "REJECT",
        reason:
          "Duplicate attempt: inspect the existing receipt/pending state; never resend based on a cached readiness result.",
        duplicate: true,
      };
    }
    if (Object.keys(task.checks).length >= 100)
      throw new Error("Task observation limit reached (100).");
    const f = facts(task, now);
    let decision: Outcome = "ADVISORY_READY",
      reason =
        "Reported quote and estimated operation gas fit the recorded task. Not authorization to sign or send.";
    if (task.pending) {
      decision = "WAIT";
      reason =
        "A prior operation has no reported receipt. Do not send a duplicate.";
    } else if (
      f.budgetBreach ||
      f.floorBreach ||
      f.completed ||
      f.expired ||
      f.attemptLimit ||
      f.spent >= raw(task.terms.gasBudgetUsdc)
    ) {
      decision = "STOP";
      reason =
        "Task completed, expired, exhausted its limit, or has a recorded constraint breach.";
    } else if (
      parseUnits(request.amountWeth, 18) !==
        parseUnits(task.terms.amountWeth, 18) ||
      raw(request.transactionMinimumUsdc) < raw(task.terms.minimumOutputUsdc)
    ) {
      decision = "REJECT";
      reason =
        "Reported amount or minimum would weaken/change the original task terms.";
    } else if (
      request.quoteAtMs > now + 5_000 ||
      now - request.quoteAtMs > 60_000
    ) {
      decision = "WAIT";
      reason =
        "Quote timestamp is stale or in the future; obtain a fresh observation.";
    } else if (
      raw(request.quotedOutputUsdc) < raw(request.transactionMinimumUsdc)
    ) {
      decision = "WAIT";
      reason = "Reported quote does not meet the required output floor.";
    } else if (
      f.spent + raw(request.estimatedGasUsdc) >
      raw(task.terms.gasBudgetUsdc)
    ) {
      decision = "WAIT";
      reason =
        "Spent gas plus this operation's estimate exceeds the original gas budget.";
    }
    // Approval retry count is separately bounded to avoid unlimited free reported attempts.
    else if (
      request.kind === "approval" &&
      Object.values(task.checks).filter(
        (c) => c.input.kind === "approval" && c.outcome === "ADVISORY_READY",
      ).length >= 3
    ) {
      decision = "STOP";
      reason = "Approval attempt limit reached.";
    }
    task.checks[request.attemptId] = {
      input: request,
      outcome: decision,
      reason,
    };
    if (decision === "ADVISORY_READY") task.pending = request;
    task.events.push({
      atMs: now,
      type: decision,
      reason,
      attemptId: request.attemptId,
    });
    return { ...agentReport(task, now), decision, reason };
  }
  if (tool === "swapguard_record_receipt") {
    const receipt: ReportedReceipt = recordReceiptSchema.parse(input);
    const task = taskFor(state, receipt.taskId);
    const duplicate = task.receipts.find(
      (r) =>
        r.attemptId === receipt.attemptId || r.receiptId === receipt.receiptId,
    );
    if (duplicate) {
      const { verification, ...previousInput } = duplicate;
      if (!same(previousInput, receipt))
        throw new Error(
          "Conflicting duplicate receipt; original record retained.",
        );
      return { ...agentReport(task, now), duplicate: true };
    }
    if (
      Object.values(state.tasks).some((t) =>
        t.receipts.some((r) => r.receiptId === receipt.receiptId),
      )
    )
      throw new Error("Receipt identifier already recorded for another task.");
    if (task.pending?.attemptId !== receipt.attemptId)
      throw new Error("Receipt must match the pending operation.");
    if (
      (task.pending.kind === "approval" || receipt.status === "reverted") &&
      raw(receipt.outputUsdc) !== 0n
    )
      throw new Error("Approval/reverted operation cannot report swap output.");
    if (trusted.receiptProof) receipt.verification = trusted.receiptProof;
    task.receipts.push(receipt);
    task.pending = null;
    task.events.push({
      atMs: now,
      type: receipt.verification ? "rpc_verified_receipt" : "reported_receipt",
      reason: receipt.verification
        ? "Status, gas, transfer logs and supported calldata read and checked via configured RPC; provider trust applies. No signing authority."
        : "Caller-reported costs charged once; not independently verified onchain.",
      attemptId: receipt.attemptId,
      receipt,
    });
    // Even a late/over-budget/below-floor receipt must remain in the ledger.
    return agentReport(task, now);
  }
  throw new Error("Unknown tool.");
}

export const toolDescriptions: Record<ToolName, string> = {
  swapguard_open_task:
    "Record immutable WETH -> USDC task terms in a local advisory ledger. Ask the user for their intended minimum and gas budget. A new task ID is a separate budget, not a legitimate way to reset an existing task. No authenticated consent or execution.",
  swapguard_assess_attempt:
    "Check caller-reported quote/minimum and estimated operation gas. ADVISORY_READY reserves one pending operation; it is not signing permission. Caller must independently validate the exact calldata, wallet state and fresh gas estimate. All inputs are unverified. Recheck after an approval receipt before a swap.",
  swapguard_record_receipt:
    "Record a caller-reported, UNVERIFIED receipt for a pending attempt. Costs are decimal USDC-equivalent already converted by the caller, not raw ETH or wei. Include reverted gas. Never invent a receipt to clear pending state. Exact duplicates charge once; conflicts fail.",
  swapguard_get_task:
    "Read task terms, pending state, gas breakdown, remaining budget, output and event history. Distinguishes RPC-verified receipts from unverified caller reports. This read itself does not refresh RPC/finality; net output is not investment P&L.",
};
