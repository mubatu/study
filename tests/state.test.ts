import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../worker/lib/env";
import { putState } from "../worker/routes/state";

const user = { id: "123e4567-e89b-42d3-a456-426614174000", displayName: "Batu" };
const nowMs = Date.parse("2026-06-06T10:00:00Z");
const minutes = (count: number) => count * 60_000;

interface FakeDb {
  open: { run_id: string; started_at_ms: number; carried_ms: number } | null;
  pause: {
    paused_run_id: string | null;
    paused_elapsed_ms: number | null;
    paused_at_ms: number | null;
  };
}

const noPause = { paused_run_id: null, paused_elapsed_ms: null, paused_at_ms: null };

// A tiny in-memory stand-in that understands the statements putState runs.
function createEnv(db: FakeDb) {
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const prepare = (sql: string) => {
    let params: unknown[] = [];
    const statement = {
      sql,
      get params() {
        return params;
      },
      bind: (...values: unknown[]) => {
        params = values;
        return statement;
      },
      first: async () =>
        sql.includes("FROM study_sessions") ? db.open : db.pause,
    };
    return statement;
  };
  const apply = (sql: string, params: unknown[]) => {
    writes.push({ sql, params });
    if (sql.includes("INSERT OR IGNORE INTO study_sessions")) {
      db.open ??= {
        started_at_ms: params[2] as number,
        run_id: params[4] as string,
        carried_ms: params[5] as number,
      };
    } else if (sql.includes("SET ended_at_ms")) {
      db.open = null;
    } else if (sql.includes("paused_elapsed_ms = NULL")) {
      db.pause = { ...noPause };
    } else if (sql.includes("SET paused_run_id = ?")) {
      db.pause = {
        paused_run_id: params[0] as string,
        paused_elapsed_ms: params[1] as number,
        paused_at_ms: params[2] as number,
      };
    }
  };
  const env = {
    DB: {
      prepare,
      batch: async (statements: ReturnType<typeof prepare>[]) => {
        for (const statement of statements) apply(statement.sql, statement.params);
        return [];
      },
    },
  } as unknown as Env;
  return { env, writes };
}

async function request(env: Env, state: string) {
  const response = await putState(
    new Request("https://study.test/api/state", {
      method: "PUT",
      body: JSON.stringify({ state }),
    }),
    env,
    user,
  );
  return response.json();
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(nowMs);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PUT /api/state", () => {
  it("pauses with the carried time plus the current stretch", async () => {
    const db: FakeDb = {
      open: {
        run_id: "session",
        started_at_ms: nowMs - minutes(30),
        carried_ms: minutes(10),
      },
      pause: { ...noPause },
    };
    const { env } = createEnv(db);

    expect(await request(env, "paused")).toEqual({
      state: "paused",
      serverTime: "2026-06-06T10:00:00.000Z",
      activeSince: null,
      carriedSeconds: 40 * 60,
    });
    expect(db.open).toBeNull();
    expect(db.pause.paused_run_id).toBe("session");
  });

  it("caps a stretch at three hours when pausing", async () => {
    const db: FakeDb = {
      open: { run_id: "session", started_at_ms: nowMs - minutes(200), carried_ms: 0 },
      pause: { ...noPause },
    };
    const { env } = createEnv(db);

    expect((await request(env, "paused")).carriedSeconds).toBe(3 * 60 * 60);
  });

  it("resumes a paused session with its time carried over", async () => {
    const db: FakeDb = {
      open: null,
      pause: {
        paused_run_id: "session",
        paused_elapsed_ms: minutes(40),
        paused_at_ms: nowMs - minutes(5),
      },
    };
    const { env } = createEnv(db);

    expect(await request(env, "studying")).toEqual({
      state: "studying",
      serverTime: "2026-06-06T10:00:00.000Z",
      activeSince: "2026-06-06T10:00:00.000Z",
      carriedSeconds: 40 * 60,
    });
    // The resumed stretch joins the same session so it still counts once.
    expect(db.open?.run_id).toBe("session");
    expect(db.pause.paused_elapsed_ms).toBeNull();
  });

  it("starts a new session with a new id", async () => {
    const db: FakeDb = { open: null, pause: { ...noPause } };
    const { env } = createEnv(db);

    expect((await request(env, "studying")).carriedSeconds).toBe(0);
    expect(db.open?.run_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.open?.carried_ms).toBe(0);
  });

  it("starts fresh when a pause began before the 06:00 reset", async () => {
    const db: FakeDb = {
      open: null,
      // Paused at 23:00 Istanbul on June 5; it is now 13:00 on June 6.
      pause: {
        paused_run_id: "yesterday",
        paused_elapsed_ms: minutes(40),
        paused_at_ms: Date.parse("2026-06-05T20:00:00Z"),
      },
    };
    const { env } = createEnv(db);

    expect((await request(env, "studying")).carriedSeconds).toBe(0);
    expect(db.open?.run_id).not.toBe("yesterday");
  });

  it("stops a paused session", async () => {
    const db: FakeDb = {
      open: null,
      pause: {
        paused_run_id: "session",
        paused_elapsed_ms: minutes(40),
        paused_at_ms: nowMs - minutes(5),
      },
    };
    const { env } = createEnv(db);

    expect(await request(env, "resting")).toMatchObject({
      state: "resting",
      carriedSeconds: 0,
    });
    expect(db.pause.paused_run_id).toBeNull();
  });

  it("ignores Pause when no session is running", async () => {
    const db: FakeDb = { open: null, pause: { ...noPause } };
    const { env, writes } = createEnv(db);

    expect((await request(env, "paused")).state).toBe("resting");
    expect(writes).toHaveLength(0);
  });

  it("rejects unknown states", async () => {
    const { env } = createEnv({ open: null, pause: { ...noPause } });

    await expect(request(env, "sleeping")).rejects.toThrow(
      "State must be studying, paused or resting.",
    );
  });
});
