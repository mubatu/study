import type {
  DashboardResponse,
  DailyNote,
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

interface NoteRow {
  study_date: string;
  note: string;
}

interface AdjustmentRow {
  study_date: string;
  delta_seconds: number;
  session_delta: number;
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

  const [result, noteResult, adjustmentResult] = await Promise.all([
    env.DB.prepare(
      `SELECT id, started_at_ms, ended_at_ms
         FROM study_sessions
        WHERE user_id = ?
          AND started_at_ms < ?
          AND (ended_at_ms IS NULL OR ended_at_ms > ?)
        ORDER BY started_at_ms`,
    )
      .bind(userId, rangeEnd, rangeStart)
      .all<SessionRow>(),
    env.DB.prepare(
      `SELECT study_date, note
         FROM daily_notes
        WHERE user_id = ?
          AND study_date LIKE ?
        ORDER BY study_date`,
    )
      .bind(userId, `${month}-%`)
      .all<NoteRow>(),
    env.DB.prepare(
      `SELECT
         study_date,
         SUM(delta_seconds) AS delta_seconds,
         SUM(session_delta) AS session_delta
       FROM study_adjustments
       WHERE user_id = ?
         AND (study_date LIKE ? OR study_date = ?)
       GROUP BY study_date`,
    )
      .bind(userId, `${month}-%`, currentDayKey)
      .all<AdjustmentRow>(),
  ]);

  const sessions = result.results.map((session) => ({
    id: session.id,
    startMs: session.started_at_ms,
    endMs: Math.min(session.ended_at_ms ?? nowMs, nowMs),
  }));
  const totals = aggregateSessions(sessions);
  for (const adjustment of adjustmentResult.results) {
    const current = totals.get(adjustment.study_date) ?? {
      date: adjustment.study_date,
      totalSeconds: 0,
      sessionCount: 0,
    };
    current.totalSeconds = Math.max(
      0,
      current.totalSeconds + adjustment.delta_seconds,
    );
    current.sessionCount = Math.max(
      0,
      current.sessionCount + adjustment.session_delta,
    );
    totals.set(adjustment.study_date, current);
  }
  const days: DailyTotal[] = [...totals.values()]
    .filter(
      (day) =>
        day.date.startsWith(month) &&
        (day.totalSeconds > 0 || day.sessionCount > 0),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const notes: DailyNote[] = noteResult.results.map((note) => ({
    date: note.study_date,
    text: note.note,
  }));
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
    notes,
  };
}
