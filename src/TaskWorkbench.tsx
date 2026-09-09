import { useEffect, useState } from "react";
import {
  ArrowRight,
  Download,
  FlaskConical,
  LockKeyhole,
  RotateCcw,
} from "lucide-react";
import { formatUnits } from "viem";
import {
  AMOUNTS,
  DEFAULT_CONFIG,
  SCENARIOS,
  STORAGE_KEY,
  createSession,
  exportSession,
  inspectSession,
  nextAction,
  observation,
  persistSession,
  restoreSession,
  settleSimulation,
  stopSession,
  wire,
  type Config,
  type Session,
} from "./lib/task-session";
import "./task-workbench.css";

const money = (n: bigint) => formatUnits(n, 6);
function saved() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return { session: value ? restoreSession(value) : null, warning: "" };
  } catch {
    return {
      session: null,
      warning:
        "Saved replay could not be restored. No transaction was sent; create a new replay.",
    };
  }
}
const status = {
  ready: "Ready to check",
  awaiting_receipt: "Receipt pending",
  completed: "Completed in replay",
  stopped: "Stopped without completion",
};

export default function TaskWorkbench() {
  const [initial] = useState(saved);
  const [session, setSession] = useState<Session | null>(initial.session);
  const [config, setConfig] = useState<Config>(
    initial.session?.config || { ...DEFAULT_CONFIG },
  );
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [storageWarning, setStorageWarning] = useState(initial.warning);
  const [restored, setRestored] = useState(!!initial.session);
  useEffect(() => {
    if (!session) return;
    try {
      localStorage.setItem(STORAGE_KEY, persistSession(session));
    } catch {
      setStorageWarning(
        "Browser storage is unavailable. Export your report before leaving this page.",
      );
    }
  }, [session]);
  function update(patch: Partial<Config>) {
    setConfig((c) => ({ ...c, ...patch }));
    setConfirmed(false);
    setError("");
  }
  function create() {
    if (!confirmed || session) return;
    try {
      setSession(createSession(config, crypto.randomUUID()));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot create task");
    }
  }
  function act(fn: (s: Session) => Session) {
    // Browser actions are synchronous; functional state prevents stale double-click settlement.
    setSession((s) => {
      if (!s) return s;
      try {
        return fn(s);
      } catch {
        return s;
      }
    });
  }
  function runRemaining(s: Session) {
    let next = s;
    for (
      let i = 0;
      i < 20 && ["ready", "awaiting_receipt"].includes(next.phase);
      i++
    )
      next = next.phase === "ready" ? nextAction(next) : settleSimulation(next);
    return next;
  }
  function reset() {
    setSession(null);
    setConfirmed(false);
    setRestored(false);
    setError("");
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* Notice remains visible. */
    }
  }
  function download() {
    if (!session) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(exportSession(session), null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `swapguard-task-${session.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  let preview: Session | null = session;
  try {
    if (!preview) preview = createSession(config, "preview");
  } catch {
    /* Form errors are shown at confirmation. */
  }
  const inspection = preview ? inspectSession(preview) : null;
  const terminal =
    session?.phase === "completed" || session?.phase === "stopped";
  const scenario = SCENARIOS.find((x) => x.id === config.scenario);
  return (
    <section
      id="tasks"
      className="task-workbench"
      aria-label="Task budget workbench"
    >
      <div className="task-heading">
        <div>
          <p className="eyebrow">ONE TASK. ONE PRICE FLOOR. ONE COST LEDGER.</p>
          <h2>Keep the whole task in budget.</h2>
          <p>
            For small automated WETH → USDC swaps, approvals and failed retries
            count too.
          </p>
        </div>
        <span className="task-badge">
          <FlaskConical size={15} /> Replay only · no wallet
        </span>
      </div>
      <div className="task-disclosure">
        <strong>Constructed scenario, not a live trade.</strong> Starting quotes
        and measured gas units come from local fork block 25,938,600. Price
        paths, gas prices, receipts and elapsed time below are synthetic.
        Nothing is signed or sent. Live read-only quotes are a separate tool
        further down.
      </div>
      {restored && (
        <p className="task-notice">
          Replay restored from this browser. Pending operations and settled
          costs are preserved. No background trading occurs.
        </p>
      )}
      {storageWarning && <p className="task-warning">{storageWarning}</p>}
      <div className="task-grid">
        <div className="task-card task-config">
          <p className="eyebrow">01 / DEFINE THE TASK</p>
          <h3>Conditions stay locked.</h3>
          <fieldset disabled={!!session}>
            <label>
              Replay amount
              <select
                value={config.amount}
                onChange={(e) => update({ amount: e.target.value })}
              >
                {AMOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {a} WETH → USDC
                  </option>
                ))}
              </select>
            </label>
            <div className="task-pair">
              <label>
                Task price tolerance
                <select
                  value={config.slippageBps}
                  onChange={(e) =>
                    update({ slippageBps: Number(e.target.value) })
                  }
                >
                  <option value={10}>0.1%</option>
                  <option value={50}>0.5%</option>
                  <option value={100}>1%</option>
                </select>
              </label>
              <label>
                Maximum swap attempts
                <select
                  value={config.attempts}
                  onChange={(e) => update({ attempts: Number(e.target.value) })}
                >
                  {[1, 2, 3].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Total task gas budget
              <input
                inputMode="decimal"
                value={config.budget}
                onChange={(e) => update({ budget: e.target.value })}
              />
              <small>
                USDC-equivalent, including approvals and every failed attempt.
                Gas is paid in ETH.
              </small>
            </label>
            <label>
              Execution preference
              <select
                value={config.priority}
                onChange={(e) =>
                  update({ priority: e.target.value as Config["priority"] })
                }
              >
                <option value="timely">
                  Timely — act when constraints fit
                </option>
                <option value="cost">
                  Cost-first — willing to wait or miss
                </option>
              </select>
            </label>
            <label>
              Preferred task cost
              <input
                inputMode="decimal"
                value={config.costTarget}
                onChange={(e) => update({ costTarget: e.target.value })}
              />
              <small>
                A soft USDC-equivalent target for cost-first mode, not another
                hard cap. At the final observation, only the hard budget
                applies.
              </small>
            </label>
            <label>
              Task test scenario
              <select
                value={config.scenario}
                onChange={(e) => update({ scenario: e.target.value })}
              >
                {SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <small>{scenario?.detail}</small>
            </label>
            <label className="task-checkbox">
              <input
                type="checkbox"
                checked={config.approved}
                onChange={(e) => update({ approved: e.target.checked })}
              />
              Assume sufficient allowance at task start
            </label>
          </fieldset>
          <div className="task-floor">
            <span>Original minimum output</span>
            <strong data-testid="task-floor">
              {preview ? money(preview.task.minimumOutput) : "—"} USDC
            </strong>
            <small>
              Derived once from the initial quote and your tolerance. Never
              lowered on retries. Gas has a separate budget. Deadline: T+180s in
              replay.
            </small>
          </div>
          {!session ? (
            <>
              <label className="task-checkbox task-consent">
                <input
                  aria-label="Confirm replay task constraints"
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                I confirm these replay conditions. Waiting can miss the trade;
                this does not authorize a real transaction.
              </label>
              <button
                className="task-primary"
                disabled={!confirmed}
                onClick={create}
              >
                Create replay task <ArrowRight size={16} />
              </button>
            </>
          ) : (
            <p className="task-locked">
              <LockKeyhole size={14} /> Conditions locked. Start a new task to
              change them.
            </p>
          )}
          {error && (
            <p role="alert" className="task-warning">
              {error}
            </p>
          )}
        </div>
        <div className="task-card task-execution">
          <p className="eyebrow">02 / CHECK → PREPARE → RECONCILE</p>
          <div className="task-title-row">
            <h3>Every attempt counts.</h3>
            <span
              className={`task-status ${session?.phase || "idle"}`}
              data-testid="task-status"
            >
              {session ? status[session.phase] : "Not started"}
            </span>
          </div>
          <div className="task-metrics">
            <div>
              <span>Gas spent · USDC-eq</span>
              <strong data-testid="task-spent">
                {money(session?.spent || 0n)}
              </strong>
            </div>
            <div>
              <span>Budget left · USDC-eq</span>
              <strong data-testid="task-remaining">
                {preview ? money(preview.task.gasBudget - preview.spent) : "—"}
              </strong>
            </div>
            <div>
              <span>Swap attempts</span>
              <strong data-testid="task-attempts">
                {session?.attempts || 0} / {config.attempts}
              </strong>
            </div>
            <div>
              <span>Replay clock</span>
              <strong>T+{session ? observation(session).second : 0}s</strong>
            </div>
          </div>
          {inspection && !terminal && (
            <div className="task-observation">
              <h4>Current replay observation</h4>
              <p>
                Gas price: {formatUnits(inspection.observation.gasPriceWei, 9)}{" "}
                gwei. Estimates reserve the larger measured successful/reverted
                swap cost, plus approval if needed.
              </p>
              <div className="task-routes">
                {inspection.routeCosts.length ? (
                  inspection.routeCosts.map((r) => (
                    <div key={r.fee}>
                      <span>Uniswap v3 · {r.fee / 10000}% pool</span>
                      <strong>{money(r.output)} USDC</strong>
                      <small>
                        Estimated gas incl. required approval:{" "}
                        {money(r.estimatedSwapCost + r.approvalCost)} USDC-eq
                      </small>
                    </div>
                  ))
                ) : (
                  <p>No usable quote. No fallback price is invented.</p>
                )}
              </div>
            </div>
          )}
          {inspection?.targetCurrentlyInfeasible &&
            config.priority === "cost" &&
            !terminal && (
              <p className="task-warning" data-testid="cost-target-warning">
                The preferred cost is below the current estimated task cost.
                Waiting might help, but can also miss the original price floor
                or encounter more expensive gas.
              </p>
            )}
          {session?.phase === "ready" && inspection && (
            <div className="task-recommendation">
              <span>Next replay decision</span>
              <strong>
                {inspection.decision.action === "send"
                  ? session.approved
                    ? "Prepare swap"
                    : "Prepare approval, then recheck"
                  : inspection.decision.action === "wait"
                    ? "Wait for the next observation"
                    : "Stop — constraint reached"}
              </strong>
              {inspection.decision.action !== "send" && (
                <p>{inspection.decision.reason}</p>
              )}
            </div>
          )}
          {session?.pending && (
            <div className="task-pending" data-testid="task-pending">
              <h4>
                {session.pending.kind === "approval" ? "Approval" : "Swap"}{" "}
                receipt pending
              </h4>
              <p>
                This is a prepared replay operation, not a broadcast
                transaction. No second operation can be prepared until its
                receipt is reconciled.
              </p>
              <p>
                Reserved estimate:{" "}
                <strong>{money(session.pending.estimatedCost)} USDC-eq</strong>.
                The ledger uses settled receipt gas, not this estimate.
              </p>
              {session.pending.protection && (
                <p>
                  Unsigned draft check:{" "}
                  <strong>{session.pending.protection.decision}</strong> ·
                  original floor and deadline retained. This is a consistency
                  check, not a safety or execution guarantee.
                </p>
              )}
              <details>
                <summary>Inspect prepared replay operation</summary>
                <pre>{JSON.stringify(wire(session.pending), null, 2)}</pre>
              </details>
            </div>
          )}
          {!session && (
            <div className="task-empty">
              <RotateCcw size={32} />
              <h4>A failed swap is not a free retry.</h4>
              <p>
                Start with “Revert, then recover” to see an approval, a failed
                swap, and a successful retry share the same budget.
              </p>
            </div>
          )}
          {session && !terminal && (
            <div className="task-actions">
              <button
                className="task-primary"
                disabled={session.phase !== "ready"}
                onClick={() => act(nextAction)}
              >
                Check & advance replay
              </button>
              <button
                className="task-secondary"
                disabled={session.phase !== "awaiting_receipt"}
                onClick={() => act(settleSimulation)}
              >
                Reconcile synthetic receipt
              </button>
              <button
                className="task-secondary"
                onClick={() => act(runRemaining)}
              >
                Run remaining replay
              </button>
              <button
                className="task-text-button"
                disabled={session.phase !== "ready"}
                onClick={() => act(stopSession)}
              >
                Stop task
              </button>
            </div>
          )}
          {session && terminal && (
            <div
              className={`task-final ${session.phase}`}
              data-testid="task-final"
            >
              <p className="eyebrow">03 / FINAL TASK REPORT</p>
              <h4>
                {session.phase === "completed"
                  ? "Completed within the original conditions."
                  : "No completed trade. Costs stay visible."}
              </h4>
              <p>{session.reason}</p>
              <dl>
                <div>
                  <dt>Approval gas (all outcomes)</dt>
                  <dd>{money(session.approvalCost)} USDC-eq</dd>
                </div>
                <div>
                  <dt>Failed-operation gas (may include approval)</dt>
                  <dd>{money(session.failedCost)} USDC-eq</dd>
                </div>
                <div>
                  <dt>Settled output</dt>
                  <dd>
                    {session.output === null
                      ? "None — task not completed"
                      : `${money(session.output)} USDC`}
                  </dd>
                </div>
                <div>
                  <dt>Output minus all task gas</dt>
                  <dd>
                    {session.output === null
                      ? "Not applicable"
                      : `${money(session.output - session.spent)} USDC-eq`}
                  </dd>
                </div>
              </dl>
              <small>
                A non-completed task with lower gas is not a better fill. Report
                all outcomes, not only successful trades.
              </small>
            </div>
          )}
          {session && (
            <div className="task-export">
              <button className="task-secondary" onClick={download}>
                <Download size={15} />
                Export task report
              </button>
              {terminal && (
                <button className="task-text-button" onClick={reset}>
                  Create another task
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      {session && (
        <div className="task-card task-ledger">
          <div className="task-title-row">
            <div>
              <p className="eyebrow">AUDIT TRAIL</p>
              <h3>Decisions, receipts, remaining budget.</h3>
            </div>
            <span className="task-muted">Each receipt settles once.</span>
          </div>
          {session.events.length ? (
            <ol>
              {session.events.map((e) => (
                <li key={e.sequence}>
                  <div className="task-event-time">
                    #{e.sequence}
                    <span>T+{e.second}s</span>
                  </div>
                  <div>
                    <strong>{e.type.replaceAll("-", " ")}</strong>
                    <p>{e.detail}</p>
                    {e.operationId && <code>{e.operationId}</code>}
                  </div>
                  <div className="task-event-cost">
                    <strong>{e.cost > 0n ? `−${money(e.cost)}` : "—"}</strong>
                    <small>{money(e.remaining)} left</small>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="task-muted">
              Conditions recorded. Run the first check to begin.
            </p>
          )}
        </div>
      )}
      <div className="task-evidence">
        <div>
          <span className="eyebrow">FROZEN PILOT · CONSTRUCTED PATHS</span>
          <p>
            The earlier cost-first policy completed <strong>28/48</strong> tasks
            versus <strong>34/48</strong> for immediate execution. On the 28
            jointly completed tasks, gas was 8.74 vs 15.46 USDC-eq. Six missed
            trades remain part of the result. This is not a forecast or proof
            that waiting is better.
          </p>
          <small>
            These are the frozen pilot settings, not a new result for your
            custom replay above.
          </small>
        </div>
        <a
          href="https://github.com/CrisChang/swapguard-ethonline-2026/tree/main/experiments"
          target="_blank"
          rel="noreferrer"
        >
          Inspect protocol & raw evidence <ArrowRight size={15} />
        </a>
      </div>
    </section>
  );
}
