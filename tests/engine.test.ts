import { describe, expect, it } from "vitest";
import { analyze, referenceOutput, validFeed } from "../src/lib/engine";
import { validateRequest } from "../src/lib/validation";
import { demoSnapshot } from "../server/demo";
import type { AnalyzeRequest, Snapshot } from "../src/lib/types";
const now = 1788868800;
const base = { mode: "demo", tokenIn: "WETH", amount: "0.1", slippageBps: 50 };
const req = (overrides = {}) => validateRequest({ ...base, ...overrides });
const fixture = (r = req()) => demoSnapshot(r, now);
const check = (s: Snapshot, id: string, r = req()) =>
  analyze(r, s, now).checks.find((c) => c.id === id)!;

describe("integer quote policy", () => {
  it("uses 18/6 decimal base units and floors the exact minimum", () => {
    const r = req(),
      s = fixture(r),
      out = analyze(r, s, now);
    expect(referenceOutput(r, s)).toBe(250000000n);
    expect(out.quote.amountInRaw).toBe("100000000000000000");
    expect(out.quote.amountOutRaw).toBe("249875000");
    expect(out.quote.minimumOutRaw).toBe("248625625");
    expect(out.quote.selectedFee).toBe(500);
    expect(out.decision).toBe("clear");
    expect(Date.parse(out.expiresAt) - Date.parse(out.createdAt)).toBe(60000);
  });
  it("handles the reverse direction without floating point amounts", () => {
    const r = req({ tokenIn: "USDC", amount: "250" }),
      s = fixture(r);
    expect(referenceOutput(r, s)).toBe(100000000000000000n);
    expect(analyze(r, s, now).quote.amountOutRaw).toBe("99950000000000000");
  });
  it("prices USDC using its feed, not a hardcoded $1 peg", () => {
    const r = req(),
      s = fixture(r);
    s.feeds.USDC.answerRaw = "99000000";
    expect(referenceOutput(r, s)).toBe(252525252n);
  });
  it("normalizes feeds with different decimals", () => {
    const r = req(),
      s = fixture(r);
    s.feeds.USDC.decimals = 18;
    s.feeds.USDC.answerRaw = "1000000000000000000";
    expect(referenceOutput(r, s)).toBe(250000000n);
  });
  it("selects by output, never assumes the lowest-fee pool wins", () => {
    const s = fixture();
    s.routes[1].amountOutRaw = "250000001";
    expect(analyze(req(), s, now).quote.selectedFee).toBe(3000);
  });
  it("blocks a minimum that floors to zero", () => {
    const s = fixture();
    s.routes.forEach((r) => (r.amountOutRaw = "1"));
    expect(check(s, "dust").status).toBe("block");
  });
  it("never substitutes a sample when no quote is usable", () => {
    const s = fixture();
    s.routes = [];
    expect(() => analyze(req(), s, now)).toThrow("No usable quote");
    s.routes = [
      { fee: 500, amountOutRaw: "0", gasEstimate: "0", pool: "synthetic" },
    ];
    expect(() => analyze(req(), s, now)).toThrow("No usable quote");
  });
  it("marks incomplete route coverage as review", () => {
    const s = fixture();
    s.routes.pop();
    s.unavailableFees = [3000];
    expect(check(s, "coverage").status).toBe("warn");
    expect(analyze(req(), s, now).decision).toBe("review");
  });
  it.each([
    [49, "pass"],
    [50, "warn"],
    [149, "warn"],
    [150, "block"],
  ])("deviation %i bps -> %s", (bps, expected) => {
    const s = fixture();
    s.routes = [
      {
        ...s.routes[0],
        amountOutRaw: (
          (250000000n * BigInt(10000 - Number(bps))) /
          10000n
        ).toString(),
      },
    ];
    expect(check(s, "deviation").status).toBe(expected);
  });
  it("also flags unusually favorable quotes; does not label deviation as MEV", () => {
    const s = fixture();
    s.routes[0].amountOutRaw = "275000000";
    expect(check(s, "deviation").status).toBe("block");
    expect(check(s, "deviation").detail).toContain("not a pure price-impact");
  });
  it.each([
    [99, "pass"],
    [100, "warn"],
    [299, "warn"],
    [300, "block"],
  ])("slippage %i bps -> %s", (slippageBps, expected) => {
    const r = req({ slippageBps });
    expect(check(fixture(r), "slippage", r).status).toBe(expected);
  });
});

