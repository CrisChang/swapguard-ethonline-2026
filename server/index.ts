import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApi } from './api';
const app = createApi();
// Supply server-only env to the fetch handler, including API routes registered above.
app.use('/*', serveStatic({ root: './dist' }));
app.get('*', serveStatic({ path: './dist/index.html' }));
const port = Number(process.env.PORT || 8787);
serve({ fetch: (req) => app.fetch(req, { ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL }), port, hostname: '127.0.0.1' }, () => console.log(`SwapGuard read-only API: http://127.0.0.1:${port}`));
