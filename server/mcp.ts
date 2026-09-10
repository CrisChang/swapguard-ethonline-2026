import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { AgentJournal } from "./agent-journal";
import {
  toolDescriptions,
  toolSchemas,
  type ToolName,
  openTaskSchema,
} from "../src/lib/agent-ledger";
import { ReceiptVerifier, verifyReceiptSchema } from "./receipt-verifier";

const journal = new AgentJournal(
  process.env.SWAPGUARD_LEDGER_PATH || ".swapguard/agent-ledger.jsonl",
);
const server = new McpServer({
  name: "swapguard-advisory-ledger",
  version: "0.2.0",
});
const verifier = process.env.SWAPGUARD_VERIFY_RPC_URL
  ? new ReceiptVerifier(
      process.env.SWAPGUARD_VERIFY_RPC_URL,
      Number(process.env.SWAPGUARD_VERIFY_CHAIN_ID || "1") as 1 | 31337,
    )
  : null;
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
        let trusted;
        if (name === "swapguard_open_task") {
          const terms = openTaskSchema.parse(input);
          if (terms.execution) {
            if (!verifier)
              throw new Error(
                "RPC verification is not configured. No bound task was created.",
              );
            let existing = false;
            try {
              journal.inspect(terms.taskId);
              existing = true;
            } catch {
              /* new task */
            }
            if (!existing) trusted = { anchor: await verifier.anchor(terms) };
          }
        }
        const result = journal.execute(name, input, Date.now(), trusted);
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
                name !== "swapguard_open_task" && error instanceof Error
                  ? error.message
                  : "Task creation failed. Check terms, verifier configuration and RPC availability. No transaction was sent.",
            },
          ],
        };
      }
    },
  );
}
if (verifier)
  server.registerTool(
    "swapguard_verify_receipt",
    {
      description:
        "Read a mined transaction and receipt from the operator-configured RPC, match the bound wallet and supported WETH/USDC SwapRouter02 calldata, derive gas and net transfer output, then persist once. Accepts only task/attempt IDs and transaction hash, never caller costs. No signing, broadcast, cryptographic inclusion proof or continuous finality monitoring. Insufficient confirmations or mismatches leave the task pending.",
      inputSchema: verifyReceiptSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        openWorldHint: true,
      },
    },
    async (input: unknown) => {
      try {
        const request = verifyReceiptSchema.parse(input);
        const verified = await verifier.verify(
          journal.inspect(request.taskId),
          request,
        );
        const result = journal.execute(
          "swapguard_record_receipt",
          verified.input,
          Date.now(),
          { receiptProof: verified.proof },
        );
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch {
        // viem exceptions can embed the RPC credential. Do not expose upstream errors.
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Receipt verification failed. Check confirmations, chain/wallet binding, transaction parameters and RPC/price-feed availability. No verified record was added; existing costs and pending state were retained.",
            },
          ],
        };
      }
    },
  );
process.on("exit", () => journal.close());
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
process.stdin.on("end", () => {
  journal.close();
  void server.close();
});
await server.connect(new StdioServerTransport());
