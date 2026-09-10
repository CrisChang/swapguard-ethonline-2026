/** Read-only, operator-configured RPC verifier. No wallet client or broadcast API. */
import {
  createPublicClient,
  http,
  decodeFunctionData,
  decodeEventLog,
  erc20Abi,
  formatUnits,
  parseUnits,
  type PublicClient,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import { CONTRACTS, TOKENS, FEED_ABI, FEES } from "../src/lib/contracts";
import { SWAP_ABI, DEADLINE_ABI } from "../src/lib/protection";
import type { AgentTask, TaskTerms } from "../src/lib/agent-ledger";
import { receiptProofSchema } from "../src/lib/receipt-proof";

export const verifyReceiptSchema = z
  .object({
    taskId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
    attemptId: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/),
    transactionHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  })
  .strict();
const eq = (a: string | null | undefined, b: string) =>
  a?.toLowerCase() === b.toLowerCase();
const requireThat = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
export function gasToUsdcRaw(
  wei: bigint,
  eth: { answer: bigint; decimals: number },
  usdc: { answer: bigint; decimals: number },
) {
  requireThat(
    wei >= 0n && eth.answer > 0n && usdc.answer > 0n,
    "Invalid gas conversion inputs.",
  );
  for (const d of [eth.decimals, usdc.decimals])
    requireThat(
      Number.isInteger(d) && d >= 0 && d <= 18,
      "Unsupported feed decimals.",
    );
  const numerator =
    wei * eth.answer * 10n ** BigInt(usdc.decimals) * 1_000_000n;
  const denominator = 10n ** 18n * usdc.answer * 10n ** BigInt(eth.decimals);
  return (numerator + denominator - 1n) / denominator; // Conservative ceil to 1 micro-USDC.
}

