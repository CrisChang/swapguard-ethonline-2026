import { describe, expect, it, vi } from "vitest";
import { createApi, type Env } from "../server/api";
import { demoSnapshot } from "../server/demo";
import type { AnalyzeRequest, Snapshot } from "../src/lib/types";
import worker from "../worker/index";

const body = { mode: "live", tokenIn: "WETH", amount: "0.1", slippageBps: 50 };
const request = (value: unknown = body) =>
  new Request("https://swapguard.test/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
const provider = () =>
  vi.fn(async (r: AnalyzeRequest) =>
    demoSnapshot(r, Math.floor(Date.now() / 1000)),
  );

describe("public Worker release protection", () => {
  it("requires an edge limiter for live Worker requests", async () => {
    const res = await worker.fetch(request(), {});
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("Missing live rate limiter");
  });
  it("keeps samples and health available without the limiter", async () => {
    expect(
      (await worker.fetch(request({ ...body, mode: "demo" }), {})).status,
    ).toBe(200);
    expect(
      (await worker.fetch(new Request("https://swapguard.test/api/health"), {}))
        .status,
    ).toBe(200);
  });
  it("checks a stable shared route key, never the wallet or a caller-supplied key", async () => {
    const live = provider();
    const limit = vi.fn(async () => ({ success: true }));
    const res = await createApi(live).fetch(request(), {
      LIVE_RATE_LIMIT: { limit },
    });
    expect(res.status).toBe(200);
    expect(live).toHaveBeenCalledOnce();
    expect(limit).toHaveBeenCalledWith({
      key: "swapguard-ethonline-2026:live:v1",
    });
  });
  it("returns retry instructions and makes no RPC call when limited", async () => {
    const live = provider();
    const res = await createApi(live).fetch(request(), {
      LIVE_RATE_LIMIT: { limit: async () => ({ success: false }) },
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(live).not.toHaveBeenCalled();
  });
  it("fails closed without disclosing a limiter error", async () => {
    const live = provider();
    const res = await createApi(live).fetch(request(), {
      LIVE_RATE_LIMIT: {
        limit: async () => {
          throw new Error("sensitive-internal-error");
        },
      },
    });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain("sensitive-internal-error");
    expect(live).not.toHaveBeenCalled();
  });
  it("does not consume live quota for samples or invalid input", async () => {
    const limit = vi.fn();
    const app = createApi(provider());
    const env: Env = { LIVE_RATE_LIMIT: { limit } };
    expect(
      (await app.fetch(request({ ...body, mode: "demo" }), env)).status,
    ).toBe(200);
    expect(
      (await app.fetch(request({ ...body, amount: "-1" }), env)).status,
    ).toBe(400);
    expect(limit).not.toHaveBeenCalled();
  });
  it("still caps concurrency after asynchronous admission", async () => {
    let release!: (value: Snapshot) => void;
    const result = new Promise<Snapshot>((resolve) => {
      release = resolve;
    });
    const live = vi.fn(() => result);
    const app = createApi(live);
    const env: Env = {
      LIVE_RATE_LIMIT: { limit: async () => ({ success: true }) },
    };
    const pending = Array.from({ length: 5 }, () => app.fetch(request(), env));
    await vi.waitFor(() => expect(live).toHaveBeenCalledTimes(4));
    release(
      demoSnapshot(
        { ...body, mode: "live", tokenIn: "WETH", scenario: "normal" },
        Math.floor(Date.now() / 1000),
      ),
    );
    const responses = await Promise.all(pending);
    expect(responses.filter((r) => r.status === 200)).toHaveLength(4);
    expect(responses.filter((r) => r.status === 429)).toHaveLength(1);
  });
  it("serves static assets separately and rejects unknown API routes", async () => {
    const fetch = vi.fn(async () => new Response("built asset"));
    expect(
      await (
        await worker.fetch(new Request("https://swapguard.test/"), {
          ASSETS: { fetch },
        })
      ).text(),
    ).toBe("built asset");
    expect(
      (
        await worker.fetch(new Request("https://swapguard.test/api/swap"), {
          ASSETS: { fetch },
        })
      ).status,
    ).toBe(404);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
