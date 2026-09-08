import { liveSnapshot } from '../server/live';
import { analyze } from '../src/lib/engine';
import { validateRequest } from '../src/lib/validation';
const req = validateRequest({ mode: 'live', tokenIn: process.argv[2] || 'WETH', amount: process.argv[3] || '0.1', slippageBps: 50 });
const snapshot = await liveSnapshot(req, process.env.ETHEREUM_RPC_URL);
const report = analyze(req, snapshot);
console.log(JSON.stringify(report, null, 2));
