import type {
  DashboardResponse,
  DailyNote,
  DailyTotal,
  StudyDayAdjustment,
  StudySessionSpan,
  UserProfile,
} from "../../shared/contracts";
import {
  aggregateSessions,
  MAX_SESSION_DURATION_MS,
  monthBounds,
  splitSessionsByStudyDay,
  studyDayBounds,
  studyDayKeyForInstant,
} from "../../shared/studyTime";
import type { Env } from "./env";
import { HttpError } from "./http";
import { readTimer } from "./timer";

interface UserRow {
  id: string;
  display_name: string;
}

interface SessionRow {
  id: string;
  run_id?: string | null;
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

  const [result, noteResult, adjustmentResult, timer] = await Promise.all([
    env.DB.prepare(
      `SELECT id, COALESCE(run_id, id) AS run_id, started_at_ms, ended_at_ms
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
    readTimer(env, userId, nowMs),
  ]);

  const sessions = result.results.map((session) => ({
    id: session.id,
    runId: session.run_id ?? session.id,
    startMs: session.started_at_ms,
    endMs: Math.min(session.ended_at_ms ?? nowMs, nowMs),
  }));
  const totals = aggregateSessions(sessions);
  const openSessionIds = new Set(
    result.results
      .filter(
        (session) =>
          session.ended_at_ms === null &&
          nowMs < session.started_at_ms + MAX_SESSION_DURATION_MS,
      )
      .map((session) => session.id),
  );
  // One row per session and day: its stretches merge into a single span.
  const spansByRunAndDay = new Map<
    string,
    {
      date: string;
      runId: string;
      startMs: number;
      endMs: number;
      studiedMs: number;
      stretches: number;
      inProgress: boolean;
    }
  >();
  for (const segment of splitSessionsByStudyDay(sessions)) {
    if (!segment.date.startsWith(month)) continue;
    const key = `${segment.runId}|${segment.date}`;
    const span = spansByRunAndDay.get(key) ?? {
      date: segment.date,
      runId: segment.runId,
      startMs: segment.startMs,
      endMs: segment.endMs,
      studiedMs: 0,
      stretches: 0,
      inProgress: false,
    };
    span.startMs = Math.min(span.startMs, segment.startMs);
    span.endMs = Math.max(span.endMs, segment.endMs);
    span.studiedMs += segment.endMs - segment.startMs;
    span.stretches += 1;
    span.inProgress ||=
      openSessionIds.has(segment.id) && segment.endMs === nowMs;
    spansByRunAndDay.set(key, span);
  }
  const sessionSpans: StudySessionSpan[] = [...spansByRunAndDay.values()]
    .sort((a, b) => a.startMs - b.startMs)
    .map((span) => ({
      date: span.date,
      startedAt: new Date(span.startMs).toISOString(),
      endedAt: new Date(span.endMs).toISOString(),
      studiedSeconds: Math.round(span.studiedMs / 1000),
      breakCount: span.stretches - 1,
      inProgress: span.inProgress,
      paused: timer.state === "paused" && span.runId === timer.pausedRunId,
    }));
  const adjustments: StudyDayAdjustment[] = adjustmentResult.results
    .filter(
      (adjustment) =>
        adjustment.study_date.startsWith(month) && adjustment.delta_seconds !== 0,
    )
    .map((adjustment) => ({
      date: adjustment.study_date,
      deltaSeconds: adjustment.delta_seconds,
    }));
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
  const currentDay = totals.get(currentDayKey) ?? {
    date: currentDayKey,
    totalSeconds: 0,
    sessionCount: 0,
  };

  return {
    user,
    serverTime: new Date(nowMs).toISOString(),
    state: timer.state,
    activeSince: timer.activeSince,
    carriedSeconds: timer.carriedSeconds,
    currentDay,
    month,
    days,
    sessions: sessionSpans,
    adjustments,
    notes,
  };
}
