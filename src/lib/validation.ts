import { getAddress, isAddress, parseUnits, zeroAddress } from 'viem';
import { TOKENS } from './contracts';
import type { AnalyzeRequest } from './types';
export class InputError extends Error {}
export function validateRequest(raw: unknown): AnalyzeRequest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new InputError('Expected a JSON object.');
  const v = raw as Record<string, unknown>;
  if (v.mode !== 'live' && v.mode !== 'demo') throw new InputError('Choose live or demo mode.');
  if (v.tokenIn !== 'WETH' && v.tokenIn !== 'USDC') throw new InputError('Only WETH and USDC on Ethereum mainnet are supported.');
  const token = TOKENS[v.tokenIn];
  if (typeof v.amount !== 'string' || v.amount.length > 40 || !/^\d+(\.\d+)?$/.test(v.amount)) throw new InputError('Enter a positive decimal amount, without scientific notation.');
  if ((v.amount.split('.')[1]?.length ?? 0) > token.decimals) throw new InputError(`${token.symbol} supports at most ${token.decimals} decimals.`);
  const amount = parseUnits(v.amount, token.decimals);
  const cap = parseUnits(v.tokenIn === 'WETH' ? '1000' : '5000000', token.decimals);
  if (amount <= 0n || amount > cap) throw new InputError(`Amount must be greater than zero and at most ${v.tokenIn === 'WETH' ? '1,000 WETH' : '5,000,000 USDC'}.`);
  if (typeof v.slippageBps !== 'number' || !Number.isInteger(v.slippageBps) || v.slippageBps < 1 || v.slippageBps > 1000) throw new InputError('Slippage must be between 0.01% and 10%, in steps of 0.01%.');
  let owner: string | undefined;
  if (v.owner !== undefined && v.owner !== '') {
    if (typeof v.owner !== 'string' || !isAddress(v.owner, { strict: true }) || v.owner.toLowerCase() === zeroAddress) throw new InputError('Enter a valid non-zero Ethereum address, or leave it blank.');
    owner = getAddress(v.owner);
  }
  const scenario = v.scenario ?? 'normal';
  if (scenario !== 'normal' && scenario !== 'risky' && scenario !== 'stale') throw new InputError('Unknown sample scenario.');
  if (v.mode === 'live' && scenario !== 'normal') throw new InputError('Sample scenarios are only available in demo mode.');
  // Never attach a user's real wallet address to synthetic wallet results.
  return { mode: v.mode, tokenIn: v.tokenIn, amount: v.amount, slippageBps: v.slippageBps, scenario, ...(v.mode === 'live' && owner ? { owner } : {}) };
}
