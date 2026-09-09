/** Closed-loop receipt proof; writes ONLY to a fresh isolated Anvil fork. No user key. */
import { mkdir, writeFile } from "node:fs/promises";
import {
  createPublicClient,
  http,
  encodeFunctionData,
  parseAbi,
  parseEther,
  toHex,
  type Address,
  type Hex,
} from "viem";
import { CONTRACTS, TOKENS } from "../src/lib/contracts";
import { assertLocalFork } from "../src/lib/task-budget";
import {
  lockIntent,
  exampleDraft,
  verifyProtection,
} from "../src/lib/protection";
import {
  CALIBRATION,
  DEFAULT_CONFIG,
  createSession,
  exportSession,
  nextAction,
  observation,
  reconcile,
  wire,
} from "../src/lib/task-session";

const url = "http://127.0.0.1:18545",
  client = createPublicClient({
    transport: http(url, { timeout: 60000, retryCount: 0 }),
  });
assertLocalFork(url, await client.getChainId());
const block = await client.getBlock();
if (
  block.number !== BigInt(CALIBRATION.fork.number) ||
  block.hash !== CALIBRATION.fork.hash
)
  throw new Error(
    "Start a FRESH Anvil fork at the calibration block; never reuse an unrelated local node.",
  );
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(60000),
  });
  const data = (await response.json()) as {
    result: T;
    error?: { message: string };
  };
  if (data.error) throw new Error(`${method}: ${data.error.message}`);
  return data.result;
}
const [account] = await rpc<Address[]>("eth_accounts");
if (!account) throw new Error("No fake Anvil account");
const abi = parseAbi([
  "function deposit() payable",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns(uint256)",
  "function allowance(address owner,address spender) view returns(uint256)",
]);
let timestamp = block.timestamp;
async function send(to: Address, data: Hex, value = 0n, second = 1) {
  assertLocalFork(url, await client.getChainId());
  timestamp =
    timestamp + 1n > block.timestamp + BigInt(second)
      ? timestamp + 1n
      : block.timestamp + BigInt(second);
  await rpc("evm_setNextBlockTimestamp", [Number(timestamp)]);
  await rpc("anvil_setNextBlockBaseFeePerGas", ["0x0"]);
  const hash = await rpc<Hex>("eth_sendTransaction", [
    {
      from: account,
      to,
      data,
      value: toHex(value),
      gas: toHex(500000),
      gasPrice: toHex(1000000000n),
    },
  ]);
  const receipt = await client.waitForTransactionReceipt({
    hash,
    timeout: 45000,
    pollingInterval: 200,
  });
  return { hash, receipt };
}
const funding = await send(
  TOKENS.WETH.address,
  encodeFunctionData({ abi, functionName: "deposit" }),
  parseEther("2"),
);
if (funding.receipt.status !== "success")
  throw new Error("Fake inventory setup failed");
