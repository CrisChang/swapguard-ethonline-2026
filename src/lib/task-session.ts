/** Task workbench v1: deterministic replay only. No network or wallet adapter. */
import { keccak256, stringToHex, parseUnits } from "viem";
import calibration from "../../experiments/results/fork-25938600.json";
import {
  chooseAction,
  gasCost,
  PATHS,
  type Candidate,
  type Task,
  type Prices,
} from "./task-budget";
import { minimumFromQuote } from "./protection-math";
import { lockIntent, exampleDraft, verifyProtection } from "./protection";

export const CALIBRATION = calibration;
export const AMOUNTS = ["0.01", "0.04", "0.2"] as const;
export const STORAGE_KEY = "swapguard:task-workbench:v1";
export const SCENARIOS = [
  {
    id: "first-send-race",
    label: "Revert, then recover",
    detail:
      "An unseen execution-price change reverts the first swap; spent gas stays charged.",
  },
  {
    id: "gas-falls",
    label: "Gas becomes cheaper",
    detail:
      "Constructed gas prices fall over three observations; waiting can help.",
  },
  {
    id: "wait-misses-floor",
    label: "Waiting misses the floor",
    detail:
      "The quote falls below the original minimum. Non-completion is retained.",
  },
  {
    id: "gas-rises",
    label: "Waiting becomes expensive",
    detail:
      "Gas rises after the first observation. Waiting is not always beneficial.",
  },
  {
    id: "flat-cheap",
    label: "Stable conditions",
    detail: "An unchanged-price control with relatively cheap gas.",
  },
  {
    id: "gas-stays-high",
    label: "Gas stays expensive",
    detail: "The cost may never fit the budget. There is no guaranteed fill.",
  },
  {
    id: "price-improves",
    label: "A better later quote",
    detail: "A constructed improving-price path, not a price forecast.",
  },
  {
    id: "repeated-race",
    label: "Repeated reverts",
    detail:
      "Unseen price changes continue; the task stops at its limit or deadline.",
  },
  {
    id: "approval-gas-spike",
    label: "Gas rises after approval",
    detail:
      "After a successful approval, recheck the swap at a higher gas price before sending.",
  },
  {
    id: "rpc-unavailable",
    label: "Quote data unavailable",
    detail:
      "No usable observation: do not substitute a quote or send a transaction.",
  },
] as const;
export type Config = {
  amount: string;
  slippageBps: number;
  budget: string;
  costTarget: string;
  priority: "timely" | "cost";
  attempts: number;
  scenario: string;
  approved: boolean;
};
export const DEFAULT_CONFIG: Config = {
  amount: "0.04",
  slippageBps: 50,
  budget: "3",
  costTarget: "0.30",
  priority: "timely",
  attempts: 3,
  scenario: "first-send-race",
  approved: false,
};
export const PRICES: Prices = {
  eth: BigInt(calibration.feeds.ETH.answer),
  usdc: BigInt(calibration.feeds.USDC.answer),
};
const BASE_TIME = Number(calibration.fork.timestamp);
const SAMPLE_ACCOUNT = "0x1111111111111111111111111111111111111111";
export const wire = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ),
  );
const digest = (value: unknown) =>
  keccak256(stringToHex(JSON.stringify(wire(value))));

export type Receipt = {
  id: string;
  kind: "approval" | "swap";
  status: "success" | "reverted";
  gasUsed: bigint;
  gasPriceWei: bigint;
  output: bigint;
  evidence: "synthetic" | "local-fork";
};
export type Event = {
  sequence: number;
  second: number;
  type: string;
  detail: string;
  cost: bigint;
  remaining: bigint;
  receipt?: Receipt;
  operationId?: string;
  protection?: string;
};
export type Pending = {
  id: string;
  kind: "approval" | "swap";
  route: Candidate;
  gasPriceWei: bigint;
  estimatedCost: bigint;
  envelope?: ReturnType<typeof exampleDraft>;
  protection?: ReturnType<typeof verifyProtection>;
};
export type Session = {
  version: "task-workbench-v1";
  id: string;
  config: Config;
  task: Task;
  initialQuote: bigint;
  routes: Candidate[];
  intentHash: string;
  step: number;
  approved: boolean;
  attempts: number;
  approvalAttempts: number;
  spent: bigint;
  approvalCost: bigint;
  failedCost: bigint;
  phase: "ready" | "awaiting_receipt" | "completed" | "stopped";
  reason: string;
  output: bigint | null;
  pending: Pending | null;
  events: Event[];
  completedAt: number | null;
  commands: ("next" | "receipt" | "stop")[];
  budgetBreach: boolean;
  floorBreach: boolean;
};

