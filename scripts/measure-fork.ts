/** Local-only gas calibration. Never uses a user wallet or sends upstream writes. */
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
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
import {
  CONTRACTS,
  TOKENS,
  FEES,
  QUOTER_ABI,
  FEED_ABI,
} from "../src/lib/contracts";
import { assertLocalFork } from "../src/lib/task-budget";

const rpcUrl = "http://127.0.0.1:18545";
const sourceRpc = "https://ethereum-rpc.publicnode.com";
const forkBlock = BigInt(process.env.FORK_BLOCK || "25938600");
const source = createPublicClient({
  transport: http(sourceRpc, { timeout: 20_000, retryCount: 1 }),
});
const local = createPublicClient({
  transport: http(rpcUrl, { timeout: 60_000, retryCount: 0 }),
});
assertLocalFork(rpcUrl, await local.getChainId());
const metadata = await source.getBlock({ blockNumber: forkBlock });
const initial = await local.getBlock();
if (initial.number !== forkBlock || initial.hash !== metadata.hash)
  throw new Error(
    "Start a fresh Anvil instance at the declared fork block before measuring",
  );
const abi = parseAbi([
  "function deposit() payable",
  "function approve(address spender,uint256 value) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function multicall(uint256 deadline,bytes[] data) payable returns (bytes[] results)",
]);
// This function is closed over a validated loopback URL, never the source transport.
async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(60_000),
  });
  const data = (await res.json()) as { result: T; error?: { message: string } };
  if (data.error) throw new Error(`${method}: ${data.error.message}`);
  return data.result;
}
const [account] = await rpc<Address[]>("eth_accounts");
if (!account) throw new Error("No local development account");
async function send(to: Address, data: Hex, value = 0n) {
  await rpc("anvil_setNextBlockBaseFeePerGas", ["0x0"]);
  const hash = await rpc<Hex>("eth_sendTransaction", [
    {
      from: account,
      to,
      data,
      value: toHex(value),
      gas: toHex(500_000),
      gasPrice: toHex(1_000_000_000n),
    },
  ]);
  const receipt = await local.waitForTransactionReceipt({
    hash,
    timeout: 45_000,
    pollingInterval: 200,
  });
  return {
    localTransactionHash: hash,
    localBlock: receipt.blockNumber.toString(),
    status: receipt.status,
    gasUsed: receipt.gasUsed.toString(),
    effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
  };
}
const funding = await send(
  TOKENS.WETH.address,
  encodeFunctionData({ abi, functionName: "deposit" }),
  parseEther("2"),
);
if (funding.status !== "success") throw new Error("Local WETH setup failed");
let snapshot = await rpc<string>("evm_snapshot");
async function reset() {
  if (!(await rpc<boolean>("evm_revert", [snapshot])))
    throw new Error("Snapshot reset failed");
  snapshot = await rpc<string>("evm_snapshot");
}
const feeds = {} as Record<
  "ETH" | "USDC",
  { answer: string; decimals: number; updatedAt: string }
