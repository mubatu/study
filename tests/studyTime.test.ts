import { describe, expect, it } from "vitest";
import {
  aggregateSessions,
  monthBounds,
  studyDayBounds,
  studyDayKeyForInstant,
} from "../shared/studyTime";

describe("study day boundaries", () => {
  it("assigns 05:59 and 06:00 Istanbul time to different days", () => {
    expect(studyDayKeyForInstant(Date.parse("2026-06-06T02:59:59Z"))).toBe(
      "2026-06-05",
    );
    expect(studyDayKeyForInstant(Date.parse("2026-06-06T03:00:00Z"))).toBe(
      "2026-06-06",
    );
  });

  it("returns exact UTC bounds for an Istanbul study day", () => {
    expect(studyDayBounds("2026-06-06")).toEqual({
      startMs: Date.parse("2026-06-06T03:00:00Z"),
      endMs: Date.parse("2026-06-07T03:00:00Z"),
    });
  });

  it("returns month bounds based on study days, not midnight", () => {
    expect(monthBounds("2026-06")).toEqual({
      startMs: Date.parse("2026-06-01T03:00:00Z"),
      endMs: Date.parse("2026-07-01T03:00:00Z"),
    });
  });
});

describe("session aggregation", () => {
  it("splits a session at 06:00", () => {
    const result = aggregateSessions([
      {
        id: "session-1",
        startMs: Date.parse("2026-06-06T02:30:00Z"),
        endMs: Date.parse("2026-06-06T03:30:00Z"),
      },
    ]);

    expect(result.get("2026-06-05")).toEqual({
      date: "2026-06-05",
      totalSeconds: 1800,
      sessionCount: 1,
    });
    expect(result.get("2026-06-06")).toEqual({
      date: "2026-06-06",
      totalSeconds: 1800,
      sessionCount: 1,
    });
  });

  it("caps a continuous session at three hours", () => {
    const result = aggregateSessions([
      {
        id: "long-session",
        startMs: Date.parse("2026-06-05T22:00:00Z"),
        endMs: Date.parse("2026-06-07T10:00:00Z"),
      },
    ]);

    expect(result.get("2026-06-05")?.totalSeconds).toBe(3 * 3600);
    expect(result.has("2026-06-06")).toBe(false);
    expect(result.has("2026-06-07")).toBe(false);
  });

  it("combines sessions and counts each contribution", () => {
    const result = aggregateSessions([
      {
        id: "a",
        startMs: Date.parse("2026-06-06T08:00:00Z"),
        endMs: Date.parse("2026-06-06T08:30:00Z"),
      },
      {
        id: "b",
        startMs: Date.parse("2026-06-06T09:00:00Z"),
        endMs: Date.parse("2026-06-06T10:00:00Z"),
      },
    ]);

    expect(result.get("2026-06-06")).toEqual({
      date: "2026-06-06",
      totalSeconds: 5400,
      sessionCount: 2,
    });
  });

  it("rounds the final daily duration to the nearest second", () => {
    const result = aggregateSessions([
      { id: "a", startMs: 1_000, endMs: 90_600 },
    ]);
    expect([...result.values()][0].totalSeconds).toBe(90);
  });
});
