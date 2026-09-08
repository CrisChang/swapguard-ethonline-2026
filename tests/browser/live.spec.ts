import { test, expect } from "@playwright/test";

// Opt-in smoke tests. Never mock the API and never connect or sign with a wallet.
test.describe("live mainnet", () => {
  test.skip(
    process.env.LIVE_SMOKE !== "1",
    "Set LIVE_SMOKE=1 to use public Ethereum RPC.",
  );
  test.setTimeout(90000);
  test("reads WETH/USDC quotes and exports real source evidence", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Live onchain" }).click();
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/analyze") &&
        r.request().postDataJSON()?.mode === "live",
      { timeout: 70000 },
    );
    await page.getByRole("button", { name: "Analyze live swap" }).click();
    const res = await response;
    expect(res.status()).toBe(200);
    const report = await res.json();
    expect(report.request.mode).toBe("live");
    expect(report.chainId).toBe(1);
    expect(report.snapshot.routes.length).toBeGreaterThan(0);
    expect(
      report.snapshot.routes.every((r: { pool: string }) =>
        /^0x[0-9a-fA-F]{40}$/.test(r.pool),
      ),
    ).toBe(true);
    expect(report.snapshot.wallet).toBeNull();
    expect(["review", "blocked"]).toContain(report.decision);
    await expect(
      page.getByText("LIVE SNAPSHOT", { exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("verdict")).toContainText(
      report.decision === "review"
        ? "Review before proceeding"
        : "Policy threshold exceeded",
    );
    await page.screenshot({
      path: "test-results/swapguard-live.png",
      fullPage: true,
    });
    console.log(
      "Live WETH proof:",
      JSON.stringify({
        block: report.snapshot.block.number,
        quote: report.quote.amountOut,
        minimum: report.quote.minimumOut,
        pools: report.snapshot.routes.length,
        decision: report.decision,
      }),
    );
  });
  test("reads the reverse pair and public address balance/allowances", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Live onchain" }).click();
    await page.getByLabel("Input token").selectOption("USDC");
    // Address 0x1 is a neutral reproducible public probe, not the participant's wallet.
    await page
      .getByLabel("Public wallet address")
      .fill("0x0000000000000000000000000000000000000001");
    const response = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/analyze") &&
        r.request().postDataJSON()?.mode === "live",
      { timeout: 70000 },
    );
    await page.getByRole("button", { name: "Analyze live swap" }).click();
    const res = await response;
    expect(res.status()).toBe(200);
    const report = await res.json();
    expect(report.tokenOut).toBe("WETH");
    expect(report.snapshot.wallet.sample).toBe(false);
    expect(report.snapshot.wallet.balanceRaw).not.toBeNull();
    expect(report.snapshot.wallet.allowances).toHaveLength(2);
    expect(
      report.snapshot.wallet.allowances.every(
        (a: { amountRaw: string | null }) => a.amountRaw !== null,
      ),
    ).toBe(true);
    await expect(
      page.getByText("LIVE SNAPSHOT", { exact: true }),
    ).toBeVisible();
    console.log(
      "Live USDC proof:",
      JSON.stringify({
        block: report.snapshot.block.number,
        quote: report.quote.amountOut,
        walletReads: 3,
        decision: report.decision,
      }),
    );
  });
});
