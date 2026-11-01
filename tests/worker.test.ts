import { describe, expect, it, vi } from "vitest";
import worker from "../worker/index";
import type { Env } from "../worker/lib/env";

const sessionUser = {
  id: "123e4567-e89b-42d3-a456-426614174000",
  display_name: "Batu",
};

const otherUserId = "999e4567-e89b-42d3-a456-426614174999";

function createEnv({ isAdmin = false } = {}) {
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
          first: async () => {
            if (sql.includes("FROM auth_sessions")) {
              return { ...sessionUser, is_admin: isAdmin ? 1 : 0 };
            }
            if (sql.includes("FROM users WHERE id = ?")) {
              return { id: statement.params[0], display_name: "Someone" };
            }
            return null;
          },
          run: async () => ({ meta: { changes: 1 } }),
          all: async () => ({
            results: sql.includes("WHERE email IS NOT NULL")
              ? [{ id: otherUserId, display_name: "Gökçe", email: "g@example.com" }]
              : [],
          }),
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
      isAdmin: false,
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

  describe("admin adjustments", () => {
    function adjust(env: Env, body: Record<string, unknown>) {
      return worker.fetch(
        apiRequest("/api/adjustment", {
          method: "PUT",
          headers: { Cookie: "study_session=token" },
          body: JSON.stringify(body),
        }),
        env,
      );
    }

    it("blocks non-admins from adjusting their own time", async () => {
      const { env, statements } = createEnv();
      const response = await adjust(env, { minutes: 30, operation: "add" });

      expect(response.status).toBe(403);
      expect(statements.some(({ sql }) => sql.includes("INSERT"))).toBe(false);
    });

    it("blocks non-admins from adjusting another profile", async () => {
      const { env, statements } = createEnv();
      const response = await adjust(env, {
        userId: otherUserId,
        minutes: 30,
        operation: "add",
      });

      expect(response.status).toBe(403);
      expect(statements.some(({ sql }) => sql.includes("INSERT"))).toBe(false);
    });

    it("lets admins add time to another profile", async () => {
      const { env, statements } = createEnv({ isAdmin: true });
      const response = await adjust(env, {
        userId: otherUserId,
        minutes: 30,
        operation: "add",
      });

      expect(response.status).toBe(200);
      const insert = statements.find(({ sql }) =>
        sql.includes("INSERT INTO study_adjustments"),
      );
      expect(insert?.params[1]).toBe(otherUserId);
      expect(insert?.params[3]).toBe(1800);
    });

    it("lists linked profiles only for admins", async () => {
      const request = () =>
        apiRequest("/api/admin/users", {
          headers: { Cookie: "study_session=token" },
        });

      expect((await worker.fetch(request(), createEnv().env)).status).toBe(403);
      const response = await worker.fetch(
        request(),
        createEnv({ isAdmin: true }).env,
      );
      expect(await response.json()).toEqual({
        users: [{ id: otherUserId, displayName: "Gökçe", email: "g@example.com" }],
      });
    });
  });
});
