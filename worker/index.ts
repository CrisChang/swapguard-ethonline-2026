import { createApi, type Env } from "../server/api";
const app = createApi();
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname.startsWith("/api/"))
      return app.fetch(request, { ...env, REQUIRE_LIVE_RATE_LIMIT: true });
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : new Response("Assets not built.", { status: 503 });
  },
};
