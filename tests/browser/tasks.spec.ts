import { test, expect } from "@playwright/test";
async function start(page: import("@playwright/test").Page) {
  await page.getByLabel("Confirm replay task constraints").check();
  await page
    .getByRole("button", { name: "Create replay task", exact: true })
    .click();
}
test("task is explicitly replay-only and requires confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByText("Constructed scenario, not a live trade."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create replay task", exact: true }),
  ).toBeDisabled();
  await start(page);
  await expect(page.getByLabel("Replay amount")).toBeDisabled();
  await expect(page.getByTestId("task-floor")).toContainText("100.195216 USDC");
});
test("full approval-revert-retry loop reconciles costs and exports explicit evidence", async ({
  page,
}) => {
  await page.goto("/");
  await start(page);
  await page
    .getByRole("button", { name: "Check & advance replay", exact: true })
    .click();
  await expect(page.getByTestId("task-pending")).toContainText(
    "Approval receipt pending",
  );
  await expect(
    page.getByRole("button", { name: "Check & advance replay", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Reconcile synthetic receipt", exact: true })
    .click();
  await expect(page.getByTestId("task-spent")).toHaveText("0.346736");
  await page
    .getByRole("button", { name: "Check & advance replay", exact: true })
    .click();
  await expect(page.getByTestId("task-pending")).toContainText("MATCH");
  await page
    .getByRole("button", { name: "Reconcile synthetic receipt", exact: true })
    .click();
  await expect(page.getByTestId("task-spent")).toHaveText("1.403623");
  await page
    .getByRole("button", { name: "Run remaining replay", exact: true })
    .click();
  await expect(page.getByTestId("task-status")).toHaveText(
    "Completed in replay",
  );
  await expect(page.getByTestId("task-spent")).toHaveText("1.743131");
  await expect(page.getByTestId("task-floor")).toHaveText("100.195216 USDC");
  const downloaded = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export task report", exact: true })
    .click();
  const file = await downloaded,
    stream = await file.createReadStream(),
    chunks = [];
  for await (const c of stream!) chunks.push(c);
  const report = JSON.parse(Buffer.concat(chunks).toString());
  expect(report.provenance.receipts).toBe("Synthetic");
  expect(report.result.approvalAttempts).toBe(1);
  expect(report.result.attempts).toBe(2);
  expect(report.result.spentGas).toBe("1743131");
  await page
    .locator(".task-execution")
    .screenshot({ path: "test-results/task-completed.png" });
});
test("reload restores pending receipt without broadcasting or charging it twice", async ({
  page,
}) => {
  await page.goto("/");
  await start(page);
  await page
    .getByRole("button", { name: "Check & advance replay", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByText(/Replay restored from this browser/),
  ).toBeVisible();
  await expect(page.getByTestId("task-status")).toHaveText("Receipt pending");
  await expect(page.getByTestId("task-spent")).toHaveText("0");
  await page
    .getByRole("button", { name: "Reconcile synthetic receipt", exact: true })
    .click();
  await page.reload();
  await expect(page.getByTestId("task-spent")).toHaveText("0.346736");
  await expect(page.getByTestId("task-status")).toHaveText("Ready to check");
});
test("cost-first waiting can miss a trade and reports no output", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Execution preference").selectOption("cost");
  await page.getByLabel("Task test scenario").selectOption("wait-misses-floor");
  await expect(page.getByTestId("cost-target-warning")).toBeVisible();
  await start(page);
  await page
    .getByRole("button", { name: "Run remaining replay", exact: true })
    .click();
  await expect(page.getByTestId("task-status")).toHaveText(
    "Stopped without completion",
  );
  await expect(page.getByTestId("task-final")).toContainText(
    "None — task not completed",
  );
  await expect(page.getByTestId("task-final")).toContainText("Not applicable");
  await expect(page.getByTestId("task-spent")).toHaveText("0");
  await page
    .getByRole("button", { name: "Create another task", exact: true })
    .click();
  await expect(page.getByTestId("task-status")).toHaveText("Not started");
});
test("invalid budget blocks creation and does not request a wallet", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Total task gas budget").fill("-1");
  await start(page);
  await expect(page.getByRole("alert")).toContainText("positive cost");
  await expect(page.getByTestId("task-status")).toHaveText("Not started");
});
test("workbench fits mobile before and after replay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("#tasks")
    .screenshot({ path: "test-results/task-mobile-before.png" });
  await start(page);
  await page
    .getByRole("button", { name: "Run remaining replay", exact: true })
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".task-execution")
    .screenshot({ path: "test-results/task-mobile-completed.png" });
  expect(errors).toEqual([]);
});
