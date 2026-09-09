/** Experimental deterministic policy. No wallet, RPC or execution capability. */
export type Policy = "gross-now" | "net-now" | "task-budget";
export type Candidate = {
  fee: number;
  output: bigint;
  swapGas: bigint;
  revertGas: bigint;
  approvalGas: bigint;
};
export type Task = {
  minimumOutput: bigint;
  gasBudget: bigint;
  targetGasCost: bigint;
  deadline: number;
  maxAttempts: number;
};
export type TaskState = {
  spent: bigint;
  approved: boolean;
  attempts: number;
  completed: boolean;
};
export type Observation = {
  second: number;
  finalOpportunity: boolean;
  gasPriceWei: bigint;
  routes: Candidate[];
};
export type Prices = { eth: bigint; usdc: bigint }; // both feeds normalized to 8 decimals
export type Decision =
  | { action: "send"; route: Candidate; estimatedCost: bigint }
  | { action: "wait" | "stop"; reason: string };
export const POLICIES: Policy[] = ["gross-now", "net-now", "task-budget"];

export function assertLocalFork(url: string, chainId: number) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "http:" ||
    parsed.hostname !== "127.0.0.1" ||
    parsed.port !== "18545" ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash ||
    chainId !== 31337
  )
    throw new Error(
      "Writes require isolated http://127.0.0.1:18545 and chain ID 31337",
    );
}
function ceilDiv(n: bigint, d: bigint) {
  return (n + d - 1n) / d;
}
/** Gas in raw USDC-equivalent units; ceil to avoid rounding cost down. */
export function gasCost(units: bigint, wei: bigint, prices: Prices): bigint {
  if (units < 0n || wei < 0n || prices.eth <= 0n || prices.usdc <= 0n)
    throw new Error("Invalid gas or feed value");
  return ceilDiv(
    units * wei * prices.eth * 1_000_000n,
    10n ** 18n * prices.usdc,
  );
}
export function chooseAction(
  policy: Policy,
  task: Task,
  state: TaskState,
  observation: Observation,
  prices: Prices,
): Decision {
  if (
    state.completed ||
    observation.second >= task.deadline ||
    state.attempts >= task.maxAttempts
  )
    return {
      action: "stop",
      reason: "completed, expired, or attempt limit reached",
    };
  const candidates = observation.routes
    .filter((r) => r.output >= task.minimumOutput)
    .map((route) => {
      // Reserve for either success OR revert before sending, including a first approval.
      const txGas =
        route.swapGas > route.revertGas ? route.swapGas : route.revertGas;
      const estimatedCost =
        gasCost(txGas, observation.gasPriceWei, prices) +
        (state.approved
          ? 0n
          : gasCost(route.approvalGas, observation.gasPriceWei, prices));
      return { route, estimatedCost, net: route.output - estimatedCost };
    })
    .filter((x) => state.spent + x.estimatedCost <= task.gasBudget);
  if (!candidates.length)
    return {
      action: "wait",
      reason: "original floor or remaining hard gas budget",
    };
  candidates.sort((a, b) => {
    const x = policy === "gross-now" ? a.route.output : a.net;
    const y = policy === "gross-now" ? b.route.output : b.net;
    return x === y ? a.route.fee - b.route.fee : x > y ? -1 : 1;
  });
  // Cost target is only an aspiration; final opportunity falls back to the hard budget.
  const chosen =
    policy === "task-budget" && !observation.finalOpportunity
      ? candidates.find(
          (x) => state.spent + x.estimatedCost <= task.targetGasCost,
        )
      : candidates[0];
  if (!chosen)
    return { action: "wait", reason: "wait for soft task cost target" };
  return {
    action: "send",
    route: chosen.route,
    estimatedCost: chosen.estimatedCost,
  };
}

