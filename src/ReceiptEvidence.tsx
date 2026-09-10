import { FileJson, FileText, Download } from "lucide-react";
import batch from "../public/evidence/rpc-agent-2026-09-10.manifest.json";

const labels: Record<string, string> = {
  "per-attempt": "Per-attempt budget (limited baseline)",
  cumulative: "Cumulative budget (equally constrained)",
  "swapguard-mcp": "Same reference agent + SwapGuard MCP",
};
export default function ReceiptEvidence() {
  return (
    <section
      id="evidence"
      className="agent-workbench agent-evidence"
      aria-label="Receipt-verified reference agent comparison"
    >
      <div className="agent-heading">
        <div>
          <p className="eyebrow">REAL LOCAL-FORK EXECUTION / REFERENCE AGENT</p>
          <h2>Fewer overruns. One fewer completion. Both count.</h2>
          <p>
            A project-authored auto-retry agent called Uniswap contracts on a
            pinned Ethereum fork. Three policies received the same four cases,
            original minimum, gas estimates and deadline, each restored to the
            same chain snapshot.
          </p>
        </div>
      </div>
      <p className="agent-disclosure">
        Real EVM receipts, fake development funds. This is a deterministic
        reference agent—not an LLM, an official Uniswap agent or a third-party
        integration. Two cases deliberately inject an out-of-gas failure. It is
        not a market backtest or a savings forecast.
      </p>
      <div
        className="receipt-table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Agent policy comparison; scroll horizontally on small screens"
      >
        <table className="receipt-comparison">
          <caption>
            Four tasks per policy · total cost includes ALL tasks, including
            unfinished ones
          </caption>
          <thead>
            <tr>
              <th scope="col">Policy</th>
              <th scope="col">Completed</th>
              <th scope="col">Completed within floor & budget</th>
              <th scope="col">Over budget</th>
              <th scope="col">Total gas · USDC-eq</th>
            </tr>
          </thead>
          <tbody>
            {batch.summary.map((row) => (
              <tr key={row.policy}>
                <th scope="row">{labels[row.policy]}</th>
                <td>
                  {row.completed}/{row.tasks}
                </td>
                <td>
                  {row.compliantCompleted}/{row.tasks}
                </td>
                <td>
                  {row.overBudget}/{row.tasks}
                </td>
                <td>{row.gasCostUsdc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="agent-context">
        <article>
          <h3>What the evidence supports</h3>
          <p>
            The MCP policy matched the equally constrained cumulative baseline.
            The demonstrated value is reusable accounting, receipt
            reconciliation and restart continuity—not a better routing
            algorithm.
          </p>
        </article>
        <article>
          <h3>Why one task did not complete</h3>
          <p>
            In the tight-budget retry case, 0.315329 USDC-eq was already spent.
            The remaining estimate did not fit, so the cumulative and MCP
            policies waited. The per-attempt policy completed but spent 0.654837
            against a 0.6 budget.
          </p>
        </article>
        <article>
          <h3>The counterexample stays visible</h3>
          <p>
            All three policies passed an underestimated-cost attempt, then spent
            0.455087 against a 0.35 budget. An estimated budget check is not an
            enforced spending cap. The overrun is recorded, not hidden.
          </p>
        </article>
      </div>
      <details className="agent-details">
        <summary>What “RPC-verified” checks—and what it does not</summary>
        <p className="evidence-meta">
          The optional local MCP tool accepts only task ID, attempt ID and
          transaction hash. It reads the transaction, receipt, canonical block
          and receipt-block ETH/USD and USDC/USD feeds; checks the bound wallet,
          supported calldata and token logs; derives actual gas and output; and
          records the result once. One reference-agent failure/retry case
          includes a real MCP process restart.
        </p>
        <p className="evidence-meta">
          Supported: exact WETH approval and one deadline-bound WETH → USDC
          SwapRouter02 swap, fee 500 or 3000. Unsupported calldata or
          unavailable/stale data leaves the operation unresolved. This does not
          verify arbitrary routers, grant signing permission, continuously
          monitor reorgs or cryptographically prove RPC responses. Quotes and
          gas estimates remain caller-supplied.
        </p>
        <p className="evidence-meta">
          Local fork block 25938600; chain ID 31337; fixed 1 gwei transaction
          price. Local hashes are not mainnet explorer links. Approval,
          reverted-swap and successful-swap gas are included; inventory setup,
          future revocations and RPC/Agent operating costs are excluded. Four
          hand-designed cases do not establish production performance.
        </p>
        <p className="evidence-meta">
          Uniswap is the implemented ecosystem focus. The Graph remains a
          candidate for useful historical data, not a claimed integration or an
          added prize badge.
        </p>
      </details>
      <p className="evidence-meta">
        Frozen run {batch.runId} ·{" "}
        {batch.generatedAt.replace("T", " ").replace("Z", " UTC")} · source
        fingerprints and native gas values retained
      </p>
      <div className="evidence-links">
        <a className="agent-download" href={batch.artifact.path} download>
          <FileJson size={17} /> All calls, receipts & journals
        </a>
        <a
          className="agent-download"
          href="/evidence/rpc-agent-2026-09-10.md"
          download
        >
          <FileText size={17} /> Per-case report (.md)
        </a>
        <a
          className="agent-download"
          href="/evidence/rpc-agent-2026-09-10.manifest.json"
          download
        >
          <Download size={17} /> Source & artifact SHA-256
        </a>
      </div>
      <p className="evidence-meta">
        The historical synthetic MCP batch and calibrated task replay remain
        separately labelled below. No private visitor ledger is uploaded.
      </p>
    </section>
  );
}
