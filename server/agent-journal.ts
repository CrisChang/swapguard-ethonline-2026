import {
  constants,
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { z } from "zod";
import {
  applyAgentTool,
  emptyAgentState,
  type ToolName,
} from "../src/lib/agent-ledger";

const entrySchema = z
  .object({
    version: z.literal(1),
    atMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    tool: z.enum([
      "swapguard_open_task",
      "swapguard_assess_attempt",
      "swapguard_record_receipt",
    ]),
    input: z.unknown(),
  })
  .strict();
const MAX_BYTES = 4 * 1024 * 1024;

/** Local single-process journal, not authenticated/tamper-proof shared storage. */
export class AgentJournal {
  private state = emptyAgentState();
  private fd = -1;
  private lockFd = -1;
  private readonly path: string;
  private readonly lockPath: string;
  private failed = false;
  private entries = 0;
  private bytes = 0;
  constructor(path: string) {
    this.path = resolve(path);
    this.lockPath = `${this.path}.lock`;
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    try {
      this.lockFd = openSync(this.lockPath, "wx", 0o600);
      writeSync(this.lockFd, JSON.stringify({ pid: process.pid }));
      this.fd = openSync(
        this.path,
        constants.O_CREAT |
          constants.O_APPEND |
          constants.O_RDWR |
          constants.O_NOFOLLOW,
        0o600,
      );
      const stat = fstatSync(this.fd);
      if (!stat.isFile() || stat.size > MAX_BYTES)
        throw new Error("Invalid or oversized local ledger.");
      const saved = readFileSync(this.fd, "utf8");
      if (saved && !saved.endsWith("\n"))
        throw new Error(
          "Incomplete journal entry. Refusing to silently reset recorded costs.",
        );
      for (const line of saved.split("\n").filter(Boolean)) {
        const entry = entrySchema.parse(JSON.parse(line));
        applyAgentTool(this.state, entry.tool, entry.input, entry.atMs);
        this.entries++;
      }
      if (this.entries > 5000) throw new Error("Journal entry limit exceeded.");
      this.bytes = stat.size;
    } catch (error) {
      this.close();
      throw error;
    }
  }
  execute(tool: ToolName, input: unknown, now = Date.now()) {
    if (this.failed || this.fd < 0)
      throw new Error("Journal unavailable; no further operations accepted.");
    const next = structuredClone(this.state);
    const result = applyAgentTool(next, tool, input, now);
    if (tool !== "swapguard_get_task") {
      const entry = entrySchema.parse({ version: 1, atMs: now, tool, input });
      const buffer = Buffer.from(`${JSON.stringify(entry)}\n`);
      if (this.entries >= 5000 || this.bytes + buffer.length > MAX_BYTES)
        throw new Error(
          "Local journal capacity reached; existing costs retained.",
        );
      try {
        let offset = 0;
        while (offset < buffer.length) {
          const written = writeSync(
            this.fd,
            buffer,
            offset,
            buffer.length - offset,
          );
          if (!written) throw new Error("Journal write made no progress.");
          offset += written;
        }
        fsyncSync(this.fd);
      } catch (error) {
        this.failed = true;
        throw error;
      }
      this.entries++;
      this.bytes += buffer.length;
      this.state = next;
    }
    return result;
  }
  close() {
    if (this.fd >= 0) {
      closeSync(this.fd);
      this.fd = -1;
    }
    if (this.lockFd >= 0) {
      closeSync(this.lockFd);
      this.lockFd = -1;
      // Only the instance that created the lock removes it.
      if (existsSync(this.lockPath)) unlinkSync(this.lockPath);
    }
  }
}
