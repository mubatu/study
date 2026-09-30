import { describe, expect, it, vi } from "vitest";
import { buildMonthlyActivity } from "../functions/_shared/activity";
import { onRequestGet } from "../functions/api/activity";
import type { Env } from "../functions/_shared/env";

const profile = { id: "123e4567-e89b-42d3-a456-426614174000", display_name: "Miniş" };
const nowMs = Date.parse("2026-06-06T10:00:00Z");

function createEnv(sessions: unknown[] = [], adjustments: unknown[] = [], user: unknown = profile) {
  const queries: Array<{ sql: string; params: unknown[] }> = [];
  const env = {
    DB: {
      prepare: vi.fn((sql: string) => {
        const query = { sql, params: [] as unknown[] };
        queries.push(query);
        const statement = {
          bind: (...params: unknown[]) => { query.params = params; return statement; },
          first: async () => user,
          all: async () => ({ results: sql.includes("study_sessions") ? sessions : adjustments }),
        };
        return statement;
      }),
    },
  } as unknown as Env;
  return { env, queries };
}

describe("monthly hours API", () => {
  it("splits boundary sessions, caps live sessions, and applies adjustments without reading notes", async () => {
    const { env, queries } = createEnv([
      {
        id: "month-boundary",
        started_at_ms: Date.parse("2026-06-01T02:00:00Z"),
        ended_at_ms: Date.parse("2026-06-01T04:00:00Z"),
      },
      {
        id: "day-boundary",
        started_at_ms: Date.parse("2026-06-05T02:00:00Z"),
        ended_at_ms: Date.parse("2026-06-05T04:00:00Z"),
      },
      {
        id: "live",
        started_at_ms: Date.parse("2026-06-06T06:00:00Z"),
        ended_at_ms: null,
      },
    ], [
      { study_date: "2026-06-04", delta_seconds: -1800 },
      { study_date: "2026-06-05", delta_seconds: -7200 },
      { study_date: "2026-06-02", delta_seconds: 5400 },
    ]);

    const result = await buildMonthlyActivity(env, profile.id, "2026-06", nowMs);
    expect(result).toEqual({
      user: { id: profile.id, displayName: "Miniş" },
      serverTime: new Date(nowMs).toISOString(),
      month: "2026-06",
      days: [
        { date: "2026-06-01", totalSeconds: 3600 },
        { date: "2026-06-02", totalSeconds: 5400 },
        { date: "2026-06-04", totalSeconds: 1800 },
        { date: "2026-06-06", totalSeconds: 10_800 },
      ],
    });
    expect(queries).toHaveLength(3);
    expect(queries.every((query) => !/note/i.test(query.sql))).toBe(true);
    expect(queries[1].params).toEqual([profile.id, nowMs, Date.parse("2026-06-01T03:00:00Z")]);
    expect(queries[2].params).toEqual([profile.id, "2026-06-%"]);
  });

  it("returns an empty month and clips live time at the server clock", async () => {
    const empty = createEnv();
    expect((await buildMonthlyActivity(empty.env, profile.id, "2026-05", nowMs)).days).toEqual([]);

    const { env } = createEnv([{
      id: "ongoing",
      started_at_ms: nowMs - 1800_000,
      ended_at_ms: null,
    }]);
    expect((await buildMonthlyActivity(env, profile.id, "2026-06", nowMs)).days).toEqual([
      { date: "2026-06-06", totalSeconds: 1800 },
    ]);
  });

  it("rejects unknown profiles", async () => {
    const { env } = createEnv([], [], null);
    await expect(buildMonthlyActivity(env, profile.id, "2026-06", nowMs)).rejects.toMatchObject({
      status: 404,
      message: "Profile not found.",
    });
  });

  it.each([
    "userId=invalid&month=2026-06",
    `userId=${profile.id}&month=2026-13`,
    `userId=${profile.id}`,
  ])("validates the API query before reading data: %s", async (query) => {
    const { env, queries } = createEnv();
    const response = await onRequestGet({
      request: new Request(`https://study.test/api/activity?${query}`),
      env,
    });
    expect(response.status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it("returns hours-only JSON with no caching", async () => {
    const { env } = createEnv();
    const response = await onRequestGet({
      request: new Request(`https://study.test/api/activity?userId=${profile.id}&month=2026-06`),
      env,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      user: { id: profile.id, displayName: "Miniş" },
      month: "2026-06",
      days: [],
    });
  });
});
