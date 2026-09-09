import { describe, expect, it } from "vitest";
import { encodeFunctionData, maxUint256, type Hex } from "viem";
import { CONTRACTS, TOKENS } from "../src/lib/contracts";
import { minimumFromQuote } from "../src/lib/protection-math";
import {
  DEADLINE_ABI,
  exampleDraft,
  intentFromReport,
  lockIntent,
  parseDraft,
  parseDraftText,
  verifyProtection,
} from "../src/lib/protection";
import {
  fixtureDataset,
  OTHER_ADDRESS,
  PROTECTION_FIXTURES,
  REPLAY_TIME,
  runFixture,
} from "../src/lib/protection-fixtures";
import { analyze } from "../src/lib/engine";
import { demoSnapshot } from "../server/demo";

const intent = PROTECTION_FIXTURES[0].intent;
const draft = PROTECTION_FIXTURES[0].draft;
describe("output-relative slippage conversion", () => {
  it("automatically converts 0.400 WETH at 0.5% into 0.398 WETH", () => {
    expect(minimumFromQuote(400000000000000000n, 50)).toBe(398000000000000000n);
  });
  it("floors USDC once, not via floating point or rounded display values", () => {
    expect(minimumFromQuote(2500000001n, 50)).toBe(2487500000n);
    expect(minimumFromQuote(maxUint256, 1)).toBe((maxUint256 * 9999n) / 10000n);
  });
  it.each([-1, 0, 0.5, 1001, NaN, Infinity])(
    "rejects invalid bps %s",
    (bps) => {
      expect(() => minimumFromQuote(1000n, bps)).toThrow();
    },
  );
  it.each([0n, -1n, maxUint256 + 1n])(
    "rejects invalid output quote %s",
    (q) => {
      expect(() => minimumFromQuote(q, 50)).toThrow();
    },
  );
  it("will not lock a zero floor due to dust rounding", () => {
    expect(() => lockIntent({ ...intent, quoteOutRaw: "1" })).toThrow(
      /rounds to zero/,
    );
  });
});

describe("published reproducible cases", () => {
  it.each(PROTECTION_FIXTURES)("$id: $expected", (f) => {
    const run = runFixture(f);
    expect(run.result.decision).toBe(f.expected);
    expect(run.matchedExpectation).toBe(true);
  });
  it("separates controls, faults and unsupported formats, without savings claims", () => {
    const dataset = fixtureDataset();
    expect(dataset.fixtures).toHaveLength(25);
    expect(dataset.provenance).toContain("synthetic");
    expect(
      PROTECTION_FIXTURES.filter((f) => f.kind === "control"),
    ).toHaveLength(3);
    const weakened = runFixture(
      PROTECTION_FIXTURES.find((f) => f.id === "weakened-floor")!,
    );
    expect(weakened.result.minimumGapRaw).toBe("38000000000000000");
    expect(
      weakened.result.checks.filter((c) => !c.matches).map((c) => c.id),
    ).toEqual(["minimum"]);
  });
});

