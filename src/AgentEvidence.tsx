import { Download, FileJson, FileText } from "lucide-react";
import batch from "../public/evidence/agent-ledger-2026-09-10.manifest.json";

/** Fixed, published evidence. Never uploads a visitor's private ledger. */
export default function AgentEvidence() {
  return (
    <section
      id="evidence"
      className="agent-workbench agent-evidence"
      aria-label="Published Agent test evidence"
    >
      <div className="agent-heading">
        <div>
          <p className="eyebrow">PUBLISHED TEST RECORD / SYNTHETIC INPUTS</p>
          <h2>Inspect the run, including what did not complete.</h2>
          <p>
            Eight predefined scenarios were sent through the real local MCP
            server. Their inputs, responses and journal events are saved here as
            a fixed public batch—not generated when you open this page.
          </p>
        </div>
      </div>
      <p className="agent-disclosure">
        Constructed quotes and caller-reported receipts. No real funds, chain
        verification, live LLM evaluation or measured savings. A passed test
        means the observed behavior matched the declared expectation; it does
        not mean a swap succeeded.
      </p>
      <dl className="evidence-summary">
        <div>
          <dt>Expected behaviors checked</dt>
          <dd>
            {batch.summary.passed} / {batch.summary.scenarios}
          </dd>
        </div>
        <div>
          <dt>Recorded MCP tool calls</dt>
          <dd>{batch.summary.toolCalls}</dd>
        </div>
        <div>
          <dt>Process-restart scenarios</dt>
          <dd>{batch.summary.restartCases}</dd>
        </div>
      </dl>
      <p className="evidence-meta">
        Batch <strong>{batch.runId}</strong> · Recorded{" "}
        {batch.startedAt.replace("T", " ").replace("Z", " UTC")} ·{" "}
        {batch.summary.expectedToolErrors} expected tool errors retained
      </p>
      <div className="evidence-links">
        <a className="agent-download" href={batch.artifact.path} download>
          <FileJson size={17} /> Full inputs & results JSON
        </a>
        <a className="agent-download" href={batch.reportPath} download>
          <FileText size={17} /> Readable report (.md)
        </a>
        <a
          className="agent-download"
          href="/evidence/agent-ledger-2026-09-10.manifest.json"
          download
        >
          <Download size={17} /> Source fingerprints & manifest
        </a>
      </div>
      <div className="evidence-cases">
        {batch.cases.map((item) => (
          <details className="agent-details" key={item.id}>
            <summary>
              {item.label}
              <span className="evidence-verdict">
                Expected behavior matched
              </span>
            </summary>
            <p className="evidence-meta">
              {item.callCount} calls · Observed {item.decision ?? item.status}
              {item.restarted ? " · Includes actual server restart" : ""}
            </p>
            <dl className="agent-metrics">
              <div>
                <dt>Reported gas spent</dt>
                <dd>
                  {item.spentGasUsdc}
                  <small> USDC-eq</small>
                </dd>
              </div>
              <div>
                <dt>Budget remaining</dt>
                <dd>
                  {item.remainingGasBudgetUsdc}
                  <small> USDC-eq</small>
                </dd>
              </div>
              <div>
                <dt>Reported gross output</dt>
                <dd>
                  {item.grossOutputUsdc ?? "Not completed"}
                  <small>{item.grossOutputUsdc !== null ? " USDC" : ""}</small>
                </dd>
              </div>
              <div>
                <dt>Output after task gas</dt>
                <dd>
                  {item.netOutputAfterGasUsdc ?? "Not available"}
                  <small>
                    {item.netOutputAfterGasUsdc !== null ? " USDC-eq" : ""}
                  </small>
                </dd>
              </div>
            </dl>
            <p className="evidence-meta">
              Declared expectations and observed values (complete call-by-call
              inputs and outputs are in the JSON download):
            </p>
            <pre>
              {JSON.stringify(
                { expected: item.expected, actual: item.actual },
                null,
                2,
              )}
            </pre>
          </details>
        ))}
      </div>
      <details className="agent-details">
        <summary>Provenance, reproduction and limits</summary>
        <p className="evidence-meta">
          Recorded with Node {batch.runtime.node} and MCP SDK{" "}
          {batch.runtime.mcpSdk}, using local stdio and isolated synthetic
          journals. The same project defines the scenarios and implements the
          checks; this is not an independent audit or held-out benchmark.
        </p>
        <p className="evidence-meta">
          Artifact SHA-256 (detects changed bytes; not a signature or
          independent attestation):
        </p>
        <code className="evidence-hash">{batch.artifact.sha256}</code>
        <p className="evidence-meta">
          Use a new run ID to reproduce the behavior. New timestamps mean the
          files will not be byte-identical. The recorder refuses to overwrite an
          existing batch.
        </p>
        <pre>
          npm run record:agent-evidence -- agent-ledger-YYYY-MM-DD-your-run
        </pre>
        <p className="evidence-meta">
          Exact source fingerprints are in the manifest. Do not sum alternative
          scenarios into total savings. Failure gas and missing output are
          retained; below-floor receipts and budget overruns remain violations
          even if the caller reports a successful transaction. These frozen
          public records do not collect visitor wallet activity or publish
          anyone's private MCP journal.
        </p>
        <a className="agent-link" href="#tasks">
          Original calibrated task replay and evidence remain separate ↗
        </a>
      </details>
    </section>
  );
}
