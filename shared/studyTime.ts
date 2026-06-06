export const STUDY_TIME_ZONE = "Europe/Istanbul";
export const STUDY_DAY_START_HOUR = 7;

const dateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: STUDY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

interface DateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export interface SessionInterval {
  id: string;
  startMs: number;
  endMs: number;
}

export interface AggregatedDay {
  date: string;
  totalSeconds: number;
  sessionCount: number;
}

function getZonedParts(timestampMs: number): DateParts {
  const values: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {};

  for (const part of dateTimeFormatter.formatToParts(new Date(timestampMs))) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function addCalendarDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));

  return formatDateKey(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    result.getUTCDate(),
  );
}

export function studyDayKeyForInstant(timestampMs: number): string {
  const local = getZonedParts(timestampMs);
  const localDate = formatDateKey(local.year, local.month, local.day);

  return local.hour < STUDY_DAY_START_HOUR
    ? addCalendarDays(localDate, -1)
    : localDate;
}

function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
): number {
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
  let candidate = targetAsUtc;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getZonedParts(candidate);
    const localAsUtc = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second,
    );
    const correction = targetAsUtc - localAsUtc;
    candidate += correction;

    if (correction === 0) {
      break;
    }
  }

  return candidate;
}

export function studyDayBounds(dateKey: string): {
  startMs: number;
  endMs: number;
} {
  const [year, month, day] = dateKey.split("-").map(Number);
  const nextDate = addCalendarDays(dateKey, 1);
  const [nextYear, nextMonth, nextDay] = nextDate.split("-").map(Number);

  return {
    startMs: zonedDateTimeToUtc(
      year,
      month,
      day,
      STUDY_DAY_START_HOUR,
    ),
    endMs: zonedDateTimeToUtc(
      nextYear,
      nextMonth,
      nextDay,
      STUDY_DAY_START_HOUR,
    ),
  };
}

export function monthBounds(monthKey: string): {
  startMs: number;
  endMs: number;
} {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  const start = studyDayBounds(`${monthKey}-01`).startMs;
  const nextMonth = `${next.getUTCFullYear()}-${(next.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;

  return {
    startMs: start,
    endMs: studyDayBounds(`${nextMonth}-01`).startMs,
  };
}

export function aggregateSessions(
  sessions: SessionInterval[],
): Map<string, AggregatedDay> {
  const raw = new Map<
    string,
    { totalMs: number; sessionIds: Set<string> }
  >();

  for (const session of sessions) {
    if (
      !Number.isFinite(session.startMs) ||
      !Number.isFinite(session.endMs) ||
      session.endMs <= session.startMs
    ) {
      continue;
    }

    let cursor = session.startMs;

    while (cursor < session.endMs) {
      const date = studyDayKeyForInstant(cursor);
      const bounds = studyDayBounds(date);
      const overlapEnd = Math.min(session.endMs, bounds.endMs);
      const overlapMs = overlapEnd - cursor;
      const current = raw.get(date) ?? {
        totalMs: 0,
        sessionIds: new Set<string>(),
      };

      current.totalMs += overlapMs;
      current.sessionIds.add(session.id);
      raw.set(date, current);
      cursor = overlapEnd;
    }
  }

  return new Map(
    [...raw.entries()].map(([date, value]) => [
      date,
      {
        date,
        totalSeconds: Math.round(value.totalMs / 1000),
        sessionCount: value.sessionIds.size,
      },
    ]),
  );
}