function money(value: string) {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d{0,3})(?:\.\d{1,6})?$/.test(value)
  )
    throw new Error(
      "Enter a positive cost in USDC-equivalent, with up to six decimals.",
    );
  const n = parseUnits(value, 6);
  if (n <= 0n || n > 1000_000000n)
    throw new Error("Cost must be above 0 and at most 1,000 USDC-equivalent.");
  return n;
}
export function createSession(config: Config, id: string): Session {
  if (!/^[\w-]{1,80}$/.test(id)) throw new Error("Invalid task identifier");
  if (
    !(AMOUNTS as readonly string[]).includes(config.amount) ||
    !SCENARIOS.some((x) => x.id === config.scenario)
  )
    throw new Error("Select a calibrated amount and a known replay scenario.");
  if (
    !["timely", "cost"].includes(config.priority) ||
    typeof config.approved !== "boolean"
  )
    throw new Error("Invalid task preference");
  if (
    !Number.isInteger(config.slippageBps) ||
    config.slippageBps < 1 ||
    config.slippageBps > 300
  )
    throw new Error("Replay tolerance must be between 0.01% and 3%.");
  if (
    !Number.isInteger(config.attempts) ||
    config.attempts < 1 ||
    config.attempts > 3
  )
    throw new Error("Choose one to three swap attempts.");
  const budget = money(config.budget),
    target = money(config.costTarget);
  if (target > budget)
    throw new Error("The cost target cannot exceed the total gas budget.");
  const routes = calibration.profiles
    .filter((p) => p.amount === config.amount)
    .map((p) => ({
      fee: p.fee,
      output: BigInt(p.quotedOutputRaw),
      swapGas: BigInt(p.swaps[0].gasUsed),
      revertGas: BigInt(p.swaps[1].gasUsed),
      approvalGas: BigInt(p.approval.gasUsed),
    }));
  const initialQuote = routes.reduce(
    (n, r) => (r.output > n ? r.output : n),
    0n,
  );
  const task: Task = {
    minimumOutput: minimumFromQuote(initialQuote, config.slippageBps),
    gasBudget: budget,
    targetGasCost: target,
    deadline: 180,
    maxAttempts: config.attempts,
  };
  const canonicalConfig = {
    amount: config.amount,
    slippageBps: config.slippageBps,
    budget: config.budget,
    costTarget: config.costTarget,
    priority: config.priority,
    attempts: config.attempts,
    scenario: config.scenario,
    approved: config.approved,
  };
  return {
    version: "task-workbench-v1",
    id,
    config: canonicalConfig,
    task,
    initialQuote,
    routes,
    intentHash: digest({ task, config: canonicalConfig, initialQuote }),
    step: 0,
    approved: config.approved,
    attempts: 0,
    approvalAttempts: 0,
    spent: 0n,
    approvalCost: 0n,
    failedCost: 0n,
    phase: "ready",
    reason: "Task conditions locked for this replay.",
    output: null,
    pending: null,
    events: [],
    completedAt: null,
    commands: [],
    budgetBreach: false,
    floorBreach: false,
  };
}
export function observation(s: Session) {
  const path =
    PATHS.find((p) => p.name === s.config.scenario) ||
    PATHS.find((p) => p.name === "gas-falls")!;
  const index = Math.min(s.step, 2);
  const spike =
    s.config.scenario === "approval-gas-spike" && s.approved && s.step === 0;
  return {
    second:
      s.step >= 3
        ? 180
        : [0, 60, 150][index] +
          (s.approvalAttempts > 0 && s.step === 0 ? 1 : 0),
    finalOpportunity: s.step === 2,
    gasPriceWei: BigInt(Math.round((spike ? 30 : path.gasGwei[index]) * 1e9)),
    routes:
      s.config.scenario === "rpc-unavailable"
        ? []
        : s.routes.map((r) => ({
            ...r,
            output: (r.output * BigInt(path.quoteBps[index])) / 10000n,
          })),
  };
}
export function inspectSession(s: Session) {
  const o = observation(s);
  const decision = chooseAction(
    s.config.priority === "timely" ? "net-now" : "task-budget",
    s.task,
    {
      spent: s.spent,
      approved: s.approved,
      attempts: s.attempts,
      completed: s.phase === "completed",
    },
    o,
    PRICES,
  );
  const routeCosts = o.routes.map((r) => ({
    fee: r.fee,
    output: r.output,
    estimatedSwapCost: gasCost(
      r.swapGas > r.revertGas ? r.swapGas : r.revertGas,
      o.gasPriceWei,
      PRICES,
    ),
    approvalCost: s.approved
      ? 0n
      : gasCost(r.approvalGas, o.gasPriceWei, PRICES),
  }));
  const minimumCurrentCost = routeCosts.length
    ? routeCosts.reduce((a, r) => {
        const cost = r.estimatedSwapCost + r.approvalCost;
        return cost < a ? cost : a;
      }, routeCosts[0].estimatedSwapCost + routeCosts[0].approvalCost)
    : null;
  return {
    observation: o,
    decision,
    routeCosts,
    minimumCurrentCost,
    targetCurrentlyInfeasible:
      minimumCurrentCost !== null &&
      s.spent + minimumCurrentCost > s.task.targetGasCost,
  };
}
function event(
  s: Session,
  type: string,
  detail: string,
  rest: Partial<Event> = {},
): Session {
  return {
    ...s,
    events: [
      ...s.events,
      {
        sequence: s.events.length + 1,
        second: observation(s).second,
        type,
        detail,
        cost: 0n,
        remaining: s.task.gasBudget - s.spent,
        ...rest,
      },
    ],
  };
}
function stop(s: Session, reason: string) {
  return event(
    { ...s, phase: "stopped", pending: null, reason },
    "stopped",
    reason,
  );
}
function advance(s: Session): Session {
  if (s.attempts >= s.task.maxAttempts)
    return stop(s, "Maximum swap attempts reached; spent gas is not refunded.");
  if (s.step >= 2)
    return stop(
      { ...s, step: 3 },
      "Replay deadline reached without completion.",
    );
  return { ...s, step: s.step + 1, phase: "ready", pending: null };
}
export function nextAction(session: Session): Session {
  if (session.phase !== "ready")
    throw new Error("Reconcile the pending receipt before another action.");
  let s = { ...session, commands: [...session.commands, "next" as const] };
  const { observation: o, decision } = inspectSession(s);
  s = event(
    s,
    "checked",
    `Fresh replay observation; gas ${o.gasPriceWei} wei. Original output floor and total budget retained.`,
  );
  if (decision.action !== "send") {
    if (decision.action === "stop") return stop(s, decision.reason);
    return advance(
      event(
        s,
        "wait",
        o.routes.length
          ? decision.reason
          : "Quote data unavailable; nothing sent.",
      ),
    );
  }
  const kind = s.approved ? "swap" : "approval";
  const id = `${s.id}-op-${s.events.filter((e) => e.type === "prepared").length + 1}`;
  const pending: Pending = {
    id,
    kind,
    route: decision.route,
    gasPriceWei: o.gasPriceWei,
    estimatedCost:
      kind === "approval"
        ? gasCost(decision.route.approvalGas, o.gasPriceWei, PRICES)
        : gasCost(
            decision.route.swapGas > decision.route.revertGas
              ? decision.route.swapGas
              : decision.route.revertGas,
            o.gasPriceWei,
            PRICES,
          ),
  };
  if (kind === "swap") {
    // A new unsigned draft retains the ORIGINAL task quote/floor and absolute deadline.
    const intent = lockIntent({
      source: "synthetic",
      tokenIn: "WETH",
      amountInRaw: parseUnits(s.config.amount, 18).toString(),
      quoteOutRaw: s.initialQuote.toString(),
      slippageBps: s.config.slippageBps,
      sender: SAMPLE_ACCOUNT,
      recipient: SAMPLE_ACCOUNT,
      fee: decision.route.fee,
      quoteBlock: calibration.fork.number,
      quotedAt: BASE_TIME + o.second,
      quoteExpiresAt: BASE_TIME + o.second + 30,
      deadline: BASE_TIME + s.task.deadline,
    });
    pending.envelope = exampleDraft(intent);
    pending.protection = verifyProtection(
      intent,
      pending.envelope,
      BASE_TIME + o.second,
    );
    if (
      pending.protection.decision !== "MATCH" ||
      BigInt(intent.minimumOutRaw) !== s.task.minimumOutput
    )
      return stop(
        s,
        "The unsigned draft failed the original-floor consistency check.",
      );
  }
  s = {
    ...s,
    phase: "awaiting_receipt",
    pending,
    attempts: s.attempts + (kind === "swap" ? 1 : 0),
    approvalAttempts: s.approvalAttempts + (kind === "approval" ? 1 : 0),
    reason: `${kind} prepared for replay. No transaction was broadcast.`,
  };
  return event(s, "prepared", s.reason, {
    operationId: id,
    protection: pending.protection?.decision,
  });
}
/** Receipt reconciliation is shared by synthetic and local-fork tests, not exposed as a public execution API. */
export function reconcile(session: Session, receipt: Receipt): Session {
  const previous = session.events.find(
    (e) => e.receipt?.id === receipt.id,
  )?.receipt;
  if (previous) {
    if (digest(previous) !== digest(receipt))
      throw new Error("Conflicting receipt for an already settled operation.");
    return session;
  }
  const p = session.pending;
  if (
    !p ||
    session.phase !== "awaiting_receipt" ||
    p.id !== receipt.id ||
    p.kind !== receipt.kind
  )
    throw new Error("Receipt does not belong to the pending task operation.");
  if (
    receipt.gasUsed < 0n ||
    receipt.gasPriceWei < 0n ||
    receipt.output < 0n ||
    !["success", "reverted"].includes(receipt.status) ||
    !["synthetic", "local-fork"].includes(receipt.evidence)
  )
    throw new Error("Invalid receipt data");
  if (
    (receipt.kind === "approval" || receipt.status === "reverted") &&
    receipt.output !== 0n
  )
    throw new Error("This operation cannot produce output tokens.");
  const cost = gasCost(receipt.gasUsed, receipt.gasPriceWei, PRICES);
  let s: Session = {
    ...session,
    spent: session.spent + cost,
    pending: null,
    phase: "ready",
    approvalCost:
      session.approvalCost + (receipt.kind === "approval" ? cost : 0n),
    failedCost:
      session.failedCost + (receipt.status === "reverted" ? cost : 0n),
  };
  s = event(
    s,
    receipt.status === "success" ? "receipt-success" : "receipt-reverted",
    `${receipt.evidence} ${receipt.kind} receipt reconciled; all gas remains in the task ledger.`,
    { receipt, cost, operationId: receipt.id },
  );
  if (receipt.kind === "approval" && receipt.status === "success")
    s.approved = true;
  if (receipt.kind === "swap" && receipt.status === "success")
    s.output = receipt.output;
  s.budgetBreach = s.spent > s.task.gasBudget;
  s.floorBreach =
    receipt.kind === "swap" &&
    receipt.status === "success" &&
    receipt.output < s.task.minimumOutput;
  if (s.budgetBreach || s.floorBreach)
    return stop(
      s,
      "Observed receipt exceeded a task constraint. Actual costs/output are retained; no further attempt allowed.",
    );
  if (receipt.kind === "swap" && receipt.status === "success")
    return event(
      {
        ...s,
        phase: "completed",
        completedAt: observation(s).second,
        reason: "Task completed within its original replay constraints.",
      },
      "completed",
      "Output floor preserved; cumulative gas reconciled.",
    );
  if (receipt.status === "reverted") {
    if (receipt.kind === "approval" && s.approvalAttempts >= 3)
      return stop(s, "Approval attempt limit reached.");
    return advance(s);
  }
  return event(
    s,
    "recheck-required",
    "Approval is recorded. Recheck price and remaining gas budget before preparing the swap.",
  );
}
export function simulatedReceipt(s: Session): Receipt {
  const p = s.pending;
  if (!p) throw new Error("No pending replay operation");
  const path = PATHS.find((x) => x.name === s.config.scenario);
  const out =
    (p.route.output *
      BigInt(path?.executionBps[Math.min(s.step, 2)] ?? 10000)) /
    10000n;
  const status =
    p.kind === "approval" || out >= s.task.minimumOutput
      ? "success"
      : "reverted";
  return {
    id: p.id,
    kind: p.kind,
    status,
    gasUsed:
      p.kind === "approval"
        ? p.route.approvalGas
        : status === "success"
          ? p.route.swapGas
          : p.route.revertGas,
    gasPriceWei: p.gasPriceWei,
    output: p.kind === "swap" && status === "success" ? out : 0n,
    evidence: "synthetic",
  };
}
export function settleSimulation(s: Session): Session {
  const next = reconcile(s, simulatedReceipt(s));
  return { ...next, commands: [...next.commands, "receipt"] };
}
export function stopSession(s: Session): Session {
  if (s.phase !== "ready")
    throw new Error(
      "Only a ready replay task can be stopped; pending receipts must be reconciled first.",
    );
  return stop(
    { ...s, commands: [...s.commands, "stop"] },
    "Stopped by user; settled costs retained.",
  );
}
export function exportSession(s: Session) {
  const localReceipts = s.events.some(
    (e) => e.receipt?.evidence === "local-fork",
  );
  return wire({
    version: s.version,
    kind: "SYNTHETIC_TASK_WORKBENCH_NOT_EXECUTED_ON_MAINNET",
    taskId: s.id,
    intentFingerprint: s.intentHash,
    fingerprintMeaning:
      "Content fingerprint, not a signature or authenticated consent",
    config: s.config,
    task: s.task,
    initialQuoteRaw: s.initialQuote,
    units: "USDC base units (6 decimals); gas costs in USDC-equivalent",
    provenance: {
      calibrationBlock: calibration.fork,
      gas: "Local-fork measured gas held fixed in constructed paths",
      quotePath: "Synthetic",
      gasPricePath: "Synthetic",
      receipts: localReceipts
        ? "See individual receipt evidence; local fork and/or synthetic, never mainnet"
        : "Synthetic",
      clock: "Relative replay time, not wall-clock scheduling",
    },
    result: {
      status: s.phase,
      reason: s.reason,
      completed: s.phase === "completed",
      spentGas: s.spent,
      approvalCost: s.approvalCost,
      failedCost: s.failedCost,
      remainingBudget: s.task.gasBudget - s.spent,
      attempts: s.attempts,
      approvalAttempts: s.approvalAttempts,
      outputRaw: s.output,
      netOutputRaw: s.output === null ? null : s.output - s.spent,
      completionSecond: s.completedAt,
      budgetBreach: s.budgetBreach,
      floorBreach: s.floorBreach,
      hasPendingReceipt: !!s.pending,
    },
    events: s.events,
    pending: s.pending,
    limitations: [
      "No user wallet or mainnet transaction",
      "No guaranteed cost or fill improvement",
      "Budget checks are advisory estimates, not onchain enforcement",
      "Not full Uniswap routing or MEV protection",
    ],
  });
}
export function persistSession(s: Session) {
  if (
    s.events.some(
      (e) =>
        e.receipt?.evidence !== undefined && e.receipt.evidence !== "synthetic",
    )
  )
    throw new Error(
      "Local-fork receipts must be exported, not restored as synthetic replay.",
    );
  return JSON.stringify({
    version: s.version,
    id: s.id,
    config: s.config,
    commands: s.commands,
  });
}
export function restoreSession(text: string): Session {
  if (text.length > 20_000) throw new Error("Saved replay exceeds size limit");
  const data = JSON.parse(text);
  if (
    data.version !== "task-workbench-v1" ||
    !Array.isArray(data.commands) ||
    data.commands.length > 30
  )
    throw new Error("Invalid saved replay");
  let s = createSession(data.config, data.id);
  for (const command of data.commands) {
    if (command === "next") s = nextAction(s);
    else if (command === "receipt") s = settleSimulation(s);
    else if (command === "stop") s = stopSession(s);
    else throw new Error("Unknown replay action");
  }
  return s;
}
