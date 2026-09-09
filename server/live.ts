import {
  createPublicClient,
  erc20Abi,
  fallback,
  http,
  zeroAddress,
  type Address,
} from "viem";
import { mainnet } from "viem/chains";
import { parseUnits } from "viem";
import {
  CONTRACTS,
  FACTORY_ABI,
  FEED_ABI,
  FEES,
  QUOTER_ABI,
  SPENDERS,
  TOKENS,
} from "../src/lib/contracts";
import type { AnalyzeRequest, Feed, Snapshot } from "../src/lib/types";

export async function liveSnapshot(
  req: AnalyzeRequest,
  rpcUrl?: string,
): Promise<Snapshot> {
  // Only the operator may configure endpoints; never accept RPC URLs in public requests.
  const urls = rpcUrl
    ? [rpcUrl]
    : ["https://ethereum-rpc.publicnode.com", "https://eth.drpc.org"];
  if (urls.some((url) => !url.startsWith("https://")))
    throw new Error("RPC must use HTTPS.");
  // Use single-call HTTP requests. Public providers impose batch limits, and
  // viem's shared batch scheduler also couples otherwise independent Worker requests.
  // Keep Promise concurrency and fixed-block reads, without cross-request batching.
  const client = createPublicClient({
    chain: mainnet,
    transport: fallback(
      urls.map((url) =>
        http(url, {
          batch: false,
          timeout: 12000,
          retryCount: 0,
        }),
      ),
      { retryCount: 0 },
    ),
  });
  if ((await client.getChainId()) !== 1)
    throw new Error("RPC is not Ethereum mainnet.");
  const block = await client.getBlock();
  const blockNumber = block.number;
  if (blockNumber === null) throw new Error("No mined block.");
  const tokenIn = TOKENS[req.tokenIn],
    tokenOut = TOKENS[req.tokenIn === "WETH" ? "USDC" : "WETH"];
  const amountIn = parseUnits(req.amount, tokenIn.decimals);
  const readFeed = async (
    address: Address,
    name: string,
    maxAgeSeconds: number,
  ): Promise<Feed> => {
    const [decimals, round] = await Promise.all([
      client.readContract({
        address,
        abi: FEED_ABI,
        functionName: "decimals",
        blockNumber,
      }),
      client.readContract({
        address,
        abi: FEED_ABI,
        functionName: "latestRoundData",
        blockNumber,
      }),
    ]);
    return {
      name,
      address,
      decimals,
      roundId: round[0].toString(),
      answerRaw: round[1].toString(),
      updatedAt: Number(round[3]),
      answeredInRound: round[4].toString(),
      maxAgeSeconds,
    };
  };
  const readWallet = async (): Promise<Snapshot["wallet"]> => {
    if (!req.owner) return null;
    const owner = req.owner as Address;
    const [balance, ...allowances] = await Promise.allSettled([
      client.readContract({
        address: tokenIn.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [owner],
        blockNumber,
      }),
      ...SPENDERS.map((s) =>
        client.readContract({
          address: tokenIn.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [owner, s.address],
          blockNumber,
        }),
      ),
    ]);
    return {
      address: owner,
      sample: false,
      balanceRaw:
        balance.status === "fulfilled" ? balance.value.toString() : null,
      allowances: SPENDERS.map((s, i) => ({
        ...s,
        amountRaw:
          allowances[i]?.status === "fulfilled"
            ? allowances[i].value.toString()
            : null,
      })),
    };
  };
  const [quotes, ETH, USDC, wallet] = await Promise.all([
    Promise.allSettled(
      FEES.map(async (fee) => {
        const pool = await client.readContract({
          address: CONTRACTS.factory,
          abi: FACTORY_ABI,
          functionName: "getPool",
          args: [tokenIn.address, tokenOut.address, fee],
          blockNumber,
        });
        if (pool === zeroAddress) throw new Error("Pool unavailable");
        // Quoter uses revert-based pricing internally. eth_call / simulateContract is read-only.
        const { result } = await client.simulateContract({
          address: CONTRACTS.quoter,
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              amountIn,
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
          blockNumber,
        });
        return {
          fee,
          amountOutRaw: result[0].toString(),
          gasEstimate: result[3].toString(),
          pool,
        };
      }),
    ),
    readFeed(CONTRACTS.ethUsd, "ETH / USD", 3600),
    readFeed(CONTRACTS.usdcUsd, "USDC / USD", 86400),
    readWallet(),
  ]);
  return {
    block: {
      number: blockNumber.toString(),
      timestamp: Number(block.timestamp),
    },
    routes: quotes.flatMap((q) => (q.status === "fulfilled" ? [q.value] : [])),
    unavailableFees: quotes.flatMap((q, i) =>
      q.status === "rejected" ? [FEES[i]] : [],
    ),
    feeds: { ETH, USDC },
    wallet,
  };
}
