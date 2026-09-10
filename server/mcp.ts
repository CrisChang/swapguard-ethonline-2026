import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { AgentJournal } from "./agent-journal";
import {
  toolDescriptions,
  toolSchemas,
  type ToolName,
} from "../src/lib/agent-ledger";

const journal = new AgentJournal(
  process.env.SWAPGUARD_LEDGER_PATH || ".swapguard/agent-ledger.jsonl",
);
const server = new McpServer({
  name: "swapguard-advisory-ledger",
  version: "0.2.0",
});
for (const name of Object.keys(toolSchemas) as ToolName[]) {
  server.registerTool(
    name,
    {
      description: toolDescriptions[name],
      inputSchema: toolSchemas[name],
      annotations: {
        readOnlyHint: name === "swapguard_get_task",
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async (input: unknown) => {
      try {
        const result = journal.execute(name, input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text:
                error instanceof Error
                  ? error.message
                  : "Advisory operation failed; no transaction was sent.",
            },
          ],
        };
      }
    },
  );
}
process.on("exit", () => journal.close());
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
process.stdin.on("end", () => {
  journal.close();
  void server.close();
});
await server.connect(new StdioServerTransport());
