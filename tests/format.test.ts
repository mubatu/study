import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatDuration,
  moveMonth,
} from "../src/lib/format";

describe("duration formatting", () => {
  it("formats live time with seconds", () => {
    expect(formatClock(5077)).toBe("01:24:37");
  });

  it("rounds history totals to minutes", () => {
    expect(formatDuration(3 * 3600 + 41 * 60 + 31)).toBe("3h 42m");
    expect(formatDuration(42)).toBe("1m");
  });

  it("moves across year boundaries", () => {
    expect(moveMonth("2026-01", -1)).toBe("2025-12");
    expect(moveMonth("2026-12", 1)).toBe("2027-01");
  });
});
