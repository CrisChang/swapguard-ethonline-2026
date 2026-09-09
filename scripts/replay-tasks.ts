import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { format } from "prettier";
import {
  gasCost,
  replayTask,
  PATHS,
  POLICIES,
  type Candidate,
  type Prices,
  type Task,
  type TaskResult,
} from "../src/lib/task-budget";

const calibrationPath =
  process.argv[2] || "experiments/results/fork-25938600.json";
const bytes = await readFile(calibrationPath);
type Profile = {
  amount: string;
  amountInRaw: string;
  fee: number;
  quotedOutputRaw: string;
  approval: { gasUsed: string; status: string };
  swaps: { outcome: string; gasUsed: string; status: string }[];
};
const calibration = JSON.parse(bytes.toString()) as {
  kind: string;
  fork: { number: string; hash: string };
  feeds: Record<"ETH" | "USDC", { answer: string; decimals: number }>;
  profiles: Profile[];
};
if (calibration.kind !== "LOCAL_FORK_GAS_CALIBRATION_NOT_MAINNET_TRANSACTIONS")
  throw new Error("Wrong input evidence type");
function normalize(feed: { answer: string; decimals: number }) {
  if (feed.decimals > 18 || feed.decimals < 0)
    throw new Error("Unsupported decimals");
  return (BigInt(feed.answer) * 10n ** 8n) / 10n ** BigInt(feed.decimals);
}
const prices: Prices = {
  eth: normalize(calibration.feeds.ETH),
  usdc: normalize(calibration.feeds.USDC),
};
const tasks: {
  id: string;
  amount: string;
  initialValue: bigint;
  task: Task;
  results: TaskResult[];
}[] = [];
for (const amount of ["0.01", "0.04", "0.2"]) {
  const profiles = calibration.profiles.filter((p) => p.amount === amount);
  if (profiles.length !== 2)
    throw new Error(`Missing calibration for ${amount}`);
  const routes: Candidate[] = profiles.map((p) => {
    const success = p.swaps.find((s) => s.outcome === "success");
    const failure = p.swaps.find((s) => s.outcome === "revert");
    if (
      success?.status !== "success" ||
      failure?.status !== "reverted" ||
      p.approval.status !== "success"
    )
      throw new Error("Incomplete calibration evidence");
    return {
      fee: p.fee,
      output: BigInt(p.quotedOutputRaw),
      swapGas: BigInt(success.gasUsed),
      revertGas: BigInt(failure.gasUsed),
      approvalGas: BigInt(p.approval.gasUsed),
    };
  });
  const initialValue = gasCost(BigInt(profiles[0].amountInRaw), 1n, prices);
  const fiveUsd = (5_000_000n * 100_000_000n) / prices.usdc;
  const budget = initialValue / 100n < fiveUsd ? initialValue / 100n : fiveUsd;
  const maximumQuote = routes.reduce(
    (v, r) => (r.output > v ? r.output : v),
    0n,
  );
  const task: Task = {
    minimumOutput: (maximumQuote * 9950n) / 10000n,
    gasBudget: budget,
    targetGasCost: initialValue / 1000n,
    deadline: 180,
    maxAttempts: 3,
  };
  for (const approved of [false, true])
    for (const path of PATHS) {
      tasks.push({
        id: `${amount}-${approved ? "approved" : "needs-approval"}-${path.name}`,
        amount,
        initialValue,
        task,
        results: POLICIES.map((p) =>
          replayTask(p, task, routes, prices, path, approved),
        ),
      });
    }
}
const summaries = POLICIES.map((policy) => {
  const results = tasks.flatMap((t) =>
    t.results.filter((r) => r.policy === policy),
  );
  const completed = results.filter((r) => r.completed);
  return {
    policy,
    tasks: results.length,
    completed: completed.length,
    uncompleted: results.length - completed.length,
    attemptedSwaps: results.reduce((s, r) => s + r.attempts, 0),
    reverts: results.reduce((s, r) => s + r.reverts, 0),
    totalGas: results.reduce((s, r) => s + r.gas, 0n),
    failedGas: results.reduce((s, r) => s + r.failedGas, 0n),
    approvalGas: results.reduce((s, r) => s + r.approvalCost, 0n),
    gasOnUncompleted: results
      .filter((r) => !r.completed)
      .reduce((s, r) => s + r.gas, 0n),
    totalCompletedNetOutput: completed.reduce((s, r) => s + r.netOutput!, 0n),
    averageCompletionSecond: completed.length
      ? completed.reduce((s, r) => s + r.completionSecond!, 0) /
        completed.length
      : null,
    floorBreaches: results.reduce((s, r) => s + r.floorBreaches, 0),
    budgetBreaches: results.reduce((s, r) => s + r.budgetBreaches, 0),
  };
});
const comparisons = POLICIES.filter((p) => p !== "task-budget").map(
  (baseline) => {
    let jointlyCompleted = 0,
      baselineOnly = 0,
      taskOnly = 0,
      neither = 0;
    let baselineGas = 0n,
      taskGas = 0n,
      netDelta = 0n;
    for (const task of tasks) {
      const a = task.results.find((r) => r.policy === baseline)!;
      const b = task.results.find((r) => r.policy === "task-budget")!;
      if (a.completed && b.completed) {
        jointlyCompleted++;
        baselineGas += a.gas;
        taskGas += b.gas;
        netDelta += b.netOutput! - a.netOutput!;
      } else if (a.completed) baselineOnly++;
      else if (b.completed) taskOnly++;
      else neither++;
    }
    return {
      baseline,
      jointlyCompleted,
      baselineOnly,
      taskOnly,
      neither,
      baselineGas,
      taskGas,
      pairedGasDifference: baselineGas - taskGas,
      pairedNetOutputDifference: netDelta,
    };
  },
);
const serial = (_key: string, value: unknown) =>
  typeof value === "bigint" ? value.toString() : value;
