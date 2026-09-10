import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../src/App";
import AgentWorkbench from "../src/AgentWorkbench";
import AgentEvidence from "../src/AgentEvidence";
import ReceiptEvidence from "../src/ReceiptEvidence";

describe("Agent page content contract (no browser interaction)", () => {
  it("shows the completion tradeoff, equal baseline and unresolved limitations alongside receipt evidence", () => {
    const html = renderToStaticMarkup(<ReceiptEvidence />);
    for (const text of [
      "3/4",
      "4/4",
      "1.88034",
      "2.219848",
      "not an LLM",
      "equally constrained",
      "0.35",
      "not a claimed integration",
      "/evidence/rpc-agent-2026-09-10.json",
    ])
      expect(html).toContain(text);
  });
  it("retains manual analysis, replay and draft checks beside Agent integration", () => {
    const html = renderToStaticMarkup(<App />);
    for (const section of [
      "agents",
      "evidence",
      "tasks",
      "workspace",
      "protection",
      "scope",
    ])
      expect(html).toContain(`id="${section}"`);
    expect(html).toContain("Swap preflight");
    expect(html).toContain("Manual analysis");
  });
  it("does not present the browser example as an actual MCP connection", () => {
    const html = renderToStaticMarkup(<AgentWorkbench />);
    expect(html).toContain("not connected to an Agent or MCP server");
    expect(html).toContain("Run agent example");
    expect(html).toContain("Download MCP integration guide");
    expect(html).toContain("not independently authenticated");
    expect(html).toContain("not investment profit/loss");
  });
  it("offers permanent test artifacts without claiming executed swaps or collecting private records", () => {
    const html = renderToStaticMarkup(<AgentEvidence />);
    expect(html).toContain("/evidence/agent-ledger-2026-09-10.json");
    expect(html).toContain("/evidence/agent-ledger-2026-09-10.md");
    expect(html).toContain("No real funds");
    expect(html).toContain("Expected behavior matched");
    expect(html).toContain("not an independent audit");
    expect(html).toContain("private MCP journal");
  });
});