export type Path = {
  name: string;
  gasGwei: [number, number, number];
  quoteBps: [number, number, number];
  executionBps: [number, number, number];
};
export const PATHS: Path[] = [
  {
    name: "flat-cheap",
    gasGwei: [0.5, 0.5, 0.5],
    quoteBps: [10000, 10000, 10000],
    executionBps: [10000, 10000, 10000],
  },
  {
    name: "gas-falls",
    gasGwei: [3, 1, 0.5],
    quoteBps: [10000, 10000, 10000],
    executionBps: [10000, 10000, 10000],
  },
  {
    name: "gas-stays-high",
    gasGwei: [3, 3, 3],
    quoteBps: [10000, 10000, 10000],
    executionBps: [10000, 10000, 10000],
  },
  {
    name: "wait-misses-floor",
    gasGwei: [3, 1, 0.5],
    quoteBps: [10000, 9925, 9875],
    executionBps: [10000, 10000, 10000],
  },
  {
    name: "price-improves",
    gasGwei: [3, 1, 0.5],
    quoteBps: [10000, 10050, 10100],
    executionBps: [10000, 10000, 10000],
  },
  {
    name: "gas-rises",
    gasGwei: [0.5, 3, 20],
    quoteBps: [10000, 10000, 10000],
    executionBps: [10000, 10000, 10000],
  },
  {
    name: "first-send-race",
    gasGwei: [3, 1, 0.5],
    quoteBps: [10000, 10000, 10000],
    executionBps: [9900, 10000, 10000],
  },
  {
    name: "repeated-race",
    gasGwei: [1, 1, 1],
    quoteBps: [10000, 10000, 10000],
    executionBps: [9900, 9900, 9900],
  },
];
export type TaskResult = {
  policy: Policy;
  path: string;
  approvedInitially: boolean;
  completed: boolean;
  output: bigint | null;
  netOutput: bigint | null;
  gas: bigint;
  failedGas: bigint;
  approvalCost: bigint;
  attempts: number;
  reverts: number;
  completionSecond: number | null;
  floorBreaches: number;
  budgetBreaches: number;
  events: {
    second: number;
    action: string;
    reason?: string;
    fee?: number;
    gas?: bigint;
    output?: bigint;
  }[];
};
/** Future path is held by the simulator, never passed into chooseAction. */
export function replayTask(
  policy: Policy,
  task: Task,
  routes: Candidate[],
  prices: Prices,
  path: Path,
  approved: boolean,
): TaskResult {
  const state: TaskState = {
    approved,
    spent: 0n,
    attempts: 0,
    completed: false,
  };
  const result: TaskResult = {
    policy,
    path: path.name,
    approvedInitially: approved,
    completed: false,
    output: null,
    netOutput: null,
    gas: 0n,
    failedGas: 0n,
    approvalCost: 0n,
    attempts: 0,
    reverts: 0,
    completionSecond: null,
    floorBreaches: 0,
    budgetBreaches: 0,
    events: [],
  };
  for (let i = 0; i < 3; i++) {
    const second = [0, 60, 150][i];
    const gasPriceWei = BigInt(Math.round(path.gasGwei[i] * 1e9));
    const observation: Observation = {
      second,
      finalOpportunity: i === 2,
      gasPriceWei,
      routes: routes.map((r) => ({
        ...r,
        output: (r.output * BigInt(path.quoteBps[i])) / 10000n,
      })),
    };
    const decision = chooseAction(policy, task, state, observation, prices);
    if (decision.action !== "send") {
      result.events.push({
        second,
        action: decision.action,
        reason: decision.reason,
      });
      if (decision.action === "stop") break;
      continue;
    }
    const route = decision.route;
    // Approval is assumed successful in this v1 model; it persists after a reverted swap.
    const approvalCost = state.approved
      ? 0n
      : gasCost(route.approvalGas, gasPriceWei, prices);
    state.approved = true;
    result.approvalCost += approvalCost;
    const executionOut = (route.output * BigInt(path.executionBps[i])) / 10000n;
    const success = executionOut >= task.minimumOutput;
    const swapCost = gasCost(
      success ? route.swapGas : route.revertGas,
      gasPriceWei,
      prices,
    );
    state.spent += approvalCost + swapCost;
    state.attempts++;
    result.events.push({
      second,
      action: success ? "filled" : "reverted",
      fee: route.fee,
      gas: approvalCost + swapCost,
      output: success ? executionOut : 0n,
    });
    if (!success) {
      result.failedGas += swapCost;
      result.reverts++;
    } else {
      state.completed = true;
      result.completed = true;
      result.output = executionOut;
      result.netOutput = executionOut - state.spent;
      result.completionSecond = second;
      if (executionOut < task.minimumOutput) result.floorBreaches++;
    }
    if (state.spent > task.gasBudget) result.budgetBreaches++;
    if (success) break;
  }
  result.gas = state.spent;
  result.attempts = state.attempts;
  return result;
}