describe("decoder compatibility and strict coverage", () => {
  it("accepts a reference encoded by explicit ABI words, not the fixture encoder", () => {
    // Pinned SwapRouter02 selectors, seven static tuple words; bytes[] offsets
    // are independently constructed here, without encodeFunctionData.
    const word = (x: bigint) => x.toString(16).padStart(64, "0");
    const addr = (a: string) => a.slice(2).toLowerCase().padStart(64, "0");
    const inner =
      "04e45aaf" +
      addr(TOKENS.USDC.address) +
      addr(TOKENS.WETH.address) +
      word(500n) +
      addr(intent.recipient) +
      word(1000000000n) +
      word(398000000000000000n) +
      word(0n);
    const data =
      "0x5ae401dc" +
      word(BigInt(intent.deadline)) +
      word(64n) +
      word(1n) +
      word(32n) +
      word(BigInt(inner.length / 2)) +
      inner.padEnd(Math.ceil(inner.length / 64) * 64, "0");
    expect(data).toBe(draft.data);
    expect(
      verifyProtection(intent, { ...draft, data }, REPLAY_TIME).decision,
    ).toBe("MATCH");
  });
  it("rejects trailing bytes inside the one permitted call", () => {
    const inner = `0x04e45aaf${"00".repeat(7 * 32)}00` as Hex;
    const data = encodeFunctionData({
      abi: DEADLINE_ABI,
      functionName: "multicall",
      args: [BigInt(intent.deadline), [inner]],
    });
    expect(
      verifyProtection(intent, { ...draft, data }, REPLAY_TIME).decision,
    ).toBe("UNSUPPORTED");
  });
  it("does not treat Universal Router's address as an equivalent deployment", () => {
    const r = verifyProtection(
      intent,
      { ...draft, to: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af" },
      REPLAY_TIME,
    );
    expect(r.decision).toBe("MISMATCH");
    expect(r.checks.find((c) => c.id === "router")?.matches).toBe(false);
  });
  it("returns unsupported for an unknown selector and empty multicall", () => {
    expect(
      verifyProtection(intent, { ...draft, data: "0xdeadbeef" }, REPLAY_TIME)
        .decision,
    ).toBe("UNSUPPORTED");
    const data = encodeFunctionData({
      abi: DEADLINE_ABI,
      functionName: "multicall",
      args: [BigInt(intent.deadline), []],
    });
    expect(
      verifyProtection(intent, { ...draft, data }, REPLAY_TIME).decision,
    ).toBe("UNSUPPORTED");
  });
});

describe("intent boundary", () => {
  it("locks canonical immutable fields and ignores injected override fields", () => {
    const locked = lockIntent({
      ...intent,
      router: OTHER_ADDRESS,
      minimumOutRaw: "0",
    } as typeof intent);
    expect(locked.router).toBe(CONTRACTS.router);
    expect(locked.minimumOutRaw).toBe("398000000000000000");
    expect(Object.isFrozen(locked)).toBe(true);
  });
  it.each([
    { minimumOutRaw: "0" },
    { slippageBps: 1000 },
    { recipient: OTHER_ADDRESS },
    { quoteOutRaw: "1000" },
    { router: OTHER_ADDRESS },
    { chainId: 8453 },
    { version: "future" },
    { fingerprint: "0x00" },
  ])("rejects a modified locked intent %s", (changes) => {
    expect(
      verifyProtection(
        { ...intent, ...changes } as typeof intent,
        draft,
        REPLAY_TIME,
      ).decision,
    ).toBe("INVALID");
  });
  it("is not a signature: a caller can intentionally create a different valid commitment", () => {
    const different = lockIntent({ ...intent, recipient: OTHER_ADDRESS });
    expect(different.fingerprint).not.toBe(intent.fingerprint);
    expect(
      verifyProtection(different, exampleDraft(different), REPLAY_TIME)
        .decision,
    ).toBe("MATCH");
  });
  it("expires a formerly matching transaction and rejects future-dated context", () => {
    expect(
      verifyProtection(intent, draft, intent.quoteExpiresAt - 1).decision,
    ).toBe("MATCH");
    expect(
      verifyProtection(intent, draft, intent.quoteExpiresAt).decision,
    ).toBe("EXPIRED");
    expect(verifyProtection(intent, draft, intent.quotedAt - 1).decision).toBe(
      "EXPIRED",
    );
    expect(verifyProtection(intent, draft, NaN).decision).toBe("INVALID");
  });
  it.each([
    "0x0000000000000000000000000000000000000000",
    "0x0000000000000000000000000000000000000001",
    CONTRACTS.router,
    "not-an-address",
  ])("rejects unsafe or ambiguous confirmation address %s", (recipient) => {
    expect(() => lockIntent({ ...intent, recipient })).toThrow();
  });
  it("locks fresh reports, recomputes the floor, and rejects blocked/expired reports", () => {
    const req = {
      mode: "demo" as const,
      scenario: "normal" as const,
      tokenIn: "WETH" as const,
      amount: "0.1",
      slippageBps: 50,
    };
    const report = analyze(req, demoSnapshot(req, REPLAY_TIME), REPLAY_TIME);
    const locked = intentFromReport(
      report,
      intent.sender,
      intent.recipient,
      REPLAY_TIME,
    );
    expect(locked.minimumOutRaw).toBe(report.quote.minimumOutRaw);
    expect(
      intentFromReport(
        { ...report, quote: { ...report.quote, minimumOutRaw: "0" } },
        intent.sender,
        intent.recipient,
        REPLAY_TIME,
      ).minimumOutRaw,
    ).toBe(report.quote.minimumOutRaw);
    expect(() =>
      intentFromReport(
        report,
        intent.sender,
        intent.recipient,
        REPLAY_TIME + 60,
      ),
    ).toThrow();
    expect(() =>
      intentFromReport(
        { ...report, decision: "blocked" },
        intent.sender,
        intent.recipient,
        REPLAY_TIME,
      ),
    ).toThrow();
  });
});

describe("untrusted draft input", () => {
  it.each([
    null,
    [],
    {},
    { ...draft, intent },
    { ...draft, chainId: "1" },
    { ...draft, value: 0 },
    { ...draft, value: "1e18" },
    { ...draft, value: "-1" },
    { ...draft, value: "01" },
    { ...draft, value: (maxUint256 + 1n).toString() },
    { ...draft, to: "not-an-address" },
    { ...draft, data: "0x123" },
    { ...draft, data: `0x${"00".repeat(4097)}` },
  ])("invalid schema cannot yield a match", (value) => {
    expect(() => parseDraft(value)).toThrow();
    expect(verifyProtection(intent, value, REPLAY_TIME).decision).toBe(
      "INVALID",
    );
  });
  it("caps pasted JSON and refuses JSON with extra intent fields", () => {
    expect(() => parseDraftText(" ".repeat(12001))).toThrow(/too large/);
    expect(() => parseDraftText(JSON.stringify({ ...draft, intent }))).toThrow(
      /overwrite/,
    );
  });
});
