import { test, expect } from "@playwright/test";
import { PROTECTION_FIXTURES } from "../../src/lib/protection-fixtures";

test("replays a changed floor and exposes evidence without calling a wallet", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Did your minimum survive?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Run this verification", exact: true })
    .click();
  await expect(page.getByTestId("protection-result")).toContainText("MISMATCH");
  await expect(page.getByTestId("protection-result")).toContainText(
    "0.038 WETH",
  );
  await expect(page.getByTestId("case-expectation")).toContainText(
    "matches the declared expectation",
  );
  await page.getByLabel("Choose a test case").selectOption("unchanged");
  await expect(page.getByTestId("protection-result")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Run this verification", exact: true })
    .click();
  await expect(page.getByTestId("protection-result")).toContainText(
    "Parameters match — not a safety verdict",
  );
  await page
    .locator("#protection")
    .screenshot({ path: "test-results/protection-desktop.png" });
  expect(errors).toEqual([]);
});

test("runs the published suite in the browser and downloads all inputs and observations", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Run all 25 cases" }).click();
  await expect(page.getByTestId("benchmark-summary")).toContainText("25/25");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download observed results" }).click();
  const file = await downloadPromise;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  expect(exported.provenance).toContain("synthetic");
  expect(exported.fixtures).toHaveLength(25);
  expect(
    exported.results.every(
      (r: { matchedExpectation: boolean }) => r.matchedExpectation,
    ),
  ).toBe(true);
  expect(exported.fixtures[0].intent.minimumOutRaw).toBe("398000000000000000");
  expect(exported.fixtures[0].draft.data).toMatch(/^0x5ae401dc/);
});

test("automatically derives the floor and keeps independent conditions fixed while editing a draft", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toBeVisible();
  await page.getByRole("button", { name: "Check a transaction draft" }).click();
  await expect(
    page.getByRole("button", { name: "Verify locked conditions" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Confirm & lock conditions" }).click();
  await page
    .getByRole("button", { name: "Load constructed normal draft" })
    .click();
  await page.getByRole("button", { name: "Verify locked conditions" }).click();
  await expect(page.getByTestId("protection-result")).toContainText(
    "Parameters match",
  );
  await page
    .getByRole("button", { name: "Load constructed zero-floor draft" })
    .click();
  await expect(page.getByTestId("protection-result")).toHaveCount(0);
  await page.getByRole("button", { name: "Verify locked conditions" }).click();
  await expect(page.getByTestId("protection-result")).toContainText("MISMATCH");
  await expect(page.getByTestId("protection-result")).toContainText(
    "248.625625 USDC",
  );
  const tx = JSON.parse(await page.getByLabel("Transaction JSON").inputValue());
  tx.intent = PROTECTION_FIXTURES[0].intent;
  await page.getByLabel("Transaction JSON").fill(JSON.stringify(tx));
  await page.getByRole("button", { name: "Verify locked conditions" }).click();
  await expect(page.getByTestId("protection-result")).toContainText(
    "Do not include or overwrite an intent",
  );
  await page
    .getByLabel("Sender address", { exact: true })
    .fill("0x2222222222222222222222222222222222222222");
  await expect(page.getByTestId("protection-result")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Verify locked conditions" }),
  ).toBeDisabled();
});

test("changing slippage requires a new quote and fresh independent confirmation", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByTestId("verdict")).toBeVisible();
  await page.getByRole("button", { name: "Check a transaction draft" }).click();
  await page.getByRole("button", { name: "Confirm & lock conditions" }).click();
  await page
    .getByRole("button", { name: "Load constructed normal draft" })
    .click();
  await page.getByRole("button", { name: "Verify locked conditions" }).click();
  await page.getByLabel("Slippage percentage").fill("1");
  await expect(page.getByTestId("protection-result")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Confirm & lock conditions" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Analyze sample swap" }).click();
  await expect(page.getByTestId("verdict")).toBeVisible();
  await page.getByRole("button", { name: "Confirm & lock conditions" }).click();
  await page
    .getByRole("button", { name: "Load constructed normal draft" })
    .click();
  await page.getByRole("button", { name: "Verify locked conditions" }).click();
  await expect(page.getByTestId("protection-result")).toContainText(
    "Parameters match",
  );
  await page.clock.fastForward(62000);
  await expect(page.getByTestId("protection-result")).toContainText("EXPIRED");
  await expect(
    page.getByRole("button", { name: "Verify locked conditions" }),
  ).toBeDisabled();
});

test("fits a phone screen and explains slippage without claiming attack simulation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Run this verification", exact: true })
    .click();
  await page
    .getByText(
      "Slippage vs minimum received — what is the difference? / 滑点与最低到账量",
      { exact: true },
    )
    .click();
  await expect(
    page.getByText("通常只需选择滑点容忍度", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("#protection")
    .screenshot({ path: "test-results/protection-mobile.png" });
  await page.getByRole("button", { name: "Check a transaction draft" }).click();
  await expect(page.getByLabel("Transaction JSON")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
