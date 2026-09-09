import { useEffect, useState } from "react";
import {
  ArrowDown,
  CheckCircle2,
  Download,
  FlaskConical,
  LockKeyhole,
  Play,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { formatUnits } from "viem";
import { TOKENS } from "./lib/contracts";
import {
  exampleDraft,
  intentFromReport,
  parseDraftText,
  verifyProtection,
  type LockedIntent,
  type ProtectionResult,
} from "./lib/protection";
import {
  fixtureDataset,
  PROTECTION_FIXTURES,
  runFixture,
  SAMPLE_SENDER,
} from "./lib/protection-fixtures";
import type { Report } from "./lib/types";
import "./protection.css";

const json = (v: unknown) => JSON.stringify(v, null, 2);
function download(value: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([json(value)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Conditions({ intent }: { intent: LockedIntent }) {
  const out = intent.tokenIn === "USDC" ? "WETH" : "USDC";
  return (
    <div className="locked-conditions">
      <p className="eyebrow">
        <LockKeyhole size={13} /> INDEPENDENTLY CONFIRMED CONDITIONS
      </p>
      <dl>
        <div>
          <dt>Pay exactly</dt>
          <dd>
            {formatUnits(
              BigInt(intent.amountInRaw),
              TOKENS[intent.tokenIn].decimals,
            )}{" "}
            {intent.tokenIn}
          </dd>
        </div>
        <div>
          <dt>Quoted receive</dt>
          <dd>
            {formatUnits(BigInt(intent.quoteOutRaw), TOKENS[out].decimals)}{" "}
            {out}
          </dd>
        </div>
        <div>
          <dt>Slippage tolerance</dt>
          <dd>{intent.slippageBps / 100}%</dd>
        </div>
        <div className="floor-highlight">
          <dt>Auto-calculated minimum</dt>
          <dd data-testid="locked-minimum">
            {formatUnits(BigInt(intent.minimumOutRaw), TOKENS[out].decimals)}{" "}
            {out}
          </dd>
        </div>
        <div>
          <dt>Receive address</dt>
          <dd className="mono">{intent.recipient}</dd>
        </div>
        <div>
          <dt>Latest transaction deadline</dt>
          <dd>{new Date(intent.deadline * 1000).toISOString()}</dd>
        </div>
      </dl>
      <p className="microcopy">
        Output-relative formula: quote × (1 − tolerance), rounded down once in
        token base units. This tool's convention is explicit; other SDKs may
        express tolerance differently.
      </p>
      <details>
        <summary>Inspect locked conditions & fingerprint</summary>
        <pre>{json(intent)}</pre>
      </details>
      <p className="microcopy">
        Fingerprint identifies these conditions; it is not a wallet signature or
        authenticated consent.
      </p>
    </div>
  );
}
function Result({
  result,
  intent,
}: {
  result: ProtectionResult;
  intent: LockedIntent;
}) {
  const out = intent.tokenIn === "USDC" ? "WETH" : "USDC";
  const bad = result.decision === "MISMATCH";
  return (
    <div
      className="protection-result"
      aria-live="polite"
      data-testid="protection-result"
    >
      <div className={`protection-verdict ${result.decision.toLowerCase()}`}>
        {result.decision === "MATCH" ? (
          <CheckCircle2 size={23} />
        ) : (
          <TriangleAlert size={23} />
        )}
        <div>
          <strong>
            {result.decision === "MATCH"
              ? "Parameters match — not a safety verdict"
              : bad
                ? "Confirmed protection is not preserved"
                : result.decision === "EXPIRED"
                  ? "Confirmation expired — refresh required"
                  : "No match verdict can be issued"}
          </strong>
          <span>{result.decision}</span>
          <p>{result.reason}</p>
        </div>
      </div>
      {result.minimumGapRaw && BigInt(result.minimumGapRaw) > 0n && (
        <div className="gap-callout">
          <strong>
            {formatUnits(BigInt(result.minimumGapRaw), TOKENS[out].decimals)}{" "}
            {out}
          </strong>
          <span>
            less minimum-output protection than confirmed.
            <br />
            Not an observed loss or an estimate of money saved.
          </span>
        </div>
      )}
      {result.checks.length > 0 && (
        <div className="comparison-table">
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Confirmed condition</th>
                <th>Encoded transaction</th>
              </tr>
            </thead>
            <tbody>
              {result.checks.map((c) => (
                <tr key={c.id} className={c.matches ? "" : "different"}>
                  <th>
                    {c.matches ? "✓" : "!"} {c.label}
                  </th>
                  <td>{c.expected}</td>
                  <td>{c.actual}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="microcopy">
        No onchain enforcement, execution simulation, wallet authentication, MEV
        detection or full security audit. The exact checked draft must still be
        the one submitted by an independent signer; this site does not bind a
        wallet signing request.
      </p>
    </div>
  );
}

export default function ProtectionLab({
  report,
  now,
}: {
  report: Report | null;
  now: number;
}) {
  const [tab, setTab] = useState<"fixtures" | "custom">("fixtures");
  const [selected, setSelected] = useState("weakened-floor");
  const [replayed, setReplayed] = useState(false);
  const [suite, setSuite] = useState<ReturnType<typeof runFixture>[] | null>(
    null,
  );
  const [suiteMs, setSuiteMs] = useState(0);
  const [sender, setSender] = useState(SAMPLE_SENDER);
  const [sameRecipient, setSameRecipient] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [locked, setLocked] = useState<LockedIntent | null>(null);
  const [draftText, setDraftText] = useState("");
  const [checked, setChecked] = useState(false);
  const [constructed, setConstructed] = useState(false);
  const [error, setError] = useState("");
  const epoch = Math.floor(now / 1000);
  const fixture = PROTECTION_FIXTURES.find((f) => f.id === selected)!;
  const replay = replayed ? runFixture(fixture) : null;
  useEffect(() => {
    setLocked(null);
    setChecked(false);
    setDraftText("");
    setError("");
    setSender(
      report?.request.mode === "live"
        ? report.request.owner || ""
        : SAMPLE_SENDER,
    );
    setRecipient("");
    setSameRecipient(true);
  }, [report]);
  function resetLock() {
    setLocked(null);
    setChecked(false);
    setError("");
  }
  function confirm() {
    try {
      if (!report)
        throw new Error("Get a current quote in the quote panel first.");
      const intent = intentFromReport(
        report,
        sender.trim(),
        sameRecipient ? sender.trim() : recipient.trim(),
        epoch,
      );
      setLocked(intent);
      setChecked(false);
      setDraftText("");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot confirm conditions.");
    }
  }
  let customResult: ProtectionResult | null = null;
  if (checked && locked) {
    try {
      customResult = verifyProtection(locked, parseDraftText(draftText), epoch);
    } catch (e) {
      customResult = {
        decision: "INVALID",
        reason: e instanceof Error ? e.message : "Invalid transaction JSON.",
        checks: [],
        intentFingerprint: locked.fingerprint,
        checkedAt: epoch,
      };
    }
  }
  const stale = !report || now >= Date.parse(report.expiresAt);
  // The display clock updates on a timer and a server can also be ahead of the
  // client. Never offer confirmation before the quote's validity interval.
  const quoteInFuture =
    !!report && epoch < Math.floor(Date.parse(report.createdAt) / 1000);
  const lockExpired = !!locked && epoch >= locked.quoteExpiresAt;
  return (
    <section
      id="protection"
      className="protection-section"
      aria-label="Minimum output protection lab"
    >
      <div className="lab-heading">
        <div>
          <p className="eyebrow">THE QUOTE IS NOT THE PROMISE</p>
          <h2>Did your minimum survive?</h2>
          <p>
            Compare what you agreed to with what the transaction actually
            encodes.
          </p>
        </div>
        <span className="source-pill demo">NEW · PARAMETER VERIFICATION</span>
      </div>
      <div className="lab-tabs" role="group" aria-label="Protection mode">
        <button
          aria-pressed={tab === "fixtures"}
          onClick={() => setTab("fixtures")}
        >
          <FlaskConical size={16} /> Reproducible test lab
        </button>
        <button
          aria-pressed={tab === "custom"}
          onClick={() => setTab("custom")}
        >
          <ShieldCheck size={16} /> Check a transaction draft
        </button>
      </div>
      {tab === "fixtures" ? (
        <>
          <div className="lab-notice">
            <FlaskConical size={19} />
            <p>
              <strong>Constructed data. Real parameter decoding.</strong> Every
              quote, wallet and transaction in this lab is synthetic. Runs use
              the displayed fixed replay clock, not today's market. No
              transaction is sent or simulated.
            </p>
          </div>
          <div className="fixture-toolbar">
            <label htmlFor="fixture">Choose a test case</label>
            <select
              id="fixture"
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setReplayed(false);
              }}
            >
              {PROTECTION_FIXTURES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.title}
                </option>
              ))}
            </select>
          </div>
          <div className="lab-grid">
            <Conditions intent={fixture.intent} />
            <div className="draft-case">
              <p className="eyebrow">THE CONSTRUCTED TRANSACTION</p>
              <h3>{fixture.title}</h3>
              <p>{fixture.explanation}</p>
              <div className="quote-baseline">
                <span>Displayed quote alone</span>
                <strong>
                  {formatUnits(
                    BigInt(fixture.intent.quoteOutRaw),
                    TOKENS[fixture.intent.tokenIn === "USDC" ? "WETH" : "USDC"]
                      .decimals,
                  )}{" "}
                  {fixture.intent.tokenIn === "USDC" ? "WETH" : "USDC"}
                </strong>
                <small>
                  Unchanged across each mutation of the same baseline. This is
                  not an execution result or a competing security tool.
                </small>
              </div>
              <p className="microcopy">
                Expected: <b>{fixture.expected}</b> · Replay clock:{" "}
                {new Date(fixture.replayAt * 1000).toISOString()}
              </p>
              <button
                className="primary-button"
                onClick={() => setReplayed(true)}
              >
                <Play size={16} /> Run this verification
              </button>
              <details>
                <summary>Inspect exact transaction JSON</summary>
                <pre>{json(fixture.draft)}</pre>
              </details>
              <button
                className="text-button"
                onClick={() =>
                  download(fixture, `swapguard-case-${fixture.id}.json`)
                }
              >
                <Download size={14} /> Download this case
              </button>
            </div>
          </div>
          {replay && (
            <>
              <Result result={replay.result} intent={fixture.intent} />
              <p className="expectation" data-testid="case-expectation">
                {replay.matchedExpectation
                  ? "✓ Observed result matches the declared expectation."
                  : "! Observed result differs from the declared expectation."}
              </p>
            </>
          )}
          <section
            className="benchmark-panel"
            aria-label="Reproducible benchmark"
          >
            <div className="lab-heading">
              <div>
                <h3>Test the claim, not just the happy path.</h3>
                <p>
                  {PROTECTION_FIXTURES.length} published cases: controls,
                  parameter faults, unsupported formats and stale confirmations.
                </p>
              </div>
            </div>
            <div className="lab-actions">
              <button
                className="primary-button"
                onClick={() => {
                  const t = performance.now();
                  setSuite(PROTECTION_FIXTURES.map(runFixture));
                  setSuiteMs(performance.now() - t);
                }}
              >
                <Play size={15} /> Run all {PROTECTION_FIXTURES.length} cases
              </button>
              <button
                className="secondary-button"
                onClick={() =>
                  download(
                    fixtureDataset(),
                    "swapguard-protection-fixtures-v1.json",
                  )
                }
              >
                <Download size={15} /> Download full dataset
              </button>
            </div>
            {suite && (
              <>
                <div
                  className="benchmark-summary"
                  data-testid="benchmark-summary"
                >
                  <strong>
                    {suite.filter((s) => s.matchedExpectation).length}/
                    {suite.length}
                  </strong>
                  <span>
                    declared expectations matched
                    <br />
                    {suiteMs.toFixed(1)} ms in this browser · deterministic
                    local checks, no RPC
                  </span>
                </div>
                <p className="microcopy">
                  Controls passing:{" "}
                  {
                    suite.filter(
                      (s, i) =>
                        PROTECTION_FIXTURES[i].kind === "control" &&
                        s.result.decision === "MATCH",
                    ).length
                  }
                  /
                  {
                    PROTECTION_FIXTURES.filter((f) => f.kind === "control")
                      .length
                  }
                  . Non-controls incorrectly matched:{" "}
                  {
                    suite.filter(
                      (s, i) =>
                        PROTECTION_FIXTURES[i].kind !== "control" &&
                        s.result.decision === "MATCH",
                    ).length
                  }
                  . These constructed cases do not measure real-world detection
                  accuracy, attack prevalence, or financial savings.
                </p>
                <button
                  className="text-button"
                  onClick={() =>
                    download(
                      {
                        ...fixtureDataset(),
                        runAt: new Date().toISOString(),
                        elapsedMs: suiteMs,
                        results: suite,
                      },
                      "swapguard-protection-results-v1.json",
                    )
                  }
                >
                  <Download size={14} /> Download observed results
                </button>
                <details>
                  <summary>All expected vs observed results</summary>
                  <div className="comparison-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Case</th>
                          <th>Expected</th>
                          <th>Observed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {suite.map((s, i) => (
                          <tr
                            key={s.id}
                            className={s.matchedExpectation ? "" : "different"}
                          >
                            <td>
                              <button
                                className="text-button"
                                onClick={() => {
                                  setSelected(s.id);
                                  setReplayed(true);
                                  document
                                    .getElementById("protection")
                                    ?.scrollIntoView({ behavior: "smooth" });
                                }}
                              >
                                {PROTECTION_FIXTURES[i].title}
                              </button>
                            </td>
                            <td>{s.expected}</td>
                            <td>{s.result.decision}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </>
            )}
            <p className="microcopy">
              Method: deliberately mutate one field at a time, keep the
              confirmed conditions fixed, and include
              stronger-floor/reverse-pair controls. The encoder and verifier
              share ABI libraries; tests also include a hand-encoded reference.
              This is a transparent regression suite, not independent
              validation.
            </p>
          </section>
        </>
      ) : (
        <>
          <div className="lab-notice">
            <LockKeyhole size={19} />
            <p>
              <strong>
                You choose the tolerance; we calculate the minimum.
              </strong>{" "}
              Confirm a quote independently, then paste only the transaction
              JSON. Imported drafts cannot overwrite your conditions. Nothing is
              signed, saved, or sent by this checker.
            </p>
          </div>
          <div className="lab-grid">
            <div className="confirm-panel">
              <p className="eyebrow">1 / CONFIRM YOUR CONDITIONS</p>
              <p>
                {report
                  ? `${report.request.mode === "demo" ? "SYNTHETIC" : "LIVE"} quote: ${report.request.amount} ${report.request.tokenIn} → ${report.quote.amountOut} ${report.tokenOut}`
                  : "Start by getting a quote in the panel below."}
              </p>
              {report && (
                <div className="auto-floor">
                  <span>
                    {report.request.slippageBps / 100}% tolerance automatically
                    sets
                  </span>
                  <strong>
                    {report.quote.minimumOut} {report.tokenOut} minimum
                  </strong>
                  <small>
                    You do not need to calculate or type this amount.
                  </small>
                </div>
              )}
              <a className="text-button" href="#workspace">
                <ArrowDown size={14} /> Change amount / slippage or refresh
                quote
              </a>
              <label htmlFor="intent-sender">Sender address</label>
              <input
                id="intent-sender"
                value={sender}
                autoComplete="off"
                spellCheck={false}
                placeholder="0x… public address only"
                onChange={(e) => {
                  resetLock();
                  setSender(e.target.value);
                }}
              />
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={sameRecipient}
                  onChange={(e) => {
                    resetLock();
                    setSameRecipient(e.target.checked);
                  }}
                />{" "}
                Receive into the same address
              </label>
              {!sameRecipient && (
                <>
                  <label htmlFor="intent-recipient">Receive address</label>
                  <input
                    id="intent-recipient"
                    value={recipient}
                    spellCheck={false}
                    onChange={(e) => {
                      resetLock();
                      setRecipient(e.target.value);
                    }}
                  />
                </>
              )}
              {report?.request.mode === "demo" && (
                <p className="microcopy">
                  Sample mode prefills a synthetic address. This is not your
                  wallet.
                </p>
              )}
              <button
                className="primary-button"
                disabled={
                  stale || quoteInFuture || report?.decision === "blocked"
                }
                onClick={confirm}
              >
                <LockKeyhole size={16} /> Confirm & lock conditions
              </button>
              <p className="microcopy">
                Quote checks expire after 60s. The transaction deadline is
                capped at 5 minutes from quote creation. Any quote/input change
                clears this confirmation.
              </p>
              {stale && (
                <p className="inline-warning">
                  Get a fresh quote before confirming.
                </p>
              )}
              {quoteInFuture && (
                <p className="inline-warning">
                  Waiting for this quote's validity window. If this persists,
                  check your device clock and refresh the quote.
                </p>
              )}
              {report?.decision === "blocked" && (
                <p className="inline-warning">
                  Resolve blocking quote flags before confirming.
                </p>
              )}
              {error && (
                <p role="alert" className="inline-warning">
                  {error}
                </p>
              )}
            </div>
            <div className="draft-case">
              <p className="eyebrow">2 / CHECK THE ENCODED DRAFT</p>
              <p>
                Accepts only Ethereum SwapRouter02 (legacy): a deadline-bound
                multicall containing one exactInputSingle. No Universal Router,
                permits, extra calls or partial-input price limits.
              </p>
              <label htmlFor="draft-json">Transaction JSON</label>
              <textarea
                id="draft-json"
                value={draftText}
                maxLength={12000}
                spellCheck={false}
                placeholder={
                  '{"chainId":1,"from":"0x…","to":"0x…","value":"0","data":"0x…"}'
                }
                onChange={(e) => {
                  setDraftText(e.target.value);
                  setChecked(false);
                  setConstructed(false);
                }}
              />
              <p className="microcopy">
                Required: chainId (number), from, to, value (decimal wei
                string), data (hex). Local decoding only; no RPC request for
                this draft.
              </p>
              {locked && (
                <div className="lab-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      setDraftText(json(exampleDraft(locked)));
                      setChecked(false);
                      setConstructed(true);
                    }}
                  >
                    Load constructed normal draft
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setDraftText(
                        json(exampleDraft(locked, { amountOutMinimum: 0n })),
                      );
                      setChecked(false);
                      setConstructed(true);
                    }}
                  >
                    Load constructed zero-floor draft
                  </button>
                </div>
              )}
              {constructed && (
                <p className="inline-warning">
                  Constructed unsigned test draft, even when the locked quote is
                  live. It is not a pending wallet transaction.
                </p>
              )}
              <button
                className="primary-button"
                disabled={!locked || !draftText || lockExpired}
                onClick={() => setChecked(true)}
              >
                <ShieldCheck size={16} /> Verify locked conditions
              </button>
              {!locked && (
                <p className="microcopy">
                  Confirm your conditions first. Pasting JSON never confirms
                  them.
                </p>
              )}
              {lockExpired && (
                <p className="inline-warning">
                  Locked quote expired. Refresh and confirm again.
                </p>
              )}
            </div>
          </div>
          {locked && (
            <details className="locked-summary">
              <summary>Review the independently locked conditions</summary>
              <Conditions intent={locked} />
            </details>
          )}
          {customResult && locked && (
            <>
              <Result result={customResult} intent={locked} />
              <button
                className="text-button"
                onClick={() =>
                  download(
                    {
                      provenance: constructed
                        ? "constructed unsigned draft"
                        : "user-supplied unsigned draft; origin not authenticated",
                      intent: locked,
                      transactionText: draftText,
                      result: customResult,
                    },
                    "swapguard-draft-verification.json",
                  )
                }
              >
                <Download size={14} /> Export verification evidence
              </button>
            </>
          )}
        </>
      )}
      <details className="slippage-explainer">
        <summary>
          Slippage vs minimum received — what is the difference? /
          滑点与最低到账量
        </summary>
        <div>
          <p>
            <strong>
              Tolerance is your percentage setting; minimum received is the
              corresponding token amount encoded in a supported exact-input
              transaction.
            </strong>{" "}
            Here a 0.400 WETH quote with 0.5% tolerance produces a 0.398 WETH
            floor. Realized slippage is the change between quoted and executed
            output; this read-only tool cannot observe a future fill.
          </p>
          <p>
            通常只需选择滑点容忍度，不用手填最低到账量。网站按已确认报价自动计算底线；这里验证的是交易有没有把底线降低、清零或写错。实际成交滑点、交易造成的价格影响和合约中的最低到账约束不是同一个概念。
          </p>
          <p>
            A reasonable-looking quote or successful execution simulation does
            not prove that the encoded floor preserves your conditions. This lab
            does not simulate either transaction execution or an attack.
          </p>
          <a
            href="https://developers.uniswap.org/docs/protocols/v3/guides/swapping/single-hop-swapping"
            target="_blank"
            rel="noreferrer"
          >
            Uniswap's explanation of minimum output →
          </a>
        </div>
      </details>
    </section>
  );
}
