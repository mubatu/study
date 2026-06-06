import { STUDY_TIME_ZONE, studyDayKeyForInstant } from "../../shared/studyTime";

export function formatClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  return [hours, minutes, seconds]
    .map((part) => part.toString().padStart(2, "0"))
    .join(":");
}

export function formatDuration(totalSeconds: number): string {
  const roundedMinutes = Math.round(Math.max(0, totalSeconds) / 60);
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

export function currentStudyMonth(timestampMs = Date.now()): string {
  return studyDayKeyForInstant(timestampMs).slice(0, 7);
}

export function formatMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: STUDY_TIME_ZONE,
  }).format(new Date(Date.UTC(year, monthNumber - 1, 15)));
}

export function formatLongDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function moveMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const target = new Date(Date.UTC(year, monthNumber - 1 + amount, 1));
  return `${target.getUTCFullYear()}-${(target.getUTCMonth() + 1)
    .toString()
    .padStart(2, "0")}`;
}
