import assert from "node:assert/strict";

const target = process.argv[2];
if (!target)
  throw new Error(
    "Usage: npm run check:deployment -- https://YOUR-WORKER.workers.dev [--live]",
  );
const origin = new URL(target);
assert(
  !origin.username &&
    !origin.password &&
    !origin.search &&
    !origin.hash &&
    origin.pathname === "/",
  "Supply a plain origin without credentials, path, query or fragment.",
);
assert(
  origin.protocol === "https:" ||
    (origin.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(origin.hostname)),
  "Use HTTPS, or loopback HTTP for local verification.",
);

async function get(path: string, init?: RequestInit) {
  return fetch(new URL(path, origin), {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
}
const page = await get("/");
assert.equal(page.status, 200);
assert.match(page.headers.get("content-type") || "", /text\/html/);
assert.equal(page.headers.get("x-content-type-options"), "nosniff");
assert.equal(page.headers.get("x-frame-options"), "DENY");
assert.match(
  page.headers.get("content-security-policy") || "",
  /frame-ancestors 'none'/,
);
assert.match(await page.text(), /SwapGuard/);
console.log("PASS: built page and static security headers");
const health = await get("/api/health");
assert.equal(health.status, 200);
const status = await health.json();
assert.equal(status.service, "swapguard");
assert.equal(status.readOnly, true);
assert.equal(status.chainId, 1);
console.log("PASS: read-only API health (not a chain connectivity check)");
for (const mode of process.argv.includes("--live")
  ? ["demo", "live"]
  : ["demo"]) {
  const res = await get("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode,
      tokenIn: "WETH",
      amount: "0.1",
      slippageBps: 50,
    }),
  });
  assert.equal(res.status, 200, `${mode} analysis returned HTTP ${res.status}`);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const report = await res.json();
  assert.equal(report.request.mode, mode);
  assert(["clear", "review", "blocked"].includes(report.decision));
  console.log(
    `PASS: ${mode} analysis returned an explicit ${mode} report (${report.decision})`,
  );
}
const unknown = await get("/api/swap", { method: "POST" });
assert.equal(unknown.status, 404);
console.log("PASS: no transaction endpoint");
console.log(`Verified ${origin.origin}. No wallet or transaction was used.`);
