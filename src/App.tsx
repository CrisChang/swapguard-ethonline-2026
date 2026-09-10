import { useEffect, useRef, useState } from "react";
import {
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  Eye,
  FlaskConical,
  Info,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  ShieldX,
  TriangleAlert,
  Waves,
} from "lucide-react";
import { formatUnits } from "viem";
import { TOKENS, CONTRACTS, type TokenSymbol } from "./lib/contracts";
import type {
  AnalyzeRequest,
  Report,
  Scenario,
  CheckStatus,
} from "./lib/types";
import { validateRequest } from "./lib/validation";
import ProtectionLab from "./ProtectionLab";
import TaskWorkbench from "./TaskWorkbench";
import AgentWorkbench from "./AgentWorkbench";
import AgentEvidence from "./AgentEvidence";
import ReceiptEvidence from "./ReceiptEvidence";

const number = (s: string | number, digits = 5) =>
  Number(s).toLocaleString("en-US", { maximumFractionDigits: digits });
const shorten = (s: string) => `${s.slice(0, 6)}…${s.slice(-4)}`;
const decisions = {
  clear: "No policy flags",
  review: "Review before proceeding",
  blocked: "Policy threshold exceeded",
};
const labels: Record<CheckStatus, string> = {
  pass: "PASS",
  warn: "REVIEW",
  block: "BLOCK",
  unknown: "UNKNOWN",
};
const scenarios: { value: Scenario; label: string }[] = [
  { value: "normal", label: "Normal quote" },
  { value: "risky", label: "Risky quote" },
  { value: "stale", label: "Stale oracle" },
];
function StatusIcon({ status }: { status: CheckStatus }) {
  return status === "pass" ? (
    <CheckCircle2 size={19} />
  ) : status === "unknown" ? (
    <CircleHelp size={19} />
  ) : (
    <TriangleAlert size={19} />
  );
}
function Address({ value }: { value: string }) {
  return (
    <a
      href={`https://etherscan.io/address/${value}`}
      target="_blank"
      rel="noreferrer"
      title={value}
    >
      {shorten(value)} <ExternalLink size={11} />
    </a>
  );
}

