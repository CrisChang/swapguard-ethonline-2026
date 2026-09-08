import { test, expect } from "@playwright/test";

test("sample report is clearly labeled and layout fits desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toContainText("No policy flags");
  await expect(page.getByText("SAMPLE DATA", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Synthetic data for exploring the checks. Not a live quote or your wallet.",
    ),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/swapguard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("heading", { name: "Swap preflight" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/swapguard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("sample scenarios expose the reason for blocked and review decisions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Risky quote" }).click();
  await expect(page.getByTestId("verdict")).toContainText(
    "Policy threshold exceeded",
  );
  await page.locator("summary").filter({ hasText: "Token allowances" }).click();
  await expect(page.getByText(/can spend more than 10×/)).toBeVisible();
  await page.screenshot({
    path: "test-results/swapguard-risky.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Stale oracle" }).click();
  await expect(
    page.locator("summary").filter({ hasText: "Independent reference" }),
  ).toContainText("BLOCK");
  await expect(
    page.locator("summary").filter({ hasText: "Quote vs. reference" }),
  ).toContainText("UNKNOWN");
});

test("editing inputs clears a previous report before another request", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toBeVisible();
  await page.getByLabel("Amount to swap").fill("0.2");
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await page.getByRole("button", { name: "Analyze sample swap" }).click();
  await expect(page.getByTestId("verdict")).toContainText("No policy flags");
  await page.getByRole("button", { name: "Reverse pair" }).click();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await expect(page.getByLabel("Input token")).toHaveValue("USDC");
  await page.getByRole("button", { name: "Analyze sample swap" }).click();
  await expect(page.getByTestId("verdict")).toBeVisible();
});

test("live errors never display a sample result or retain an old quote", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toBeVisible();
  await page.route("**/api/analyze", async (route) => {
    if (route.request().postDataJSON()?.mode === "live")
      await route.fulfill({
        status: 502,
        json: {
          error:
            "Live chain data is unavailable. No sample data was substituted.",
        },
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Live onchain" }).click();
  await expect(page.getByTestId("verdict")).toHaveCount(0);
  await page.getByRole("button", { name: "Analyze live swap" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No sample data was substituted",
  );
  await expect(page.getByText("SAMPLE DATA", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("verdict")).toHaveCount(0);
});

test("rejects malformed input without sending any analyze request", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toBeVisible();
  let requests = 0;
  page.on("request", (r) => {
    if (r.url().includes("/api/analyze")) requests++;
  });
  await page.getByLabel("Amount to swap").fill("1e3");
  await page.getByRole("button", { name: "Analyze sample swap" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "positive decimal amount",
  );
  expect(requests).toBe(0);
});

test("expires a report visibly after the 60 second window", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toContainText("No policy flags");
  await page.clock.fastForward(62000);
  await expect(page.getByTestId("verdict")).toContainText("Snapshot expired");
});

test("exports explicit sample provenance and integer amounts", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export sample report" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("swapguard-demo-20000000.json");
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(report.request.mode).toBe("demo");
  expect(report.snapshot.wallet.sample).toBe(true);
  expect(report.quote.minimumOutRaw).toBe("248625625");
  expect(report.snapshotExpired).toBe(false);
});
