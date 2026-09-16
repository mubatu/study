import { HttpError } from "./http";
import type { LeaderboardPeriod } from "../../shared/contracts";
import { MAX_DAILY_NOTE_LENGTH } from "../../shared/dailyNotes";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISALLOWED_NAME_CHARACTERS = /[\p{Cc}\p{Cf}]/u;
const DISALLOWED_NOTE_CHARACTERS =
  /[\p{Cf}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u;

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

export function requireStudyDate(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "Date must use YYYY-MM-DD format.");
  }

  const match = DATE_PATTERN.exec(input);
  if (!match) {
    throw new HttpError(400, "Date must use YYYY-MM-DD format.");
  }

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    year < 1000 ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new HttpError(400, "Date must be a valid calendar date.");
  }

  return input;
}

export function normalizeDailyNote(input: unknown): string {
  if (typeof input !== "string") {
    throw new HttpError(400, "Note must be text.");
  }

  const note = input.normalize("NFC").replace(/\r\n?/g, "\n").trim();

  if (
    Array.from(note).length > MAX_DAILY_NOTE_LENGTH ||
    DISALLOWED_NOTE_CHARACTERS.test(note)
  ) {
    throw new HttpError(
      400,
      `Note must contain at most ${MAX_DAILY_NOTE_LENGTH} visible characters.`,
    );
  }

  return note;
}

export function requireLeaderboardPeriod(input: unknown): LeaderboardPeriod {
  if (input !== "today" && input !== "month") {
    throw new HttpError(400, "Period must be today or month.");
  }
  return input;
}
