import { HttpError } from "./http";
import type { LeaderboardPeriod } from "../../shared/contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DISALLOWED_NAME_CHARACTERS = /[\p{Cc}\p{Cf}]/u;

export interface NormalizedName {
  displayName: string;
  nameKey: string;
}

export function normalizeProfileName(input: unknown): NormalizedName {
  if (typeof input !== "string") {
    throw new HttpError(400, "Name must be text.");
  }

  const displayName = input
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ");
  const visibleLength = Array.from(displayName).length;

  if (
    visibleLength < 1 ||
    visibleLength > 40 ||
    DISALLOWED_NAME_CHARACTERS.test(displayName)
  ) {
    throw new HttpError(
      400,
      "Name must contain between 1 and 40 visible characters.",
    );
  }

  return {
    displayName,
    nameKey: displayName.normalize("NFKC").toLowerCase(),
  };
}

export function requireUserId(input: unknown): string {
  if (typeof input !== "string" || !UUID_PATTERN.test(input)) {
    throw new HttpError(400, "A valid user ID is required.");
  }
  return input;
}

export function requireMonth(input: unknown): string {
  if (typeof input !== "string" || !MONTH_PATTERN.test(input)) {
    throw new HttpError(400, "Month must use YYYY-MM format.");
  }
  return input;
}

export function requireLeaderboardPeriod(input: unknown): LeaderboardPeriod {
  if (input !== "today" && input !== "month") {
    throw new HttpError(400, "Period must be today or month.");
  }
  return input;
}
