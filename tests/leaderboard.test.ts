import { describe, expect, it } from "vitest";
import { rankLeaderboardSessions } from "../shared/leaderboard";

const rangeStart = Date.parse("2026-06-06T03:00:00Z");
const rangeEnd = Date.parse("2026-06-06T10:00:00Z");

describe("leaderboard ranking", () => {
  it("clips sessions to the requested period and ranks totals", () => {
    const entries = rankLeaderboardSessions(
      [
        {
          user_id: "ada",
          display_name: "Ada",
          started_at_ms: Date.parse("2026-06-06T03:00:00Z"),
          ended_at_ms: Date.parse("2026-06-06T06:00:00Z"),
        },
        {
          user_id: "batu",
          display_name: "Batu",
          started_at_ms: Date.parse("2026-06-06T05:00:00Z"),
          ended_at_ms: Date.parse("2026-06-06T06:00:00Z"),
        },
      ],
      rangeStart,
      rangeEnd,
    );

    expect(entries.map(({ rank, user, totalSeconds }) => ({
      rank,
      name: user.displayName,
      totalSeconds,
    }))).toEqual([
      { rank: 1, name: "Ada", totalSeconds: 10_800 },
      { rank: 2, name: "Batu", totalSeconds: 3600 },
    ]);
  });

  it("combines sessions, marks active users, and shares tied ranks", () => {
    const entries = rankLeaderboardSessions(
      [
        {
          user_id: "ada",
          display_name: "Ada",
          started_at_ms: Date.parse("2026-06-06T06:00:00Z"),
          ended_at_ms: null,
        },
        {
          user_id: "batu",
          display_name: "Batu",
          started_at_ms: Date.parse("2026-06-06T06:00:00Z"),
          ended_at_ms: Date.parse("2026-06-06T08:00:00Z"),
        },
        {
          user_id: "cara",
          display_name: "Cara",
          started_at_ms: Date.parse("2026-06-06T07:00:00Z"),
          ended_at_ms: Date.parse("2026-06-06T08:00:00Z"),
        },
      ],
      rangeStart,
      Date.parse("2026-06-06T08:00:00Z"),
    );

    expect(entries.map((entry) => ({
      rank: entry.rank,
      name: entry.user.displayName,
      seconds: entry.totalSeconds,
      active: entry.isStudying,
    }))).toEqual([
      { rank: 1, name: "Ada", seconds: 7200, active: true },
      { rank: 1, name: "Batu", seconds: 7200, active: false },
      { rank: 3, name: "Cara", seconds: 3600, active: false },
    ]);
  });

  it("omits sessions with no overlap or rounded study time", () => {
    const entries = rankLeaderboardSessions(
      [
        {
          user_id: "before",
          display_name: "Before",
          started_at_ms: rangeStart - 2_000,
          ended_at_ms: rangeStart,
        },
        {
          user_id: "tiny",
          display_name: "Tiny",
          started_at_ms: rangeStart,
          ended_at_ms: rangeStart + 400,
        },
      ],
      rangeStart,
      rangeEnd,
    );

    expect(entries).toEqual([]);
  });

  it("caps each continuous session at three hours", () => {
    const entries = rankLeaderboardSessions(
      [
        {
          user_id: "ada",
          display_name: "Ada",
          started_at_ms: rangeStart,
          ended_at_ms: rangeStart + 8 * 60 * 60 * 1000,
        },
      ],
      rangeStart,
      rangeStart + 8 * 60 * 60 * 1000,
    );

    expect(entries[0]?.totalSeconds).toBe(3 * 60 * 60);
  });

  it("includes positive and negative manual adjustments in rankings", () => {
    const entries = rankLeaderboardSessions(
      [
        {
          user_id: "ada",
          display_name: "Ada",
          started_at_ms: rangeStart,
          ended_at_ms: rangeStart + 2 * 60 * 60 * 1000,
        },
      ],
      rangeStart,
      rangeEnd,
      [
        {
          user_id: "ada",
          display_name: "Ada",
          delta_seconds: -30 * 60,
        },
        {
          user_id: "batu",
          display_name: "Batu",
          delta_seconds: 3 * 60 * 60,
        },
      ],
    );

    expect(entries.map((entry) => ({
      name: entry.user.displayName,
      seconds: entry.totalSeconds,
    }))).toEqual([
      { name: "Batu", seconds: 3 * 60 * 60 },
      { name: "Ada", seconds: 90 * 60 },
    ]);
  });
});
