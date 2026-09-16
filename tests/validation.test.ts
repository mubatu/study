import { describe, expect, it } from "vitest";
import { HttpError } from "../functions/_shared/http";
import {
  normalizeProfileName,
  normalizeDailyNote,
  requireLeaderboardPeriod,
  requireAdjustmentMinutes,
  requireAdjustmentOperation,
  requireMonth,
  requireStudyDate,
  requireUserId,
} from "../functions/_shared/validation";

describe("profile name normalization", () => {
  it("trims and collapses whitespace while preserving display casing", () => {
    expect(normalizeProfileName("  Batu   Kaya  ")).toEqual({
      displayName: "Batu Kaya",
      nameKey: "batu kaya",
    });
  });

  it("normalizes equivalent Unicode names to the same key", () => {
    const composed = normalizeProfileName("José");
    const decomposed = normalizeProfileName("Jose\u0301");
    expect(composed.nameKey).toBe(decomposed.nameKey);
  });

  it("rejects blank, oversized, and control-character names", () => {
    expect(() => normalizeProfileName("  ")).toThrow(HttpError);
    expect(() => normalizeProfileName("a".repeat(41))).toThrow(HttpError);
    expect(() => normalizeProfileName("Batu\u0000")).toThrow(HttpError);
  });
});

describe("API parameter validation", () => {
  it("accepts valid UUIDs, months, and leaderboard periods", () => {
    expect(requireUserId("123e4567-e89b-42d3-a456-426614174000")).toBe(
      "123e4567-e89b-42d3-a456-426614174000",
    );
    expect(requireMonth("2026-06")).toBe("2026-06");
    expect(requireStudyDate("2026-06-06")).toBe("2026-06-06");
    expect(requireLeaderboardPeriod("today")).toBe("today");
    expect(requireLeaderboardPeriod("month")).toBe("month");
    expect(requireAdjustmentMinutes(30)).toBe(30);
    expect(requireAdjustmentOperation("add")).toBe("add");
    expect(requireAdjustmentOperation("remove")).toBe("remove");
  });

  it("rejects malformed values", () => {
    expect(() => requireUserId("not-an-id")).toThrow(HttpError);
    expect(() => requireMonth("2026-13")).toThrow(HttpError);
    expect(() => requireStudyDate("2026-02-30")).toThrow(HttpError);
    expect(() => requireLeaderboardPeriod("week")).toThrow(HttpError);
    expect(() => requireAdjustmentMinutes(0)).toThrow(HttpError);
    expect(() => requireAdjustmentMinutes(1.5)).toThrow(HttpError);
    expect(() => requireAdjustmentMinutes(1441)).toThrow(HttpError);
    expect(() => requireAdjustmentOperation("replace")).toThrow(HttpError);
  });
});

describe("daily note normalization", () => {
  it("normalizes line endings and trims outer whitespace", () => {
    expect(normalizeDailyNote("  Calculus\r\nPractice  ")).toBe(
      "Calculus\nPractice",
    );
  });

  it("allows an empty note for removal", () => {
    expect(normalizeDailyNote("   ")).toBe("");
  });

  it("rejects oversized and control-character notes", () => {
    expect(() => normalizeDailyNote("a".repeat(241))).toThrow(HttpError);
    expect(() => normalizeDailyNote("Study\u0000note")).toThrow(HttpError);
  });
});
