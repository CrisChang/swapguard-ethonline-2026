import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { analyze } from '../src/lib/engine';
import { InputError, validateRequest } from '../src/lib/validation';
import { demoSnapshot } from './demo';
import { liveSnapshot } from './live';
import type { AnalyzeRequest, Snapshot } from '../src/lib/types';
export type Env = { ETHEREUM_RPC_URL?: string; ASSETS?: { fetch: (request: Request) => Promise<Response> } };
type Provider = (req: AnalyzeRequest, url?: string) => Promise<Snapshot>;

export function createApi(provider: Provider = liveSnapshot) {
  const app = new Hono<{ Bindings: Env }>();
  app.use('*', secureHeaders());
  app.use('/api/*', async (c, next) => { c.header('Cache-Control', 'no-store'); await next(); });
  app.get('/api/health', c => c.json({ service: 'swapguard', version: '0.1.0', readOnly: true, chainId: 1, liveData: 'Checked on demand, not by this health endpoint.' }));
  app.use('/api/analyze', bodyLimit({ maxSize: 4096, onError: c => c.json({ error: 'Request too large.' }, 413) }));
  let inFlight = 0;
  app.post('/api/analyze', async c => {
    if (!c.req.header('content-type')?.includes('application/json')) return c.json({ error: 'Use application/json.' }, 415);
    let req: AnalyzeRequest;
    try { req = validateRequest(await c.req.json()); }
    catch (e) { return c.json({ error: e instanceof InputError ? e.message : 'Invalid JSON request.' }, 400); }
    if (req.mode === 'live' && inFlight >= 4) return c.json({ error: 'Live analysis is busy. Please try again shortly.' }, 429);
    try {
      if (req.mode === 'live') inFlight++;
      const snapshot = req.mode === 'demo' ? demoSnapshot(req, Math.floor(Date.now() / 1000)) : await provider(req, c.env?.ETHEREUM_RPC_URL);
      return c.json(analyze(req, snapshot));
    } catch {
      // Never expose provider URLs, credentials, wallet details or raw RPC errors.
      return c.json({ error: 'Live chain data is unavailable or no usable pool quote was returned. No sample data was substituted. Try again, configure a reliable Ethereum RPC, or explicitly select Sample mode.' }, 502);
    } finally { if (req.mode === 'live') inFlight--; }
  });
  app.all('/api/*', c => c.json({ error: 'Not found.' }, 404));
  return app;
}