export class ReceiptVerifier {
  readonly client: PublicClient;
  constructor(
    readonly url: string,
    readonly chainId: 1 | 31337,
    readonly confirmations = chainId === 1 ? 12 : 1,
    client?: PublicClient,
  ) {
    const parsed = new URL(url);
    requireThat(
      chainId === 1 || chainId === 31337,
      "Only Ethereum mainnet or a local Ethereum fork is supported.",
    );
    requireThat(
      chainId === 1
        ? parsed.protocol === "https:"
        : parsed.protocol === "http:" &&
            ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname),
      "Use HTTPS for mainnet and loopback HTTP for fork verification.",
    );
    requireThat(
      Number.isInteger(confirmations) &&
        confirmations >= (chainId === 1 ? 12 : 1) &&
        confirmations <= 128,
      "Invalid confirmation threshold.",
    );
    this.client =
      client ??
      createPublicClient({
        transport: http(url, { timeout: 12000, retryCount: 0, batch: false }),
      });
  }
  async anchor(terms: TaskTerms, now = Date.now()) {
    requireThat(
      terms.execution?.chainId === this.chainId,
      "Task chain does not match configured verifier.",
    );
    requireThat(
      (await this.client.getChainId()) === this.chainId,
      "RPC chain mismatch.",
    );
    const block = await this.client.getBlock();
    requireThat(
      block.number !== null && block.hash !== null,
      "RPC has no mined anchor block.",
    );
    return {
      blockNumber: block.number!.toString(),
      blockHash: block.hash!,
      deadlineSeconds:
        Number(block.timestamp) + Math.floor((terms.expiresAtMs - now) / 1000),
    };
  }
  async prices(blockNumber: bigint, timestamp: bigint) {
    const read = async (address: Address, maxAge: bigint) => {
      const [decimals, round] = await Promise.all([
        this.client.readContract({
          address,
          abi: FEED_ABI,
          functionName: "decimals",
          blockNumber,
        }),
        this.client.readContract({
          address,
          abi: FEED_ABI,
          functionName: "latestRoundData",
          blockNumber,
        }),
      ]);
      requireThat(
        decimals <= 18 &&
          round[1] > 0n &&
          round[3] > 0n &&
          round[3] <= timestamp &&
          timestamp - round[3] <= maxAge &&
          round[4] >= round[0],
        "Price feed is stale, incomplete or invalid; no verified receipt recorded.",
      );
      return { answer: round[1], decimals, updatedAt: round[3] };
    };
    const [eth, usdc] = await Promise.all([
      read(CONTRACTS.ethUsd, 3600n),
      read(CONTRACTS.usdcUsd, 86400n),
    ]);
    return { eth, usdc };
  }
  async verify(task: AgentTask, raw: unknown) {
    const input = verifyReceiptSchema.parse(raw);
    const binding = task.terms.execution,
      anchor = task.receiptAnchor;
    requireThat(
      binding && anchor,
      "Task requires immutable wallet/chain binding and an RPC anchor at creation.",
    );
    requireThat(
      binding!.chainId === this.chainId &&
        (await this.client.getChainId()) === this.chainId,
      "RPC chain mismatch.",
    );
    requireThat(
      input.taskId === task.terms.taskId,
      "Task identifier mismatch.",
    );
    const check = Object.hasOwn(task.checks, input.attemptId)
      ? task.checks[input.attemptId]
      : null;
    requireThat(
      check?.outcome === "ADVISORY_READY",
      "Receipt must belong to an assessed, ready operation.",
    );
    const attempt = check!.input;
    const hash = input.transactionHash as Hex;
    const [tx, receipt] = await Promise.all([
      this.client.getTransaction({ hash }),
      this.client.getTransactionReceipt({ hash }),
    ]);
    requireThat(
      eq(tx.hash, hash) &&
        eq(receipt.transactionHash, hash) &&
        tx.blockHash === receipt.blockHash &&
        tx.blockNumber === receipt.blockNumber,
      "Transaction/receipt identity mismatch.",
    );
    requireThat(
      eq(tx.from, binding!.wallet) &&
        eq(receipt.from, binding!.wallet) &&
        eq(receipt.to, tx.to!),
      "Transaction wallet or recipient mismatch.",
    );
    requireThat(
      receipt.blockNumber > BigInt(anchor!.blockNumber),
      "Receipt predates task creation.",
    );
    requireThat(
      tx.value === 0n && ["legacy", "eip2930", "eip1559"].includes(tx.type),
      "Unsupported transaction value/type; wrapping, blobs and delegated accounts are out of scope.",
    );
    const [block, anchorBlock, head] = await Promise.all([
      this.client.getBlock({ blockNumber: receipt.blockNumber }),
      this.client.getBlock({ blockNumber: BigInt(anchor!.blockNumber) }),
      this.client.getBlockNumber({ cacheTime: 0 }),
    ]);
    requireThat(
      block.hash === receipt.blockHash &&
        anchorBlock.hash === anchor!.blockHash,
      "Canonical block changed; receipt verification refused.",
    );
    const confirmations = head - receipt.blockNumber + 1n;
    requireThat(
      confirmations >= BigInt(this.confirmations),
      "Receipt does not have enough confirmations yet.",
    );
    requireThat(
      receipt.gasUsed > 0n && receipt.effectiveGasPrice >= 0n,
      "Invalid receipt gas fields.",
    );
    if (attempt.kind === "approval") {
      requireThat(
        eq(tx.to, TOKENS.WETH.address),
        "Approval token does not match WETH.",
      );
      const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.input });
      requireThat(
        decoded.functionName === "approve",
        "Only exact WETH approval is supported.",
      );
      const [spender, amount] = decoded.args as [Address, bigint];
      requireThat(
        eq(spender, CONTRACTS.router) &&
          amount === parseUnits(task.terms.amountWeth, 18),
        "Approval spender/amount mismatch.",
      );
    } else {
      requireThat(
        eq(tx.to, CONTRACTS.router),
        "Only the configured Uniswap SwapRouter02 is supported.",
      );
      const outer = decodeFunctionData({ abi: DEADLINE_ABI, data: tx.input });
      const [deadline, calls] = outer.args;
      requireThat(
        calls.length === 1 && deadline <= BigInt(anchor!.deadlineSeconds),
        "Require one deadline-bound swap within the task deadline.",
      );
      const inner = decodeFunctionData({ abi: SWAP_ABI, data: calls[0] });
      const params = inner.args[0];
      requireThat(
        eq(params.tokenIn, TOKENS.WETH.address) &&
          eq(params.tokenOut, TOKENS.USDC.address) &&
          eq(params.recipient, binding!.wallet),
        "Swap tokens/recipient mismatch.",
      );
      requireThat(
        params.amountIn === parseUnits(task.terms.amountWeth, 18) &&
          params.amountOutMinimum ===
            parseUnits(attempt.transactionMinimumUsdc, 6) &&
          params.sqrtPriceLimitX96 === 0n &&
          (FEES as readonly number[]).includes(params.fee),
        "Swap amount/minimum/pool parameters differ from the checked request.",
      );
    }
    let output = 0n,
      wethDebit = 0n,
      approvalSeen = false;
    if (receipt.status === "success")
      for (const log of receipt.logs) {
        if (
          !eq(log.address, TOKENS.USDC.address) &&
          !eq(log.address, TOKENS.WETH.address)
        )
          continue;
        let event;
        try {
          event = decodeEventLog({
            abi: erc20Abi,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          continue;
        }
        if (event.eventName === "Transfer") {
          const { from, to, value } = event.args;
          if (eq(log.address, TOKENS.USDC.address)) {
            if (eq(to, binding!.wallet)) output += value;
            if (eq(from, binding!.wallet)) output -= value;
          } else {
            if (eq(from, binding!.wallet)) wethDebit += value;
            if (eq(to, binding!.wallet)) wethDebit -= value;
          }
        }
        if (
          event.eventName === "Approval" &&
          eq(log.address, TOKENS.WETH.address)
        ) {
          const { owner, spender, value } = event.args;
          approvalSeen ||=
            eq(owner, binding!.wallet) &&
            eq(spender, CONTRACTS.router) &&
            value === parseUnits(task.terms.amountWeth, 18);
        }
      }
    requireThat(
      receipt.status === "success" || receipt.status === "reverted",
      "Unsupported receipt status.",
    );
    if (receipt.status === "success" && attempt.kind === "swap")
      requireThat(
        output > 0n && wethDebit === parseUnits(task.terms.amountWeth, 18),
        "Swap transfer logs do not reconcile the task's input/output.",
      );
    else
      requireThat(
        output === 0n && wethDebit === 0n,
        "Unexpected token transfers for approval/revert.",
      );
    if (receipt.status === "success" && attempt.kind === "approval")
      requireThat(approvalSeen, "Approval event missing or inconsistent.");
    const prices = await this.prices(receipt.blockNumber, block.timestamp);
    const gasWei = receipt.gasUsed * receipt.effectiveGasPrice;
    // Re-read canonical block after the feed reads. This detects a reorg during this check.
    requireThat(
      (await this.client.getBlock({ blockNumber: receipt.blockNumber }))
        .hash === receipt.blockHash,
      "Receipt block changed during verification.",
    );
    const proof = receiptProofSchema.parse({
      kind: this.chainId === 1 ? "rpc-mainnet" : "rpc-local-fork",
      chainId: this.chainId,
      transactionHash: hash,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      confirmations: Number(confirmations),
      gasUsed: receipt.gasUsed.toString(),
      effectiveGasPriceWei: receipt.effectiveGasPrice.toString(),
      gasCostWei: gasWei.toString(),
      ethUsdAnswer: prices.eth.answer.toString(),
      usdcUsdAnswer: prices.usdc.answer.toString(),
      ethUsdDecimals: prices.eth.decimals,
      usdcUsdDecimals: prices.usdc.decimals,
      ethUsdUpdatedAt: prices.eth.updatedAt.toString(),
      usdcUsdUpdatedAt: prices.usdc.updatedAt.toString(),
      calldataMatched: true,
      checkedAt: new Date().toISOString(),
    });
    return {
      input: {
        taskId: input.taskId,
        attemptId: input.attemptId,
        receiptId: `c${this.chainId}-${hash.slice(2).toLowerCase()}`,
        status: receipt.status,
        gasCostUsdc: formatUnits(
          gasToUsdcRaw(gasWei, prices.eth, prices.usdc),
          6,
        ),
        outputUsdc: formatUnits(output, 6),
      },
      proof,
    };
  }
}
