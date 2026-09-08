import { describe, expect, it, vi } from "vitest";
import { createApi } from "../server/api";
import { demoSnapshot } from "../server/demo";
import type { AnalyzeRequest, Snapshot } from "../src/lib/types";
const body = { mode: "demo", tokenIn: "WETH", amount: "0.1", slippageBps: 50 };
const send = (app: ReturnType<typeof createApi>, value: unknown = body) =>
  app.request("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });

describe("read-only API", () => {
  it("never calls the live provider for explicit sample requests", async () => {
    const provider = vi.fn();
    const res = await send(createApi(provider));
    expect(res.status).toBe(200);
    expect(provider).not.toHaveBeenCalled();
    expect((await res.json()).request.mode).toBe("demo");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("does not turn a live failure into sample data or expose secrets", async () => {
    const res = await send(
      createApi(async () => {
        throw new Error("private RPC URL and key");
      }),
      { ...body, mode: "live" },
    );
    expect(res.status).toBe(502);
    const out = await res.json();
    expect(out.error).toContain("No sample data was substituted");
    expect(JSON.stringify(out)).not.toContain("private RPC");
    expect(out).not.toHaveProperty("quote");
  });
  it("returns live results only after the provider succeeds", async () => {
    const provider = vi.fn(async (r: AnalyzeRequest) => {
      const s = demoSnapshot(r, Math.floor(Date.now() / 1000));
      s.wallet = null;
      return s;
    });
    const res = await send(createApi(provider), { ...body, mode: "live" });
    expect(res.status).toBe(200);
    expect(provider).toHaveBeenCalledOnce();
    const out = await res.json();
    expect(out.request.mode).toBe("live");
    expect(out.decision).toBe("review");
  });
  it("validates JSON, amount and content type", async () => {
    const app = createApi(vi.fn());
    expect((await send(app, { ...body, amount: "1e3" })).status).toBe(400);
    expect(
      (await app.request("/api/analyze", { method: "POST", body: "{}" }))
        .status,
    ).toBe(415);
    expect(
      (
        await app.request("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{",
        })
      ).status,
    ).toBe(400);
    expect((await send(app, { ...body, extra: "a".repeat(5000) })).status).toBe(
      413,
    );
  });
  it("provides health without pretending a live RPC test occurred", async () => {
    const provider = vi.fn();
    const res = await createApi(provider).request("/api/health");
    expect((await res.json()).readOnly).toBe(true);
    expect(provider).not.toHaveBeenCalled();
  });
  it("has no transaction endpoint", async () => {
    expect(
      (await createApi(vi.fn()).request("/api/swap", { method: "POST" }))
        .status,
    ).toBe(404);
  });
  it("limits parallel live work but keeps samples available", async () => {
    let release!: (s: Snapshot) => void;
    const promise = new Promise<Snapshot>((resolve) => {
      release = resolve;
    });
    const provider = vi.fn(() => promise);
    const app = createApi(provider);
    const pending = Array.from({ length: 4 }, () =>
      send(app, { ...body, mode: "live" }),
    );
    await vi.waitFor(() => expect(provider).toHaveBeenCalledTimes(4));
    expect((await send(app, { ...body, mode: "live" })).status).toBe(429);
    expect((await send(app)).status).toBe(200);
    release(
      demoSnapshot(
        { ...body, mode: "live", tokenIn: "WETH", scenario: "normal" },
        Math.floor(Date.now() / 1000),
      ),
    );
    expect((await Promise.all(pending)).every((r) => r.status === 200)).toBe(
      true,
    );
    expect((await send(app, { ...body, mode: "live" })).status).toBe(200);
  });
});