export default function App() {
  const [mode, setMode] = useState<"live" | "demo">("demo");
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [tokenIn, setTokenIn] = useState<TokenSymbol>("WETH");
  const [amount, setAmount] = useState("0.1");
  const [slippage, setSlippage] = useState("0.5");
  const [owner, setOwner] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const abort = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const tokenOut = tokenIn === "WETH" ? "USDC" : "WETH";
  const secondsLeft = report
    ? Math.max(0, Math.ceil((Date.parse(report.expiresAt) - now) / 1000))
    : 0;
  const expired = !!report && secondsLeft === 0;
  function invalidate() {
    generation.current++;
    abort.current?.abort();
    setReport(null);
    setError("");
    setLoading(false);
  }
  async function run(overrides: Partial<AnalyzeRequest> = {}) {
    invalidate();
    const id = generation.current;
    const controller = new AbortController();
    abort.current = controller;
    try {
      if (!/^\d+(\.\d{1,2})?$/.test(slippage))
        throw new Error(
          "Use a slippage percentage with up to two decimal places.",
        );
      const request = validateRequest({
        mode,
        scenario: mode === "live" ? "normal" : scenario,
        tokenIn,
        amount,
        slippageBps: Math.round(Number(slippage) * 100),
        ...(mode === "live" && owner ? { owner } : {}),
        ...overrides,
      });
      setLoading(true);
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Analysis could not complete.");
      if (id === generation.current) {
        setReport(data);
        setNow(Date.now());
      }
    } catch (e) {
      if (
        id === generation.current &&
        !(e instanceof DOMException && e.name === "AbortError")
      )
        setError(e instanceof Error ? e.message : "Analysis unavailable.");
    } finally {
      if (id === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    void run();
    return () => {
      generation.current++;
      abort.current?.abort();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  function changeMode(next: "live" | "demo") {
    invalidate();
    setMode(next);
    setScenario("normal");
  }
  function exportReport() {
    if (!report) return;
    const file = new Blob(
      [
        JSON.stringify(
          {
            ...report,
            exportedAt: new Date().toISOString(),
            snapshotExpired: Date.now() >= Date.parse(report.expiresAt),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(file),
      a = document.createElement("a");
    a.href = url;
    a.download = `swapguard-${report.request.mode}-${report.snapshot.block.number}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <>
      <header className="site-header">
        <div className="brand">
          <img src="/shield.svg" alt="" />
          <span>
            SwapGuard<span className="brand-dot">.</span>
          </span>
        </div>
        <nav aria-label="Main navigation">
          <a className="active" href="#agents">
            For agents
          </a>
          <a href="#tasks">Task replay</a>
          <a href="#evidence">Test reports</a>
          <a href="#workspace">Manual analysis</a>
          <a href="#scope">Scope & limits</a>
        </nav>
        <span className="readonly-pill">
          <LockKeyhole size={13} /> Read-only by design
        </span>
      </header>
      <main>
        <section className="hero">
          <div>
            <p className="eyebrow">
              <span /> COST ACCOUNTING & INTENT CHECKS FOR SWAP AGENTS
            </p>
            <h1>
              One swap task.
              <br />
              <span>Every attempt counts.</span>
            </h1>
            <p className="hero-description">
              For developers of automated Uniswap swaps: keep the original
              minimum output, count gas across approvals and failed retries, and
              explain when to wait or stop. Keep your execution channel; add an
              inspectable task ledger. Manual read-only analysis stays
              available.
            </p>
          </div>
          <div className="hero-note">
            <div className="orbit">
              <ShieldCheck size={43} />
              <span className="orbit-dot one" />
              <span className="orbit-dot two" />
            </div>
            <p>
              Lock the conditions.
              <br />
              Account for each attempt.
              <br />
              <strong>Keep the evidence.</strong>
            </p>
          </div>
        </section>
        <AgentWorkbench />
        <ReceiptEvidence />
        <AgentEvidence />
        <TaskWorkbench />
        <ProtectionLab report={report} now={now} />
        <section
          id="workspace"
          className="workspace"
          aria-label="Swap analysis workspace"
        >
          <div className="trade-column">
            <section className="card swap-card">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">01 / YOUR TRADE</p>
                  <h2>Swap preflight</h2>
                </div>
                <span className="network">
                  <span /> Ethereum
                </span>
              </div>
              <div className="mode-tabs" aria-label="Data mode">
                <button
                  type="button"
                  className={mode === "demo" ? "selected" : ""}
                  aria-pressed={mode === "demo"}
                  onClick={() => changeMode("demo")}
                >
                  <FlaskConical size={15} /> Sample
                </button>
                <button
                  type="button"
                  className={mode === "live" ? "selected" : ""}
                  aria-pressed={mode === "live"}
                  onClick={() => changeMode("live")}
                >
                  <Waves size={15} /> Live onchain
                </button>
              </div>
              <div className={`mode-note ${mode}`}>
                <Info size={15} />
                <span>
                  {mode === "demo"
                    ? "Synthetic data for exploring the checks. Not a live quote or your wallet."
                    : "Read-only Ethereum mainnet calls. Public RPC availability may vary."}
                </span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run();
                }}
              >
                <div className="token-box">
                  <label htmlFor="amount">You pay</label>
                  <div className="token-line">
                    <input
                      id="amount"
                      aria-label="Amount to swap"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => {
                        invalidate();
                        setAmount(e.target.value);
                      }}
                      autoComplete="off"
                    />
                    <div className={`coin ${tokenIn.toLowerCase()}`}>
                      {tokenIn === "WETH" ? "Ξ" : "$"}
                    </div>
                    <label className="sr-only" htmlFor="token">
                      Input token
                    </label>
                    <select
                      id="token"
                      value={tokenIn}
                      onChange={(e) => {
                        invalidate();
                        setTokenIn(e.target.value as TokenSymbol);
                        setAmount(e.target.value === "WETH" ? "0.1" : "250");
                      }}
                    >
                      <option>WETH</option>
                      <option>USDC</option>
                    </select>
                  </div>
                  <small>
                    {TOKENS[tokenIn].name} <span>ERC-20</span>
                  </small>
                </div>
                <div className="reverse-row">
                  <button
                    type="button"
                    aria-label="Reverse pair"
                    onClick={() => {
                      invalidate();
                      setTokenIn(tokenOut);
                      setAmount(tokenOut === "WETH" ? "0.1" : "250");
                    }}
                  >
                    <ArrowDownUp size={17} />
                  </button>
                </div>
                <div className="token-box output-box">
                  <label>Estimated receive</label>
                  <div className="token-line">
                    <div className={`receive-value ${!report ? "muted" : ""}`}>
                      {loading ? (
                        <LoaderCircle className="spin" size={28} />
                      ) : report ? (
                        number(
                          report.quote.amountOut,
                          tokenOut === "USDC" ? 4 : 7,
                        )
                      ) : (
                        "—"
                      )}
                    </div>
                    <div className={`coin ${tokenOut.toLowerCase()}`}>
                      {tokenOut === "WETH" ? "Ξ" : "$"}
                    </div>
                    <strong>{tokenOut}</strong>
                  </div>
                  <small>
                    {report
                      ? `${report.request.mode === "demo" ? "Sample" : "Uniswap v3"} quote · fees included, gas excluded`
                      : "Run the checks to see a quote"}
                  </small>
                </div>
                <div className="slippage-row">
                  <label htmlFor="slippage">
                    Slippage tolerance <CircleHelp size={13} />
                  </label>
                  <div className="slippage-buttons">
                    {["0.1", "0.5", "1"].map((v) => (
                      <button
                        type="button"
                        key={v}
                        className={slippage === v ? "chosen" : ""}
                        onClick={() => {
                          invalidate();
                          setSlippage(v);
                        }}
                      >
                        {v}%
                      </button>
                    ))}
                    <div className="custom-slippage">
                      <input
                        id="slippage"
                        aria-label="Slippage percentage"
                        inputMode="decimal"
                        value={slippage}
                        onChange={(e) => {
                          invalidate();
                          setSlippage(e.target.value);
                        }}
                      />
                      <span>%</span>
                    </div>
                  </div>
                </div>
                <p className="slippage-hint">
                  Choose a percentage; minimum received is calculated
                  automatically.
                  {report && (
                    <>
                      {" "}
                      At this quote:{" "}
                      <strong>
                        {report.quote.minimumOut} {report.tokenOut}
                      </strong>
                      .
                    </>
                  )}{" "}
                  This is a tolerance setting, not observed trading slippage.
                </p>
                {mode === "live" && (
                  <div className="wallet-field">
                    <label htmlFor="owner">
                      Public wallet address <span>optional</span>
                    </label>
                    <input
                      id="owner"
                      placeholder="0x… to inspect balance & allowances"
                      value={owner}
                      onChange={(e) => {
                        invalidate();
                        setOwner(e.target.value.trim());
                      }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <small>
                      Read-only. Your address is sent to the RPC provider; no
                      private key is needed.
                    </small>
                  </div>
                )}
                <button
                  className="primary-button"
                  type="submit"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <LoaderCircle size={18} className="spin" /> Reading
                      onchain data…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={18} />{" "}
                      {mode === "live"
                        ? "Analyze live swap"
                        : "Analyze sample swap"}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <p className="button-caption">
                  <LockKeyhole size={11} /> This button never submits a
                  transaction.
                </p>
                {report && !expired && (
                  <a className="back-to-protection" href="#protection">
                    Quote ready — check a transaction draft above ↑
                  </a>
                )}
              </form>
            </section>
            <section className="scenario-card">
              <p className="eyebrow">EXPLORE THE GUARDRAILS</p>
              <h3>Good quotes. Bad surprises.</h3>
              <p>
                Try a normal quote, excessive exposure, or an outdated oracle.
              </p>
              <div className="scenario-buttons">
                {scenarios.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    aria-pressed={mode === "demo" && scenario === s.value}
                    onClick={() => {
                      setMode("demo");
                      setScenario(s.value);
                      void run({ mode: "demo", scenario: s.value });
                    }}
                  >
                    {s.label}
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
              <small>All three scenarios use synthetic data.</small>
            </section>
          </div>

          <section
            className="card report-card"
            aria-live="polite"
            aria-busy={loading}
          >
            <div className="card-heading">
              <div>
                <p className="eyebrow">02 / THE SECOND LOOK</p>
                <h2>Risk breakdown</h2>
              </div>
              {report && (
                <span className={`source-pill ${report.request.mode}`}>
                  {report.request.mode === "demo"
                    ? "SAMPLE DATA"
                    : "LIVE SNAPSHOT"}
                </span>
              )}
            </div>
            {error ? (
              <div className="error-state" role="alert">
                <TriangleAlert size={32} />
                <h3>We couldn’t complete the checks</h3>
                <p>{error}</p>
                <p>No successful report is retained for this request.</p>
              </div>
            ) : loading ? (
              <div className="empty-state">
                <LoaderCircle className="spin" size={36} />
                <h3>Reading, not signing.</h3>
                <p>
                  Fetching pool quotes, reference prices and any requested
                  wallet data.
                </p>
              </div>
            ) : !report ? (
              <div className="empty-state">
                <Eye size={40} />
                <h3>A little context goes a long way.</h3>
                <p>
                  Enter your trade and run the preflight. Any change to your
                  inputs clears the previous report.
                </p>
              </div>
            ) : (
              <>
                <div
                  className={`verdict ${expired ? "expired" : report.decision}`}
                  data-testid="verdict"
                >
                  {expired ? (
                    <Clock3 size={28} />
                  ) : report.decision === "blocked" ? (
                    <ShieldX size={29} />
                  ) : (
                    <ShieldCheck size={29} />
                  )}
                  <div>
                    <h3>
                      {expired
                        ? "Snapshot expired — run again"
                        : decisions[report.decision]}
                    </h3>
                    <p>
                      {expired
                        ? "Quotes are valid for 60 seconds in this tool. Market conditions may have changed."
                        : report.decision === "clear"
                          ? "The inspected checks passed. This is not a guarantee of safety."
                          : report.decision === "review"
                            ? "Some checks need attention or could not be completed."
                            : "Do not rely on this snapshot to proceed without addressing the flags."}
                    </p>
                  </div>
                </div>
                <div className="report-meta">
                  <span>
                    <Clock3 size={13} />
                    {expired
                      ? "Expired"
                      : `${secondsLeft}s until refresh needed`}
                  </span>
                  <span>
                    {report.request.mode === "demo"
                      ? "SYNTHETIC"
                      : `BLOCK ${report.snapshot.block.number}`}
                  </span>
                </div>
                <div className="checks">
                  {report.checks.map((c) => (
                    <details className={`check-row ${c.status}`} key={c.id}>
                      <summary>
                        <StatusIcon status={c.status} />
                        <span>{c.title}</span>
                        <b>{labels[c.status]}</b>
                        <ChevronDown size={14} />
                      </summary>
                      <p>{c.detail}</p>
                    </details>
                  ))}
                </div>
                <div className="quote-details">
                  <div>
                    <span>Minimum received</span>
                    <strong title={report.quote.minimumOut}>
                      {number(report.quote.minimumOut, 8)} {report.tokenOut}
                    </strong>
                  </div>
                  <div>
                    <span>Reference output</span>
                    <strong>
                      {report.quote.referenceOut
                        ? `${number(report.quote.referenceOut, 6)} ${report.tokenOut}`
                        : "Unavailable"}
                    </strong>
                  </div>
                  <div>
                    <span>Selected pool fee</span>
                    <strong>
                      {report.quote.selectedFee / 10000}%{" "}
                      <span className="tiny-label">INCLUDED</span>
                    </strong>
                  </div>
                </div>
                <details className="evidence">
                  <summary>
                    Inspect sources & exact amounts <ChevronDown size={15} />
                  </summary>
                  <div className="evidence-body">
                    <p>
                      All live contract reads use the same block number. Sample
                      block numbers, prices and balances are synthetic.
                    </p>
                    <div>
                      <span>QuoterV2</span>
                      <Address value={CONTRACTS.quoter} />
                    </div>
                    {Object.values(report.snapshot.feeds).map((f) => (
                      <div key={f.address}>
                        <span>
                          {f.name}
                          <small>
                            Updated{" "}
                            {new Date(f.updatedAt * 1000).toLocaleTimeString()}{" "}
                            · max age {f.maxAgeSeconds}s
                          </small>
                        </span>
                        <Address value={f.address} />
                      </div>
                    ))}
                    <p className="exact">
                      Exact minimum output: {report.quote.minimumOut}{" "}
                      {report.tokenOut}
                    </p>
                    <p>Compared single-pool routes:</p>
                    {report.snapshot.routes.map((r) => (
                      <div key={r.fee}>
                        <span>{r.fee / 10000}% fee</span>
                        <span>
                          {number(
                            formatUnits(
                              BigInt(r.amountOutRaw),
                              TOKENS[report.tokenOut].decimals,
                            ),
                            8,
                          )}{" "}
                          {report.tokenOut}
                        </span>
                      </div>
                    ))}
                    {report.snapshot.wallet && (
                      <>
                        <p>
                          {report.snapshot.wallet.sample
                            ? "Synthetic wallet allowances"
                            : `Wallet ${shorten(report.snapshot.wallet.address || "")}`}
                        </p>
                        {report.snapshot.wallet.allowances.map((a) => (
                          <div key={a.address}>
                            <span>
                              {a.name}
                              <small>
                                <Address value={a.address} />
                              </small>
                            </span>
                            <span>
                              {a.amountRaw === null
                                ? "Unknown"
                                : BigInt(a.amountRaw) > 2n ** 255n
                                  ? "Effectively unlimited"
                                  : `${number(formatUnits(BigInt(a.amountRaw), TOKENS[report.request.tokenIn].decimals), 6)} ${report.request.tokenIn}`}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </details>
                <button
                  type="button"
                  className="export-button"
                  onClick={exportReport}
                >
                  <Download size={16} /> Export{" "}
                  {report.request.mode === "demo" ? "sample " : ""}report{" "}
                  <span>JSON</span>
                </button>
              </>
            )}
          </section>
        </section>
        <section id="method" className="method">
          <div>
            <p className="eyebrow">FROM CONDITIONS TO AN ACCOUNTED OUTCOME.</p>
            <h2>One task, three checks.</h2>
          </div>
          <div className="method-grid">
            <article>
              <span>01</span>
              <h3>The conditions</h3>
              <p>
                Lock the original minimum output, cumulative gas budget,
                deadline and retry limit. Do not reset the floor after failure.
              </p>
            </article>
            <article>
              <span>02</span>
              <h3>The protocol context</h3>
              <p>
                Read Uniswap v3 quotes and Chainlink references. Check a
                supported legacy router draft separately, with explicit limits.
              </p>
            </article>
            <article>
              <span>03</span>
              <h3>The evidence</h3>
              <p>
                Reconcile approval and failed-operation gas in replay. Export
                decisions, receipt provenance and non-completed outcomes too.
              </p>
            </article>
          </div>
        </section>
        <section id="scope" className="scope">
          <Info size={21} />
          <div>
            <h3>Useful checks. Honest limits.</h3>
            <p>
              SwapGuard is an advisory, read-only prototype. Its parameter
              verifier covers one legacy SwapRouter02 call shape, not Universal
              Router. A parameter match is not a safety or execution-readiness
              verdict. It does not execute swaps, audit tokens, predict MEV, or
              guarantee safety. WETH/USDC on Ethereum only. Allowance checks
              cover ERC-20 approvals to SwapRouter02 and Permit2, not Permit2
              per-spender permissions or signatures. Live quoted token amounts
              exclude gas. The task workbench separately models gas using
              local-fork measurements and constructed price paths; its receipts
              are synthetic. Budget checks are estimates, not onchain
              enforcement. Waiting may reduce completion. Prices and actual gas
              can change after a check.
            </p>
            <p>
              Policy: review price deviation ≥0.50% or slippage ≥1%; flag
              deviation ≥1.50% or slippage ≥3%. These are transparent product
              thresholds, not universal trading recommendations.
            </p>
          </div>
        </section>
      </main>
      <footer>
        <div className="brand">
          <ShieldCheck size={21} />
          <span>SwapGuard.</span>
        </div>
        <span>ETHOnline 2026 · Agent cost ledger & manual analysis</span>
        <a
          href="https://developers.uniswap.org/docs/protocols/v3/deployments/v3-ethereum-deployments"
          target="_blank"
          rel="noreferrer"
        >
          Protocol references <ArrowUpRight size={13} />
        </a>
      </footer>
    </>
  );
}
