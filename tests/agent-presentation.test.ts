import { expect, it } from "vitest";
import { presentAgentResult } from "../src/lib/agent-presentation";
import { runAgentExample } from "../src/lib/agent-examples";
it("distinguishes not-run, expected rejection, pending, success and a real reported violation", () => {
  expect(presentAgentResult().output).toBe("Not run yet");
  const rejected = presentAgentResult(runAgentExample("floor").report);
  expect(rejected.title).toContain("Check complete");
  expect(rejected.explanation).toContain("not a system error");
  expect(rejected.output).toBe("No completed swap");
  expect(rejected.net).toBe("Not calculated");
  expect(presentAgentResult(runAgentExample("pending").report).title).toContain(
    "wait",
  );
  expect(presentAgentResult(runAgentExample("recover").report).title).toContain(
    "swap completed",
  );
  expect(presentAgentResult(runAgentExample("overrun").report).title).toContain(
    "limits exceeded",
  );
});