describe("freshness and incomplete data fail closed", () => {
  it.each(["stale", "risky"])("blocks the explicit %s sample", (scenario) => {
    const r = req({ scenario });
    expect(analyze(r, fixture(r), now).decision).toBe("blocked");
  });
  it.each([-121, 31])("blocks block timestamp offset %is", (offset) => {
    const s = fixture();
    s.block.timestamp = now + offset;
    expect(check(s, "block").status).toBe("block");
  });
  it.each([
    { updatedAt: now - 3601 },
    { updatedAt: now + 31 },
    { updatedAt: 0 },
    { answerRaw: "0" },
    { answerRaw: "-1" },
    { answeredInRound: "99" },
    { roundId: "0" },
    { decimals: 19 },
    { decimals: -1 },
    { decimals: 8.5 },
  ])("rejects an invalid oracle round %j", (fields) => {
    const s = fixture();
    Object.assign(s.feeds.ETH, fields);
    expect(validFeed(s.feeds.ETH, now)).toBe(false);
    const out = analyze(req(), s, now);
    expect(out.decision).toBe("blocked");
    expect(out.quote.referenceOut).toBeNull();
  });
  it("does not interpret absent wallet data as safe", () => {
    const s = fixture();
    s.wallet = null;
    expect(check(s, "balance").status).toBe("unknown");
    expect(check(s, "allowance").status).toBe("unknown");
    expect(analyze(req(), s, now).decision).toBe("review");
  });
  it("keeps failed reads unknown and low balance blocked", () => {
    const s = fixture();
    s.wallet!.balanceRaw = null;
    s.wallet!.allowances[0].amountRaw = null;
    expect(check(s, "balance").status).toBe("unknown");
    expect(check(s, "allowance").status).toBe("unknown");
    s.wallet!.balanceRaw = "0";
    expect(check(s, "balance").status).toBe("block");
  });
  it("distinguishes high allowance exposure from execution readiness", () => {
    const s = fixture();
    s.wallet!.allowances[0].amountRaw = "1000000000000000001";
    expect(check(s, "allowance").status).toBe("warn");
    s.wallet!.allowances[0].amountRaw = "0";
    expect(check(s, "allowance").detail).toContain(
      "Zero allowance is not execution-ready",
    );
  });
});

describe("strict request boundary", () => {
  it.each([
    "0",
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    ".1",
    "1.",
    "1,000",
    "1001",
    "0.0000000000000000001",
  ])("rejects WETH amount %s", (amount) => {
    expect(() => req({ amount })).toThrow();
  });
  it("rejects USDC excess precision instead of rounding silently", () => {
    expect(() => req({ tokenIn: "USDC", amount: "1.0000001" })).toThrow();
  });
  it.each([0, -1, 1001, 1.5, "50", null])(
    "rejects invalid slippage %s",
    (slippageBps) => {
      expect(() => req({ slippageBps })).toThrow();
    },
  );
  it.each([
    { mode: "other" },
    { tokenIn: "ETH" },
    { scenario: "other" },
    { mode: "live", scenario: "risky" },
    { owner: "0x123" },
    { owner: "0x0000000000000000000000000000000000000000" },
  ])("rejects unsupported parameters %j", (fields) => {
    expect(() => req(fields)).toThrow();
  });
  it("drops a real owner from sample data and does not accept RPC URL injection", () => {
    const owner = "0x0000000000000000000000000000000000000001";
    expect(req({ owner }).owner).toBeUndefined();
    const live = req({
      mode: "live",
      owner,
      rpcUrl: "https://attacker.example",
    });
    expect(live.owner).toBe(owner);
    expect(live).not.toHaveProperty("rpcUrl");
  });
  it("serializes reports with exact amounts as strings", () => {
    const r: AnalyzeRequest = req(),
      out = analyze(r, fixture(r), now);
    expect(JSON.parse(JSON.stringify(out)).quote.amountInRaw).toBe(
      out.quote.amountInRaw,
    );
  });
});
