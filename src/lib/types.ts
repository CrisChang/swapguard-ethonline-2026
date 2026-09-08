import type { TokenSymbol } from "./contracts";
export type Scenario = "normal" | "risky" | "stale";
export interface AnalyzeRequest {
  mode: "live" | "demo";
  tokenIn: TokenSymbol;
  amount: string;
  slippageBps: number;
  owner?: string;
  scenario: Scenario;
}
export interface Feed {
  name: string;
  address: string;
  decimals: number;
  answerRaw: string;
  updatedAt: number;
  roundId: string;
  answeredInRound: string;
  maxAgeSeconds: number;
}
export interface Route {
  fee: number;
  amountOutRaw: string;
  gasEstimate: string;
  pool: string;
}
export interface Snapshot {
  block: { number: string; timestamp: number };
  routes: Route[];
  unavailableFees: number[];
  feeds: { ETH: Feed; USDC: Feed };
  wallet: null | {
    address: string | null;
    sample: boolean;
    balanceRaw: string | null;
    allowances: { name: string; address: string; amountRaw: string | null }[];
  };
}
export type CheckStatus = "pass" | "warn" | "block" | "unknown";
export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}
export interface Report {
  version: "0.1.0";
  request: AnalyzeRequest;
  chainId: 1;
  tokenOut: TokenSymbol;
  createdAt: string;
  expiresAt: string;
  decision: "clear" | "review" | "blocked";
  checks: Check[];
  snapshot: Snapshot;
  quote: {
    amountInRaw: string;
    amountOutRaw: string;
    amountOut: string;
    minimumOutRaw: string;
    minimumOut: string;
    referenceOut: string | null;
    deviationBps: number | null;
    selectedFee: number;
    gasEstimate: string;
    pool: string;
  };
  limitations: string[];
}
