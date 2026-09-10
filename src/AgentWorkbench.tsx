import { useState } from "react";
import { Bot, Download, Play, Terminal } from "lucide-react";
import {
  AGENT_EXAMPLES,
  runAgentExample,
  type AgentExampleId,
  type AgentExampleRun,
} from "./lib/agent-examples";
import integrationGuide from "../docs/AGENT_INTEGRATION.md?raw";
import "./agent-workbench.css";
import { openTaskSchema } from "./lib/agent-ledger";
import { presentAgentResult } from "./lib/agent-presentation";

export default function AgentWorkbench() {
  const [scenario, setScenario] = useState<AgentExampleId>("budget");
  const [budget, setBudget] = useState("3");
  const [run, setRun] = useState<AgentExampleRun | null>(null);
  const [error, setError] = useState("");
  const report = run?.report;
  const presentation = presentAgentResult(report);
  const example = AGENT_EXAMPLES.find((e) => e.id === scenario)!;
  function execute() {
    if (!openTaskSchema.shape.gasBudgetUsdc.safeParse(budget).success) {
      setRun(null);
      setError(
        "Use a positive gas budget with up to six decimal places (USDC-equivalent).",
      );
      return;
    }
    try {
      setRun(runAgentExample(scenario, budget));
      setError("");
    } catch {
      setRun(null);
      setError(
        "The example could not run. Please try again. No real transaction was sent.",
      );
    }
  }
  function download() {
    if (!run) return;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { evidence: "synthetic-browser-example", ...run },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `swapguard-agent-${scenario}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadGuide() {
    const url = URL.createObjectURL(
      new Blob([integrationGuide], { type: "text/markdown" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "SwapGuard-Agent-Integration.md";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      id="agents"
      className="agent-workbench"
      aria-label="Agent integration workbench"
    >
      <div className="agent-heading">
        <div>
          <p className="eyebrow">FOR AGENT DEVELOPERS / WETH → USDC</p>
          <h2>Keep the task, not just the last quote.</h2>
          <p>
            A new quote does not erase a failed transaction's gas or reset the
            user's original minimum.
          </p>
        </div>
        <a className="agent-link" href="#workspace">
          Open manual analysis ↗
        </a>
      </div>
      <div className="agent-context">
        <article>
          <h3>The problem</h3>
          <p>
            A swap task may span approval, a reverted swap and a retry.
            Individual receipts do not automatically explain the whole task's
            cost or whether a retry still fits the user's limits.
          </p>
        </article>
        <article>
          <h3>The output</h3>
          <p>
            One original output floor, one cumulative gas ledger, a check before
            each attempt, and an exportable report that includes failures and
            non-completion.
          </p>
        </article>
        <article>
          <h3>The boundary</h3>
          <p>
            An advisory prototype, not a router or wallet. No guaranteed
            savings, minimum loss, best execution or automatic account-wide
            transaction tracking.
          </p>
        </article>
      </div>
      <div className="agent-lab">
        <div className="agent-console">
          <p className="agent-terminal-label">
            <Bot size={18} /> AGENT INTEGRATION EXAMPLE
          </p>
          <h3>Check → record → recheck.</h3>
          <p>
            Constructed inputs run the same ledger core as the local MCP server.
            This browser is not connected to an Agent or MCP server.
          </p>
          <label htmlFor="agent-scenario">
            Choose a failure or recovery scenario
          </label>
          <select
            id="agent-scenario"
            value={scenario}
            onChange={(e) => {
              setScenario(e.target.value as AgentExampleId);
              setRun(null);
              setError("");
            }}
          >
            {AGENT_EXAMPLES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <p className="agent-example-detail">{example.detail}</p>
          <div className="agent-fixed-terms">
            <span>
              Input <strong>0.04 WETH</strong>
            </span>
            <span>
              Original minimum <strong>99.5 USDC</strong>
            </span>
            <span>
              Deadline <strong>180 replay seconds</strong>
            </span>
          </div>
          <label htmlFor="agent-budget">
            Task gas budget · USDC-equivalent
          </label>
          <input
            id="agent-budget"
            inputMode="decimal"
            value={budget}
            onChange={(e) => {
              setBudget(e.target.value);
              setRun(null);
              setError("");
            }}
          />
          <button className="agent-run" onClick={execute}>
            <Play size={16} /> Run agent example
          </button>
          {error && (
            <p role="alert" className="agent-error">
              {error}
            </p>
          )}
          <p className="agent-mini">
            Round numbers are illustrative, not measured savings or current
            quotes. Editing settings starts a separate example; it never changes
            a recorded MCP task.
          </p>
        </div>
        <div className="agent-ledger" aria-live="polite">
          <p className="eyebrow">OUTPUT / TASK COST LEDGER</p>
          {report && (
            <p className="agent-check-status">
              EXAMPLE RAN · NO REAL TRANSACTION SENT
            </p>
          )}
          <h3>{presentation.title}</h3>
          <p>{presentation.explanation}</p>
          <p>
            {report?.reason ||
              (report
                ? "All reported receipts remain in the task, including failed operations."
                : "Run a scenario to see the original floor, every reported gas charge and the reason for continuing or waiting.")}
          </p>
          <dl className="agent-metrics">
            <div>
              <dt>Reported gas spent</dt>
              <dd>
                {report?.spentGasUsdc ?? "—"}
                <small> USDC-eq</small>
              </dd>
            </div>
            <div>
              <dt>Budget remaining</dt>
              <dd>
                {report?.remainingGasBudgetUsdc ?? "—"}
                <small> USDC-eq</small>
              </dd>
            </div>
            <div>
              <dt>Gross swap output</dt>
              <dd>
                {presentation.output}
                <small>{report?.grossOutputUsdc != null ? " USDC" : ""}</small>
              </dd>
            </div>
            <div>
              <dt>Output after task gas</dt>
              <dd>
                {presentation.net}
                <small>
                  {report?.netOutputAfterGasUsdc != null ? " USDC-eq" : ""}
                </small>
              </dd>
              {report && report.netOutputAfterGasUsdc === null && (
                <dd className="agent-metric-help">
                  No successful swap output yet; this is not missing data or
                  zero cost.
                </dd>
              )}
            </div>
          </dl>
          {report && (
            <>
              <div className="agent-breakdown">
                <span>
                  Approval gas <b>{report.gasBreakdownUsdc.approvals}</b>
                </span>
                <span>
                  Failed swap gas <b>{report.gasBreakdownUsdc.failedSwaps}</b>
                </span>
                <span>
                  Successful swap gas{" "}
                  <b>{report.gasBreakdownUsdc.successfulSwaps}</b>
                </span>
              </div>
              <p className="agent-result-note">
                Pending operation:{" "}
                <strong>{report.pendingAttemptId ?? "none"}</strong> · Original
                floor: <strong>{report.terms.minimumOutputUsdc} USDC</strong>
              </p>
              <button className="agent-download" onClick={download}>
                <Download size={15} /> Export calls & ledger JSON
              </button>
            </>
          )}
          <p className="agent-result-note">
            Gas is paid in ETH and valued in USDC-equivalent. Output after gas
            is not investment profit/loss. No completed swap means no output,
            not a zero-cost success.
          </p>
        </div>
      </div>
      {run && (
        <details className="agent-details">
          <summary>
            <Terminal size={16} /> Inspect {run.calls.length} tool-shaped calls
            and their results
          </summary>
          <ol className="agent-calls">
            {run.calls.map((c, i) => (
              <li key={i}>
                <strong>{c.tool}</strong>
                <span>
                  {c.output.decision ?? c.output.status} · spent{" "}
                  {c.output.spentGasUsdc} USDC-eq
                </span>
                <details>
                  <summary>Inputs & output JSON</summary>
                  <pre>{JSON.stringify(c, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ol>
        </details>
      )}
      <details className="agent-details">
        <summary>Connect an existing Agent through local MCP</summary>
        <div className="agent-integration-grid">
          <article>
            <h3>Available now: local advisory tools</h3>
            <ol>
              <li>
                <code>swapguard_open_task</code> records immutable terms.
              </li>
              <li>
                <code>swapguard_assess_attempt</code> checks reported inputs and
                reserves one pending operation.
              </li>
              <li>
                <code>swapguard_record_receipt</code> records reported costs
                once.
              </li>
              <li>
                <code>swapguard_get_task</code> returns the ledger and
                unresolved state.
              </li>
              <li>
                Optional <code>swapguard_verify_receipt</code> reads a supported
                bound transaction from configured RPC and records derived costs.
                See the separate <a href="#evidence">reference-agent test</a>.
              </li>
            </ol>
            <p>
              The local journal survives server restarts. The public website
              does not host a remote MCP endpoint or store these examples.
            </p>
          </article>
          <article>
            <h3>Start from the repository</h3>
            <pre>
              {
                "npm ci\nnpm run mcp\n\n# Separate integration check, temporary journal\nnpm run check:mcp"
              }
            </pre>
            <p>
              Use a stdio-capable client and a private absolute journal path.
              Never enter wallet keys. See the complete configuration, schema
              and example in the integration guide.
            </p>
            <button className="agent-download" onClick={downloadGuide}>
              <Download size={15} /> Download MCP integration guide
            </button>
          </article>
        </div>
      </details>
      <details className="agent-details">
        <summary>Background, accounting rules & capability boundaries</summary>
        <div className="agent-integration-grid">
          <article>
            <h3>Who this is for</h3>
            <p>
              Developers of existing DCA, rebalancing or conversion agents. The
              first supported ledger is one Ethereum WETH → USDC task, not an
              entire portfolio or every swap channel.
            </p>
            <h3>Why track the task?</h3>
            <p>
              Block explorers can show individual receipts. The integration
              question is whether an Agent carries the original user constraints
              and cumulative costs across those receipts, retries and restarts.
              How widespread this pain is still needs user interviews; no
              adoption or customer-savings claim is made.
            </p>
            <h3>Separate the cost categories</h3>
            <p>
              Count approval gas, failed swap gas and successful swap gas once.
              Pool fees already affect quoted/received amounts: do not subtract
              them again. The initial quote difference can reflect multiple
              factors; it is not pure slippage or investment P&amp;L.
            </p>
          </article>
          <article>
            <h3>What the first version does not guarantee</h3>
            <ul>
              <li>
                Quotes, gas estimates and legacy reported receipts are supplied
                by the caller and are not independently authenticated. Optional
                RPC receipt verification is a separate, narrowly supported mode.
              </li>
              <li>
                The local journal is not tamper-proof. A different task ID is a
                different budget; no wallet-wide cap is enforced.
              </li>
              <li>
                Readiness is advisory. An Agent with a separate signer can
                bypass the tool. Production enforcement needs binding to the
                exact checked transaction.
              </li>
              <li>
                No automatic wallet-history import, signing, trading, receipt
                monitoring, nonce/replacement/reorg handling or full router
                compatibility.
              </li>
              <li>
                No guaranteed lower loss, lower gas, higher completion or best
                execution. Waiting can miss a trade; actual cost can exceed
                estimates.
              </li>
            </ul>
            <p>
              Keep the manual live quote panel, calibrated replay and local-fork
              proof separate from these illustrative Agent scenarios. A working
              MCP interface is not proof of production Agent adoption.
            </p>
          </article>
        </div>
      </details>
      <p className="agent-disclosure">
        No wallet is connected and nothing is signed or broadcast. Browser
        examples are synthetic; legacy MCP reports remain unverified. Real
        mainnet reads remain in <a href="#workspace">manual analysis</a>;
        supported calldata checks remain in the{" "}
        <a href="#protection">draft checker</a>.
      </p>
    </section>
  );
}
