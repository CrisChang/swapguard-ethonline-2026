import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { secureHeaders } from "hono/secure-headers";
import { analyze } from "../src/lib/engine";
import { InputError, validateRequest } from "../src/lib/validation";
import { demoSnapshot } from "./demo";
import { liveSnapshot } from "./live";
import { rpcDiagnostics } from "./rpc-diagnostics";
import type { AnalyzeRequest, Snapshot } from "../src/lib/types";
export type Env = {
  ETHEREUM_RPC_URL?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  LIVE_RATE_LIMIT?: {
    limit: (options: { key: string }) => Promise<{ success: boolean }>;
  };
  REQUIRE_LIVE_RATE_LIMIT?: boolean;
};
type Provider = (req: AnalyzeRequest, url?: string) => Promise<Snapshot>;

export function createApi(provider: Provider = liveSnapshot) {
  const app = new Hono<{ Bindings: Env }>();
  app.use("*", secureHeaders());
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.get("/api/health", (c) =>
    c.json({
      service: "swapguard",
      version: "0.1.0",
      readOnly: true,
      chainId: 1,
      liveData: "Checked on demand, not by this health endpoint.",
    }),
  );
  app.use(
    "/api/analyze",
    bodyLimit({
      maxSize: 4096,
      onError: (c) => c.json({ error: "Request too large." }, 413),
    }),
  );
  let inFlight = 0;
  app.post("/api/analyze", async (c) => {
    if (!c.req.header("content-type")?.includes("application/json"))
      return c.json({ error: "Use application/json." }, 415);
    let req: AnalyzeRequest;
    try {
      req = validateRequest(await c.req.json());
    } catch (e) {
      return c.json(
        {
          error: e instanceof InputError ? e.message : "Invalid JSON request.",
        },
        400,
      );
    }
    if (req.mode === "live") {
      // One anonymous route budget, not a claimed global quota or per-user limit.
      // Local Node development is loopback-only; the public Worker requires this binding.
      try {
        if (!c.env?.LIVE_RATE_LIMIT && c.env?.REQUIRE_LIVE_RATE_LIMIT)
          throw new Error("Missing live rate limiter");
        if (c.env?.LIVE_RATE_LIMIT) {
          const { success } = await c.env.LIVE_RATE_LIMIT.limit({
            key: "swapguard-ethonline-2026:live:v1",
          });
          if (!success) {
            c.header("Retry-After", "60");
            return c.json(
              {
                error:
                  "The shared live demo request limit was reached. Try again in one minute or select Sample mode.",
              },
              429,
            );
          }
        }
      } catch {
        // Fail closed if protection cannot be checked; never leak binding details.
        return c.json(
          {
            error:
              "Live analysis protection is unavailable. Please try again later or select Sample mode.",
          },
          503,
        );
      }
    }
    if (req.mode === "live" && inFlight >= 4) {
      c.header("Retry-After", "5");
      return c.json(
        { error: "Live analysis is busy. Please try again shortly." },
        429,
      );
    }
    try {
      if (req.mode === "live") inFlight++;
      const snapshot =
        req.mode === "demo"
          ? demoSnapshot(req, Math.floor(Date.now() / 1000))
          : await provider(req, c.env?.ETHEREUM_RPC_URL);
      return c.json(analyze(req, snapshot));
    } catch (error) {
      // Never expose provider URLs, credentials, wallet details or raw RPC errors.
      const diagnostics = rpcDiagnostics(error);
      console.warn("swapguard-analysis-failed", diagnostics);
      if (
        diagnostics.some(
          (d) =>
            d.code === 429 || d.status === 429 || d.category === "rate-limit",
        )
      ) {
        // This is an upstream/shared-provider failure, not the visitor's own quota.
        c.header("Retry-After", "60");
        return c.json(
          {
            code: "UPSTREAM_RATE_LIMITED",
            error:
              "Live Ethereum data providers are rate-limiting this server. No sample data was substituted. Try again in one minute; the operator can configure a dedicated Ethereum RPC if this persists.",
          },
          503,
        );
      }
      return c.json(
        {
          error:
            "Live chain data is unavailable or no usable pool quote was returned. No sample data was substituted. Try again, configure a reliable Ethereum RPC, or explicitly select Sample mode.",
        },
        502,
      );
    } finally {
      if (req.mode === "live") inFlight--;
    }
  });
  app.all("/api/*", (c) => c.json({ error: "Not found." }, 404));
  return app;
}
