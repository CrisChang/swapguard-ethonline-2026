import { describe, expect, it } from "vitest";
import {
  assertLocalFork,
  chooseAction,
  gasCost,
  replayTask,
  PATHS,
  POLICIES,
  type Candidate,
  type Task,
  type TaskState,
  type Observation,
} from "../src/lib/task-budget";
const prices = { eth: 2500_00000000n, usdc: 100000000n };
const route: Candidate = {
  fee: 500,
  output: 100_000000n,
  swapGas: 100_000n,
  revertGas: 110_000n,
  approvalGas: 45_000n,
};
const task: Task = {
  minimumOutput: 99_500000n,
  gasBudget: 1_000000n,
  targetGasCost: 100000n,
  deadline: 180,
  maxAttempts: 3,
};
const state: TaskState = {
  spent: 0n,
  approved: true,
  attempts: 0,
  completed: false,
};
const obs: Observation = {
  second: 0,
  finalOpportunity: false,
  gasPriceWei: 1_000000000n,
  routes: [route],
};
describe("local fork write boundary", () => {
  it("permits only isolated loopback and chain 31337", () =>
    expect(() =>
      assertLocalFork("http://127.0.0.1:18545", 31337),
    ).not.toThrow());
  it.each([
    "https://ethereum-rpc.publicnode.com",
    "http://127.0.0.1:8545",
    "http://localhost:18545",
    "http://127.0.0.1:18545/x",
    "http://user@127.0.0.1:18545",
    "http://127.0.0.1:18545?x=1",
  ])("rejects %s", (url) =>
    expect(() => assertLocalFork(url, 31337)).toThrow(),
  );
  it("rejects a loopback mainnet RPC proxy", () =>
    expect(() => assertLocalFork("http://127.0.0.1:18545", 1)).toThrow());
});
describe("task decision and accounting", () => {
  it("converts gas to USDC with both prices and conservative rounding", () => {
    expect(gasCost(100_000n, 1_000000000n, prices)).toBe(250000n);
    expect(
      gasCost(100_000n, 1_000000000n, { ...prices, usdc: 2_00000000n }),
    ).toBe(125000n);
    expect(gasCost(1n, 1n, prices)).toBe(1n);
    expect(() => gasCost(1n, 1n, { ...prices, eth: 0n })).toThrow();
  });
  it("gross and net baselines can select different routes", () => {
    const other = {
      ...route,
      fee: 3000,
      output: 99_900000n,
      swapGas: 30_000n,
      revertGas: 30_000n,
    };
    const observation = { ...obs, routes: [route, other] };
    const a = chooseAction("gross-now", task, state, observation, prices);
    const b = chooseAction("net-now", task, state, observation, prices);
    expect(a.action === "send" && a.route.fee).toBe(500);
    expect(b.action === "send" && b.route.fee).toBe(3000);
  });
  it.each(POLICIES)("%s will not relax the original floor", (policy) => {
    expect(
      chooseAction(
        policy,
        task,
        state,
        { ...obs, routes: [{ ...route, output: 99_000000n }] },
        prices,
      ).action,
    ).toBe("wait");
  });
  it.each(POLICIES)(
    "%s accounts for cumulative gas and larger revert cost",
    (policy) => {
      expect(
        chooseAction(
          policy,
          task,
          { ...state, spent: 740000n },
          { ...obs, finalOpportunity: true },
          prices,
        ).action,
      ).toBe("wait");
    },
  );
  it("does not round two transactions as one", () => {
    expect(
      chooseAction(
        "net-now",
        { ...task, gasBudget: 1n },
        { ...state, approved: false },
        {
          ...obs,
          gasPriceWei: 1n,
          routes: [{ ...route, swapGas: 1n, revertGas: 1n, approvalGas: 1n }],
        },
        prices,
      ).action,
    ).toBe("wait");
  });
  it("stops at the deadline, completion and attempt cap", () => {
    expect(
      chooseAction("net-now", task, state, { ...obs, second: 180 }, prices)
        .action,
    ).toBe("stop");
    expect(
      chooseAction("net-now", task, { ...state, completed: true }, obs, prices)
        .action,
    ).toBe("stop");
    expect(
      chooseAction("net-now", task, { ...state, attempts: 3 }, obs, prices)
        .action,
    ).toBe("stop");
  });
  it("soft target waits but final opportunity can spend the hard budget", () => {
    expect(chooseAction("task-budget", task, state, obs, prices).action).toBe(
      "wait",
    );
    expect(
      chooseAction(
        "task-budget",
        task,
        state,
        { ...obs, finalOpportunity: true },
        prices,
      ).action,
    ).toBe("send");
  });
  it("keeps approvals after reverted swaps and counts all failure costs", () => {
    const result = replayTask(
      "net-now",
      { ...task, gasBudget: 10_000000n },
      [route],
      prices,
      PATHS[7],
      false,
    );
    expect(result.completed).toBe(false);
    expect(result.reverts).toBe(3);
    expect(result.approvalCost).toBe(112500n);
    expect(result.failedGas).toBe(825000n);
    expect(result.gas).toBe(937500n);
    expect(result.netOutput).toBeNull();
  });
  it("retains the adverse wait-misses-floor counterexample", () => {
    const a = replayTask("net-now", task, [route], prices, PATHS[3], true);
    const b = replayTask("task-budget", task, [route], prices, PATHS[3], true);
    expect(a.completed).toBe(true);
    expect(b.completed).toBe(false);
    expect(b.events).toHaveLength(3);
  });
  it.each(POLICIES)(
    "%s respects invariants over all frozen paths",
    (policy) => {
      for (const path of PATHS)
        for (const approved of [false, true]) {
          const r = replayTask(policy, task, [route], prices, path, approved);
          expect(r.gas).toBeLessThanOrEqual(task.gasBudget);
          expect(r.attempts).toBeLessThanOrEqual(task.maxAttempts);
          if (r.completed) {
            expect(r.output!).toBeGreaterThanOrEqual(task.minimumOutput);
            expect(r.completionSecond!).toBeLessThan(task.deadline);
            expect(r.netOutput).toBe(r.output! - r.gas);
          } else expect(r.netOutput).toBeNull();
        }
    },
  );
});