>;
for (const [symbol, address] of [
  ["ETH", CONTRACTS.ethUsd],
  ["USDC", CONTRACTS.usdcUsd],
] as const) {
  const round = await local.readContract({
    address,
    abi: FEED_ABI,
    functionName: "latestRoundData",
  });
  const decimals = await local.readContract({
    address,
    abi: FEED_ABI,
    functionName: "decimals",
  });
  const maximumAge = symbol === "ETH" ? 3600n : 86_400n;
  if (
    round[1] <= 0n ||
    round[2] === 0n ||
    round[3] === 0n ||
    round[4] < round[0] ||
    round[3] > metadata.timestamp ||
    metadata.timestamp - round[3] > maximumAge
  )
    throw new Error("Feed sanity/freshness check failed");
  feeds[symbol] = {
    answer: round[1].toString(),
    decimals,
    updatedAt: round[3].toString(),
  };
}
const profiles = [];
for (const amount of ["0.01", "0.04", "0.2"]) {
  for (const fee of FEES) {
    await reset();
    const amountIn = parseEther(amount);
    const quote = (
      await local.simulateContract({
        address: CONTRACTS.quoter,
        abi: QUOTER_ABI,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: TOKENS.WETH.address,
            tokenOut: TOKENS.USDC.address,
            amountIn,
            fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      })
    ).result;
    const allowance = await local.readContract({
      address: TOKENS.WETH.address,
      abi,
      functionName: "allowance",
      args: [account, CONTRACTS.router],
    });
    if (allowance !== 0n)
      throw new Error("Calibration must begin with zero allowance");
    const approval = await send(
      TOKENS.WETH.address,
      encodeFunctionData({
        abi,
        functionName: "approve",
        args: [CONTRACTS.router, amountIn],
      }),
    );
    if (approval.status !== "success") throw new Error("Local approval failed");
    const approved = await rpc<string>("evm_snapshot");
    const results = [];
    for (const outcome of ["success", "revert"] as const) {
      const balanceBefore = await local.readContract({
        address: TOKENS.USDC.address,
        abi,
        functionName: "balanceOf",
        args: [account],
      });
      const minOut =
        outcome === "success" ? (quote[0] * 9950n) / 10_000n : quote[0] + 1n;
      const inner = encodeFunctionData({
        abi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: TOKENS.WETH.address,
            tokenOut: TOKENS.USDC.address,
            fee,
            recipient: account,
            amountIn,
            amountOutMinimum: minOut,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      const receipt = await send(
        CONTRACTS.router,
        encodeFunctionData({
          abi,
          functionName: "multicall",
          args: [metadata.timestamp + 3600n, [inner]],
        }),
      );
      const balanceAfter = await local.readContract({
        address: TOKENS.USDC.address,
        abi,
        functionName: "balanceOf",
        args: [account],
      });
      const actualOut = balanceAfter - balanceBefore;
      if (
        receipt.status !== (outcome === "success" ? "success" : "reverted") ||
        (outcome === "success" ? actualOut !== quote[0] : actualOut !== 0n)
      )
        throw new Error(`Unexpected ${outcome} result for ${amount}/${fee}`);
      results.push({
        outcome,
        minimumOutputRaw: minOut.toString(),
        actualOutputRaw: actualOut.toString(),
        ...receipt,
      });
      if (
        outcome === "success" &&
        !(await rpc<boolean>("evm_revert", [approved]))
      )
        throw new Error("Approved state restore failed");
    }
    profiles.push({
      amount,
      amountInRaw: amountIn.toString(),
      fee,
      quotedOutputRaw: quote[0].toString(),
      quoterInternalGasEstimate: quote[3].toString(),
      approval,
      swaps: results,
    });
    console.log(
      `Measured ${amount} WETH / fee ${fee}: approval ${approval.gasUsed}; swap ${results[0].gasUsed}; revert ${results[1].gasUsed}`,
    );
  }
}
await reset();
const result = {
  kind: "LOCAL_FORK_GAS_CALIBRATION_NOT_MAINNET_TRANSACTIONS",
  protocol: "experiments/PROTOCOL.md",
  measuredAt: new Date().toISOString(),
  sourceRpc,
  sourceChainId: 1,
  localChainId: 31337,
  fork: {
    number: forkBlock.toString(),
    hash: metadata.hash,
    timestamp: metadata.timestamp.toString(),
  },
  anvilVersion: execFileSync(
    process.execPath,
    ["node_modules/@foundry-rs/anvil/bin.mjs", "--version"],
    { encoding: "utf8" },
  ).trim(),
  evmRules:
    "Anvil 1.7.1 default hardfork (latest); not an independently verified mainnet hardfork schedule",
  units: {
    tokenOut: "USDC",
    outputDecimals: 6,
    gas: "full transaction gas units",
    gasPrice: "wei",
  },
  fixtures: {
    inventory: "2 fake WETH funded by deposit before independent snapshots",
    funding,
    excludedCosts: [
      "WETH wrapping/inventory preparation",
      "RPC/automation operation",
      "future approval revocation",
    ],
  },
  contracts: CONTRACTS,
  feeds,
  profiles,
};
const outputDirectory =
  process.env.EXPERIMENT_OUTPUT_DIR || "experiments/results";
await mkdir(outputDirectory, { recursive: true });
const file = `${outputDirectory}/fork-${forkBlock}.json`;
await writeFile(file, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
console.log(
  `Saved ${file}; all transaction hashes refer only to the discarded local fork.`,
);
