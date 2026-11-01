import type { D1Database } from "@cloudflare/workers-types";

export interface Env {
  DB: D1Database;
  // Static files from dist/, bound by [assets] in wrangler.toml.
  ASSETS: { fetch(request: Request): Promise<Response> };
  GOOGLE_CLIENT_ID?: string;
}