const output = {
  kind: "SYNTHETIC_TASK_REPLAY_WITH_LOCAL_FORK_GAS_CALIBRATION",
  protocol: "experiments/PROTOCOL.md",
  calibrationPath,
  calibrationSha256: createHash("sha256").update(bytes).digest("hex"),
  fork: calibration.fork,
  units: "raw USDC-equivalent (6 decimals) unless field names state otherwise",
  limitations: [
    "Constructed price/gas paths; not historical returns or future savings",
    "Fixed measured gas per size/route; future pool state can change gas used",
    "Two legacy v3 single-hop pools only; neither baseline is Uniswap's official SOR",
    "Successful exact-amount approvals assumed; two-tx gas price race not modeled",
    "No mempool inclusion, MEV ordering, real latency or operator/RPC costs modeled",
    "Budget bounds rely on estimates; not an onchain-enforced guarantee",
    "0.1% soft target is a preselected heuristic, not learned or optimized",
  ],
  summaries,
  comparisons,
  paths: PATHS,
  tasks,
};
const jsonPath = `experiments/results/tasks-${calibration.fork.number}.json`;
await writeFile(
  jsonPath,
  await format(JSON.stringify(output, serial, 2), { parser: "json" }),
);
const fixed = (n: bigint) => (Number(n) / 1e6).toFixed(4);
let markdown =
  `# SwapGuard task-budget pilot — measured gas, synthetic task paths\n\n` +
  `Fork block ${calibration.fork.number}. Protocol: [PROTOCOL.md](../PROTOCOL.md).\n\n` +
  `**Not a mainnet performance backtest.** Six route/size profiles calibrate 48 hand-designed tasks per policy. Full event traces: [JSON](tasks-${calibration.fork.number}.json).\n\n` +
  `## Task outcomes\n\n| Policy | Completed / all | Uncompleted | Swap sends / reverts | Total gas (USDC-eq) | Gas on uncompleted | Mean completed wait (s) |\n| --- | --- | --- | --- | --- | --- | --- |\n`;
for (const s of summaries)
  markdown += `| ${s.policy} | ${s.completed}/${s.tasks} | ${s.uncompleted} | ${s.attemptedSwaps}/${s.reverts} | ${fixed(s.totalGas)} | ${fixed(s.gasOnUncompleted)} | ${s.averageCompletionSecond?.toFixed(1) ?? "n/a"} |\n`;
markdown += `\nThe totals above include failures and uncompleted tasks, but lower spending alone is NOT a benefit when fewer tasks complete.\n\n## Paired comparison (task-budget minus baseline)\n\n`;
for (const p of comparisons)
  markdown += `- Versus ${p.baseline}: ${p.jointlyCompleted} jointly completed; ${p.baselineOnly} baseline-only; ${p.taskOnly} task-only; ${p.neither} neither. On jointly completed tasks only: baseline gas ${fixed(p.baselineGas)}, task gas ${fixed(p.taskGas)} USDC-eq; gas difference (baseline minus task) ${fixed(p.pairedGasDifference)}; net-output difference (task minus baseline) ${fixed(p.pairedNetOutputDifference)} USDC-eq.\n`;
markdown += `\n## Every scenario, including adverse waiting\n\n| Scenario | gross-now completions | net-now completions | task-budget completions | net-now gas | task-budget gas |\n| --- | --- | --- | --- | --- | --- |\n`;
for (const path of PATHS) {
  const values = POLICIES.map((policy) => {
    const rs = tasks.flatMap((t) =>
      t.results.filter((r) => r.policy === policy && r.path === path.name),
    );
    return {
      filled: rs.filter((r) => r.completed).length,
      gas: rs.reduce((s, r) => s + r.gas, 0n),
    };
  });
  markdown += `| ${path.name} | ${values[0].filled}/6 | ${values[1].filled}/6 | ${values[2].filled}/6 | ${fixed(values[1].gas)} | ${fixed(values[2].gas)} |\n`;
}
markdown +=
  `\n## Limitations\n\n${output.limitations.map((x) => `- ${x}`).join("\n")}\n\n` +
  `Next: evaluate predeclared holdout blocks and an official gas-aware router baseline; validate gas-price changes between approval and swap. Do not tune this heuristic on these same eight paths and then report in-sample improvement as validation.\n`;
await writeFile(
  `experiments/results/REPORT-${calibration.fork.number}.md`,
  await format(markdown, { parser: "markdown" }),
);
console.log(JSON.stringify({ summaries, comparisons, jsonPath }, serial, 2));
