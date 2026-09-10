import { z } from "zod";

const hash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const uint = z.string().regex(/^(0|[1-9]\d{0,77})$/);
export const executionSchema = z
  .object({
    chainId: z.union([z.literal(1), z.literal(31337)]),
    wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  })
  .strict();
export const receiptAnchorSchema = z
  .object({
    blockNumber: uint,
    blockHash: hash,
    deadlineSeconds: z.number().int().positive(),
  })
  .strict();
export const receiptProofSchema = z
  .object({
    kind: z.enum(["rpc-mainnet", "rpc-local-fork"]),
    chainId: z.union([z.literal(1), z.literal(31337)]),
    transactionHash: hash,
    blockNumber: uint,
    blockHash: hash,
    confirmations: z.number().int().positive(),
    gasUsed: uint,
    effectiveGasPriceWei: uint,
    gasCostWei: uint,
    ethUsdAnswer: uint,
    usdcUsdAnswer: uint,
    ethUsdDecimals: z.number().int().min(0).max(18),
    usdcUsdDecimals: z.number().int().min(0).max(18),
    ethUsdUpdatedAt: uint,
    usdcUsdUpdatedAt: uint,
    calldataMatched: z.literal(true),
    checkedAt: z.string(),
  })
  .strict();
export const trustedReceiptContextSchema = z
  .object({
    anchor: receiptAnchorSchema.optional(),
    receiptProof: receiptProofSchema.optional(),
  })
  .strict();
export type ReceiptProof = z.infer<typeof receiptProofSchema>;
export type TrustedReceiptContext = z.infer<typeof trustedReceiptContextSchema>;