const allowance = await client.readContract({
  address: TOKENS.WETH.address,
  abi,
  functionName: "allowance",
  args: [account, CONTRACTS.router],
});
if (allowance !== 0n) throw new Error("Expected zero initial allowance");
let session = createSession(DEFAULT_CONFIG, "fork-receipt-proof");
const operations = [];
for (let index = 0; index < 3; index++) {
  session = nextAction(session);
  const pending = session.pending;
  if (!pending) throw new Error("Expected a prepared operation");
  const before = await client.readContract({
    address: TOKENS.USDC.address,
    abi,
    functionName: "balanceOf",
    args: [account],
  });
  let to: Address = TOKENS.WETH.address,
    data: Hex,
    verification: unknown = null,
    encodedFloor: bigint | null = null;
  if (pending.kind === "approval")
    data = encodeFunctionData({
      abi,
      functionName: "approve",
      args: [CONTRACTS.router, parseEther(session.config.amount)],
    });
  else {
    // Exercise a deterministic revert with a STRONGER (quote + 1 raw unit) floor.
    // This is deliberate fault injection, not a recorded market/MEV event.
    encodedFloor =
      index === 1 ? pending.route.output + 1n : session.task.minimumOutput;
    const intent = lockIntent({
      source: "synthetic",
      tokenIn: "WETH",
      amountInRaw: parseEther(session.config.amount).toString(),
      quoteOutRaw: session.initialQuote.toString(),
      slippageBps: session.config.slippageBps,
      sender: account,
      recipient: account,
      fee: pending.route.fee,
      quoteBlock: CALIBRATION.fork.number,
      quotedAt: Number(block.timestamp) + observation(session).second,
      quoteExpiresAt:
        Number(block.timestamp) + observation(session).second + 30,
      deadline: Number(block.timestamp) + session.task.deadline,
    });
    const draft = exampleDraft(intent, { amountOutMinimum: encodedFloor });
    verification = verifyProtection(
      intent,
      draft,
      Number(block.timestamp) + observation(session).second,
    );
    if ((verification as { decision: string }).decision !== "MATCH")
      throw new Error("Fork draft violated original conditions");
    to = CONTRACTS.router;
    data = draft.data;
  }
  const sent = await send(to, data, 0n, observation(session).second);
  const after = await client.readContract({
    address: TOKENS.USDC.address,
    abi,
    functionName: "balanceOf",
    args: [account],
  });
  const expected = index === 1 ? "reverted" : "success";
  if (sent.receipt.status !== expected)
    throw new Error(`Expected ${expected}, got ${sent.receipt.status}`);
  session = reconcile(session, {
    id: pending.id,
    kind: pending.kind,
    status: sent.receipt.status,
    gasUsed: sent.receipt.gasUsed,
    gasPriceWei: sent.receipt.effectiveGasPrice,
    output: after - before,
    evidence: "local-fork",
  });
  operations.push({
    id: pending.id,
    kind: pending.kind,
    localTransactionHash: sent.hash,
    localBlock: sent.receipt.blockNumber,
    status: sent.receipt.status,
    gasUsed: sent.receipt.gasUsed,
    gasPriceWei: sent.receipt.effectiveGasPrice,
    actualOutput: after - before,
    encodedFloor,
    verification,
    calldata: data,
  });
  console.log(
    `${pending.kind}: ${sent.receipt.status}; gas ${sent.receipt.gasUsed}; cumulative raw USDC-eq ${session.spent}`,
  );
}
if (
  session.phase !== "completed" ||
  session.approvalAttempts !== 1 ||
  session.attempts !== 2 ||
  session.output! < session.task.minimumOutput ||
  session.spent > session.task.gasBudget
)
  throw new Error("Closed-loop invariants failed");
const result = wire({
  kind: "LOCAL_FORK_RECEIPT_RECONCILIATION_PROOF_NOT_MAINNET",
  measuredAt: new Date().toISOString(),
  fork: CALIBRATION.fork,
  localChainId: 31337,
  account,
  funding: {
    localTransactionHash: funding.hash,
    gasUsed: funding.receipt.gasUsed,
    excludedFromTask: true,
  },
  operations,
  session: exportSession(session),
  limitations: [
    "Only local fake ETH/WETH; no user key or upstream broadcast",
    "First swap revert is deliberately induced by quote+1 minimum, not real market movement",
    "Mainnet-format draft verified then sent ONLY on local chain 31337; not a mainnet receipt",
    "Fixed 1 gwei local transaction price and pinned reference feeds; does not validate live gas forecasting",
    "Wrapping fake inventory is setup and excluded; task starts holding WETH",
    "Local timestamps are advanced manually within the unchanged task deadline",
    "Calibration uses Anvil 1.7.1 default hardfork, not verified mainnet hardfork schedule",
  ],
});
const dir = process.env.EXPERIMENT_OUTPUT_DIR || "experiments/results";
await mkdir(dir, { recursive: true });
await writeFile(
  `${dir}/task-loop-25938600.json`,
  JSON.stringify(result, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  "Proof saved. All transaction hashes exist only in the local fork.",
);
