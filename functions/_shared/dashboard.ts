import type {
  DashboardResponse,
  DailyTotal,
  UserProfile,
} from "../../shared/contracts";
import {
  aggregateSessions,
  monthBounds,
  studyDayBounds,
  studyDayKeyForInstant,
} from "../../shared/studyTime";
import type { Env } from "./env";
import { HttpError } from "./http";

interface UserRow {
  id: string;
  display_name: string;
}

interface SessionRow {
  id: string;
  started_at_ms: number;
  ended_at_ms: number | null;
}

export async function getUser(
  env: Env,
  userId: string,
): Promise<UserProfile> {
  const user = await env.DB.prepare(
    "SELECT id, display_name FROM users WHERE id = ?",
  )
    .bind(userId)
    .first<UserRow>();

  if (!user) {
    throw new HttpError(404, "Profile not found.");
  }

  return { id: user.id, displayName: user.display_name };
}

export async function buildDashboard(
  env: Env,
  userId: string,
  month: string,
  nowMs = Date.now(),
): Promise<DashboardResponse> {
  const user = await getUser(env, userId);
  const currentDayKey = studyDayKeyForInstant(nowMs);
  const currentBounds = studyDayBounds(currentDayKey);
  const requestedBounds = monthBounds(month);
  const rangeStart = Math.min(currentBounds.startMs, requestedBounds.startMs);
  const rangeEnd = Math.max(currentBounds.endMs, requestedBounds.endMs);

  const result = await env.DB.prepare(
    `SELECT id, started_at_ms, ended_at_ms
       FROM study_sessions
      WHERE user_id = ?
        AND started_at_ms < ?
        AND (ended_at_ms IS NULL OR ended_at_ms > ?)
      ORDER BY started_at_ms`,
  )
    .bind(userId, rangeEnd, rangeStart)
    .all<SessionRow>();

  const sessions = result.results.map((session) => ({
    id: session.id,
    startMs: session.started_at_ms,
    endMs: Math.min(session.ended_at_ms ?? nowMs, nowMs),
  }));
  const totals = aggregateSessions(sessions);
  const days: DailyTotal[] = [...totals.values()]
    .filter((day) => day.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
  const openSession = result.results.find(
    (session) => session.ended_at_ms === null,
  );
  const currentDay = totals.get(currentDayKey) ?? {
    date: currentDayKey,
    totalSeconds: 0,
    sessionCount: 0,
  };

  return {
    user,
    serverTime: new Date(nowMs).toISOString(),
    state: openSession ? "studying" : "resting",
    activeSince: openSession
      ? new Date(openSession.started_at_ms).toISOString()
      : null,
    currentDay,
    month,
    days,
  };
}
