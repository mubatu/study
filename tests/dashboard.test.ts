import { describe, expect, it, vi } from "vitest";
import { buildDashboard } from "../worker/lib/dashboard";
import type { Env } from "../worker/lib/env";

const userId = "123e4567-e89b-42d3-a456-426614174000";
const nowMs = Date.parse("2026-06-06T10:00:00Z");

function createEnv(sessions: unknown[], adjustments: unknown[] = []) {
  return {
    DB: {
      prepare: vi.fn((sql: string) => {
        const statement = {
          bind: () => statement,
          first: async () =>
            sql.includes("study_sessions")
              ? ((sessions as Array<{ ended_at_ms: number | null }>).find(
                  (session) => session.ended_at_ms === null,
                ) ?? null)
              : { id: userId, display_name: "Batu" },
          all: async () => ({
            results: sql.includes("study_sessions")
              ? sessions
              : sql.includes("study_adjustments")
                ? adjustments
                : [],
          }),
        };
        return statement;
      }),
    },
  } as unknown as Env;
}

describe("dashboard session spans", () => {
  it("lists this month's sessions per study day in order", async () => {
    const dashboard = await buildDashboard(
      createEnv([
        {
          id: "open",
          started_at_ms: Date.parse("2026-06-06T09:15:00Z"),
          ended_at_ms: null,
        },
        {
          id: "morning",
          started_at_ms: Date.parse("2026-06-06T06:00:00Z"),
          ended_at_ms: Date.parse("2026-06-06T07:30:00Z"),
        },
        {
          id: "previous-month",
          started_at_ms: Date.parse("2026-05-31T10:00:00Z"),
          ended_at_ms: Date.parse("2026-05-31T11:00:00Z"),
        },
      ]),
      userId,
      "2026-06",
      nowMs,
    );

    expect(dashboard.sessions).toEqual([
      {
        date: "2026-06-06",
        startedAt: "2026-06-06T06:00:00.000Z",
        endedAt: "2026-06-06T07:30:00.000Z",
        studiedSeconds: 5400,
        breakCount: 0,
        inProgress: false,
        paused: false,
      },
      {
        date: "2026-06-06",
        startedAt: "2026-06-06T09:15:00.000Z",
        endedAt: "2026-06-06T10:00:00.000Z",
        studiedSeconds: 2700,
        breakCount: 0,
        inProgress: true,
        paused: false,
      },
    ]);
  });

  it("counts a paused and resumed session once", async () => {
    const dashboard = await buildDashboard(
      createEnv([
        {
          id: "first-stretch",
          run_id: "session",
          started_at_ms: Date.parse("2026-06-06T08:00:00Z"),
          ended_at_ms: Date.parse("2026-06-06T08:40:00Z"),
        },
        {
          id: "second-stretch",
          run_id: "session",
          started_at_ms: Date.parse("2026-06-06T08:50:00Z"),
          ended_at_ms: Date.parse("2026-06-06T09:30:00Z"),
        },
      ]),
      userId,
      "2026-06",
      nowMs,
    );

    expect(dashboard.currentDay).toEqual({
      date: "2026-06-06",
      totalSeconds: 80 * 60,
      sessionCount: 1,
    });
    expect(dashboard.sessions).toEqual([
      {
        date: "2026-06-06",
        startedAt: "2026-06-06T08:00:00.000Z",
        endedAt: "2026-06-06T09:30:00.000Z",
        studiedSeconds: 80 * 60,
        breakCount: 1,
        inProgress: false,
        paused: false,
      },
    ]);
  });

  it("does not mark an open session past the three-hour cap as in progress", async () => {
    const dashboard = await buildDashboard(
      createEnv([
        {
          id: "forgotten",
          started_at_ms: Date.parse("2026-06-06T05:00:00Z"),
          ended_at_ms: null,
        },
      ]),
      userId,
      "2026-06",
      nowMs,
    );

    expect(dashboard.sessions).toEqual([
      {
        date: "2026-06-06",
        startedAt: "2026-06-06T05:00:00.000Z",
        endedAt: "2026-06-06T08:00:00.000Z",
        studiedSeconds: 3 * 60 * 60,
        breakCount: 0,
        inProgress: false,
        paused: false,
      },
    ]);
  });

  it("returns this month's net manual adjustments per day", async () => {
    const dashboard = await buildDashboard(
      createEnv(
        [],
        [
          { study_date: "2026-06-04", delta_seconds: 1800, session_delta: 1 },
          { study_date: "2026-06-05", delta_seconds: 0, session_delta: 0 },
          { study_date: "2026-06-06", delta_seconds: -900, session_delta: -1 },
        ],
      ),
      userId,
      "2026-06",
      nowMs,
    );

    expect(dashboard.adjustments).toEqual([
      { date: "2026-06-04", deltaSeconds: 1800 },
      { date: "2026-06-06", deltaSeconds: -900 },
    ]);
  });
});
