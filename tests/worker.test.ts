import { describe, expect, it, vi } from "vitest";
import worker from "../worker/index";
import type { Env } from "../worker/lib/env";

const sessionUser = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  display_name: "Batu",
};

function createEnv() {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const assets = vi.fn(async () => new Response("<!doctype html>"));
  const env = {
    GOOGLE_CLIENT_ID: "client-id",
    ASSETS: { fetch: assets },
    DB: {
      prepare: vi.fn((sql: string) => {
        const statement = { sql, params: [] as unknown[] };
        statements.push(statement);
        const bound = {
          bind: (...params: unknown[]) => {
            statement.params = params;
            return bound;
          },
          first: async () =>
            sql.includes("FROM auth_sessions") ? sessionUser : null,
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({ results: [] }),
        };
        return bound;
      }),
    },
  } as unknown as Env;
  return { env, assets, statements };
}

function apiRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`https://study.test${path}`, init);
}

describe("worker router", () => {
  it("serves non-API paths from static assets", async () => {
    const { env, assets } = createEnv();
    const response = await worker.fetch(apiRequest("/privacy"), env);

    expect(response.status).toBe(200);
    expect(assets).toHaveBeenCalledOnce();
  });

  it("answers the session check without a cookie", async () => {
    const { env, statements } = createEnv();
    const response = await worker.fetch(apiRequest("/api/auth/session"), env);

    expect(await response.json()).toEqual({
      user: null,
      googleClientId: "client-id",
    });
    expect(statements).toHaveLength(0);
  });

  it("requires a session for signed-in routes", async () => {
    const { env } = createEnv();
    const response = await worker.fetch(
      apiRequest("/api/dashboard?month=2026-06"),
      env,
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 for unknown API paths and 405 for wrong methods", async () => {
    const { env } = createEnv();

    expect((await worker.fetch(apiRequest("/api/missing"), env)).status).toBe(
      404,
    );
    const wrongMethod = await worker.fetch(apiRequest("/api/note"), env);
    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("Allow")).toBe("PUT");
  });

  it("rejects cross-site writes before touching the database", async () => {
    const { env, statements } = createEnv();
    const response = await worker.fetch(
      apiRequest("/api/note", {
        method: "PUT",
        headers: { Origin: "https://evil.test", Cookie: "study_session=token" },
        body: JSON.stringify({ date: "2026-06-06", text: "x" }),
      }),
      env,
    );

    expect(response.status).toBe(403);
    expect(statements).toHaveLength(0);
  });

  it("writes as the session user even if the body names someone else", async () => {
    const { env, statements } = createEnv();
    const response = await worker.fetch(
      apiRequest("/api/note", {
        method: "PUT",
        headers: { Origin: "https://study.test", Cookie: "study_session=token" },
        body: JSON.stringify({
          userId: "999e4567-e89b-42d3-a456-426614174999",
          date: "2026-06-06",
          text: "Chapter 4",
        }),
      }),
      env,
    );

    expect(response.status).toBe(200);
    const insert = statements.find(({ sql }) => sql.includes("daily_notes"));
    expect(insert?.params[0]).toBe(sessionUser.id);
  });
});
