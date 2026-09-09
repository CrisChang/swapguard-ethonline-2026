import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeFunctionData, encodeFunctionResult, erc20Abi } from "viem";
import { liveSnapshot } from "../server/live";
import { createApi } from "../server/api";
import { rpcDiagnostics } from "../server/rpc-diagnostics";
import {
  CONTRACTS,
  FACTORY_ABI,
  FEED_ABI,
  QUOTER_ABI,
  TOKENS,
} from "../src/lib/contracts";
import type { AnalyzeRequest } from "../src/lib/types";

const primary = "ethereum-rpc.publicnode.com";
const secondary = "eth.drpc.org";
const owner = "0x0000000000000000000000000000000000000001";
const blockNumber = "0x18bcc00";
const req: AnalyzeRequest = {
  mode: "live",
  tokenIn: "WETH",
  amount: "0.1",
  slippageBps: 50,
  scenario: "normal",
};
type Rpc = { id: number; method: string; params?: unknown[] };
type Faults = {
  rateLimited?: boolean;
  primaryDown?: boolean;
  allDown?: boolean;
  primaryCallsDown?: boolean;
  walletDown?: boolean;
  quoterDown?: boolean;
  wrongChain?: boolean;
};

// Exercise the real viem HTTP batching/fallback/ABI path, not a mocked snapshot.
// Like the observed public dRPC service, this mock rejects every batch > 3.
function mockRpc(faults: Faults = {}) {
  const batches: { host: string; calls: Rpc[]; isBatch: boolean }[] = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const now = Math.floor(Date.now() / 1000);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const host = new URL(request.url).hostname;
      const body = (await request.json()) as Rpc | Rpc[];
      const calls = Array.isArray(body) ? body : [body];
      batches.push({ host, calls, isBatch: Array.isArray(body) });
      const error = {
        code: 31,
        message: "Batch of more than 3 requests are not allowed on free plan",
      };
      if (calls.length > 3)
        return Response.json(
          calls.map((c) => ({ jsonrpc: "2.0", id: c.id, error })),
          { status: 500 },
        );
      if (faults.rateLimited) {
        const failed = calls.map((c) => ({
          jsonrpc: "2.0",
          id: c.id,
          error: { code: 429, message: "Too many requests" },
        }));
        return Response.json(Array.isArray(body) ? failed : failed[0]);
      }
      if (faults.allDown || (host === primary && faults.primaryDown))
        return new Response("unavailable", { status: 503 });
      const result = (call: Rpc): unknown => {
        if (call.method === "eth_chainId")
          return faults.wrongChain ? "0xaa36a7" : "0x1";
        if (call.method === "eth_getBlockByNumber")
          return {
            number: blockNumber,
            timestamp: `0x${now.toString(16)}`,
            transactions: [],
          };
        if (call.method !== "eth_call")
          throw new Error(`Unexpected method: ${call.method}`);
        const { to, data } = call.params![0] as {
          to: string;
          data: `0x${string}`;
        };
        expect(call.params![1]).toBe(blockNumber);
        if (to.toLowerCase() === CONTRACTS.factory.toLowerCase())
          return encodeFunctionResult({
            abi: FACTORY_ABI,
            functionName: "getPool",
            result: "0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640",
          });
        if (to.toLowerCase() === CONTRACTS.quoter.toLowerCase()) {
          const { args } = decodeFunctionData({ abi: QUOTER_ABI, data });
          const output =
            args[0].tokenIn.toLowerCase() === TOKENS.WETH.address.toLowerCase()
              ? 250_000_000n
              : 100_000_000_000_000_000n;
          return encodeFunctionResult({
            abi: QUOTER_ABI,
            functionName: "quoteExactInputSingle",
            result: [output, 1n, 0, 100000n],
          });
        }
        if (
          [
            CONTRACTS.ethUsd.toLowerCase(),
            CONTRACTS.usdcUsd.toLowerCase(),
          ].includes(to.toLowerCase())
        ) {
          const { functionName } = decodeFunctionData({ abi: FEED_ABI, data });
          if (functionName === "decimals")
            return encodeFunctionResult({
              abi: FEED_ABI,
              functionName,
              result: 8,
            });
          const answer =
            to.toLowerCase() === CONTRACTS.ethUsd.toLowerCase()
              ? 2500_00000000n
              : 100000000n;
          return encodeFunctionResult({
            abi: FEED_ABI,
            functionName: "latestRoundData",
            result: [1n, answer, BigInt(now), BigInt(now), 1n],
          });
        }
        const { functionName } = decodeFunctionData({ abi: erc20Abi, data });
        if (functionName !== "balanceOf" && functionName !== "allowance")
          throw new Error("Unexpected token read");
        return encodeFunctionResult({
          abi: erc20Abi,
          functionName,
          result: 0n,
        });
      };
      const responses = calls.map((call) => {
        const to = (call.params?.[0] as { to?: string })?.to?.toLowerCase();
        const isWallet =
          to === TOKENS.WETH.address.toLowerCase() ||
          to === TOKENS.USDC.address.toLowerCase();
        if (
          (faults.primaryCallsDown &&
            host === primary &&
            call.method === "eth_call") ||
          (faults.walletDown && isWallet) ||
          (faults.quoterDown && to === CONTRACTS.quoter.toLowerCase())
        ) {
          return {
            jsonrpc: "2.0",
            id: call.id,
            error: { code: -32000, message: "RPC read unavailable" },
          };
        }
        return { jsonrpc: "2.0", id: call.id, result: result(call) };
      });
      return Response.json(Array.isArray(body) ? responses : responses[0]);
    }),
  );
  return batches;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("live RPC transport regression", () => {
  it("uses independent single-request envelopes, never a Worker-global batch", async () => {
    const batches = mockRpc();
    await liveSnapshot({ ...req, owner });
    expect(batches.length).toBeGreaterThan(3);
    expect(batches.every((b) => !b.isBatch && b.calls.length === 1)).toBe(true);
  });
  it.each(["WETH", "USDC"] as const)(
    "quotes %s via fallback when the primary fails, within the free batch limit",
    async (tokenIn) => {
      const batches = mockRpc({ primaryDown: true });
      const s = await liveSnapshot({ ...req, tokenIn, owner });
      expect(s.routes).toHaveLength(2);
      expect(s.unavailableFees).toEqual([]);
      expect(s.wallet?.sample).toBe(false);
      expect(s.wallet?.balanceRaw).toBe("0");
      expect(s.wallet?.allowances.map((a) => a.amountRaw)).toEqual(["0", "0"]);
      expect(batches.some((b) => b.host === secondary)).toBe(true);
      expect(batches.every((b) => b.calls.length <= 3)).toBe(true);
    },
  );
  it("falls back for pinned contract reads even if the primary's chain and head calls succeeded", async () => {
    const batches = mockRpc({ primaryCallsDown: true });
    expect((await liveSnapshot(req)).routes).toHaveLength(2);
    expect(
      batches
        .filter((b) => b.host === secondary)
        .flatMap((b) => b.calls)
        .every((c) => c.method === "eth_call"),
    ).toBe(true);
  });
  it("keeps the three-call cap across concurrent snapshots sharing a provider", async () => {
    const batches = mockRpc({ primaryDown: true });
    const snapshots = await Promise.all(
      Array.from({ length: 4 }, () => liveSnapshot({ ...req, owner })),
    );
    expect(snapshots.every((s) => s.routes.length === 2)).toBe(true);
    expect(batches.every((b) => b.calls.length <= 3)).toBe(true);
  });
  it("honors an operator-configured endpoint without leaking requests to public fallbacks", async () => {
    const batches = mockRpc();
    expect(
      (await liveSnapshot(req, "https://operator.invalid/rpc")).routes,
    ).toHaveLength(2);
    expect(batches.every((b) => b.host === "operator.invalid")).toBe(true);
  });
  it("fails closed when all providers fail", async () => {
    const batches = mockRpc({ allDown: true });
    const res = await createApi().request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    expect(res.status).toBe(502);
    const body = await res.text();
    expect(body).toContain("No sample data was substituted");
    expect(body).not.toContain(primary);
    expect(body).not.toContain(secondary);
    expect(batches).toHaveLength(2); // one attempt per provider, no retry storm
  });
  it("distinguishes shared upstream throttling from visitor quota and never supplies a stale/sample quote", async () => {
    mockRpc({ rateLimited: true });
    const res = await createApi().request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = await res.json();
    expect(body.code).toBe("UPSTREAM_RATE_LIMITED");
    expect(body.error).toContain("No sample data was substituted");
    expect(body).not.toHaveProperty("quote");
  });
  it("rejects a non-mainnet endpoint", async () => {
    const batches = mockRpc({ wrongChain: true });
    await expect(liveSnapshot(req)).rejects.toThrow("not Ethereum mainnet");
    expect(batches.flatMap((b) => b.calls)).toHaveLength(1);
  });
  it("keeps failed wallet reads unknown instead of inventing balances or allowances", async () => {
    mockRpc({ walletDown: true });
    const s = await liveSnapshot({ ...req, owner });
    expect(s.routes).toHaveLength(2);
    expect(s.wallet?.balanceRaw).toBeNull();
    expect(s.wallet?.allowances.every((a) => a.amountRaw === null)).toBe(true);
  });
  it("does not invent a quote when both pool reads fail", async () => {
    mockRpc({ quoterDown: true });
    const res = await createApi().request("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });
    expect(res.status).toBe(502);
    expect(await res.text()).toContain("No sample data was substituted");
  });
});

describe("privacy-safe RPC diagnostics", () => {
  it("logs categories and numeric status, never raw messages, URLs, keys or calldata", () => {
    const inner = Object.assign(
      new TypeError(
        "Cannot destructure undefined https://secret.invalid/key wallet 0x123",
      ),
      { status: 500, code: -1 },
    );
    const outer = new Error("private message", { cause: inner });
    expect(rpcDiagnostics(outer)).toEqual([
      { type: "Error", category: "other" },
      {
        type: "TypeError",
        code: -1,
        status: 500,
        category: "invalid-response-shape",
      },
    ]);
  });
  it("does not echo arbitrary error names or non-numeric codes", () => {
    expect(
      rpcDiagnostics({
        name: "secret-key",
        code: "private",
        status: "private",
        message: "private",
      }),
    ).toEqual([{ type: "UnknownError", category: "other" }]);
  });
  it("bounds cyclic errors and handles primitive failures", () => {
    const e = { name: "Error", cause: null as unknown };
    e.cause = e;
    expect(rpcDiagnostics(e)).toHaveLength(1);
    expect(rpcDiagnostics("private")).toEqual([]);
  });
});
