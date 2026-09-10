import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import App from "../src/App";
import AgentWorkbench from "../src/AgentWorkbench";
import AgentEvidence from "../src/AgentEvidence";

describe("Agent page content contract (no browser interaction)", () => {
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
