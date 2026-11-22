import type { StudyState } from "../../shared/contracts";
import {
  cappedSessionEndMs,
  studyDayBounds,
  studyDayKeyForInstant,
} from "../../shared/studyTime";
import type { Env } from "./env";

export interface OpenStretch {
  runId: string;
  startedAtMs: number;
  carriedMs: number;
}

export interface TimerSnapshot {
  state: StudyState;
  activeSince: string | null;
  carriedSeconds: number;
  openStretch: OpenStretch | null;
  pausedRunId: string | null;
  pausedElapsedMs: number | null;
}

interface OpenStretchRow {
  run_id: string;
  started_at_ms: number;
  carried_ms: number | null;
}

interface PauseRow {
  paused_run_id: string | null;
  paused_elapsed_ms: number | null;
  paused_at_ms: number | null;
}

// Time the timer shows once the open stretch ends at endMs; each stretch counts
// for at most three hours, like every study session.
export function elapsedAfterStretchMs(stretch: OpenStretch, endMs: number): number {
  return (
    stretch.carriedMs +
    Math.max(0, cappedSessionEndMs(stretch.startedAtMs, endMs) - stretch.startedAtMs)
  );
}

// A pause lasts until Resume, Stop, or the 06:00 study-day reset, so a paused
// session never carries yesterday's time into today's timer.
function pauseIsCurrent(pause: PauseRow | null, nowMs: number): boolean {
  if (pause?.paused_elapsed_ms == null || pause.paused_at_ms == null) return false;
  return pause.paused_at_ms >= studyDayBounds(studyDayKeyForInstant(nowMs)).startMs;
}

export async function readTimer(
  env: Env,
  userId: string,
  nowMs: number,
): Promise<TimerSnapshot> {
  const [open, pause] = await Promise.all([
    env.DB.prepare(
      `SELECT COALESCE(run_id, id) AS run_id, started_at_ms, carried_ms
         FROM study_sessions
        WHERE user_id = ?
          AND ended_at_ms IS NULL
        LIMIT 1`,
    )
      .bind(userId)
      .first<OpenStretchRow>(),
    env.DB.prepare(
      `SELECT paused_run_id, paused_elapsed_ms, paused_at_ms
         FROM users
        WHERE id = ?`,
    )
      .bind(userId)
      .first<PauseRow>(),
  ]);

  if (open) {
    const openStretch = {
      runId: open.run_id,
      startedAtMs: open.started_at_ms,
      carriedMs: open.carried_ms ?? 0,
    };
    return {
      state: "studying",
      activeSince: new Date(open.started_at_ms).toISOString(),
      carriedSeconds: Math.floor(openStretch.carriedMs / 1000),
      openStretch,
      pausedRunId: null,
      pausedElapsedMs: null,
    };
  }

  if (pause && pauseIsCurrent(pause, nowMs)) {
    const pausedElapsedMs = pause.paused_elapsed_ms ?? 0;
    return {
      state: "paused",
      activeSince: null,
      carriedSeconds: Math.floor(pausedElapsedMs / 1000),
      openStretch: null,
      pausedRunId: pause.paused_run_id,
      pausedElapsedMs,
    };
  }

  return {
    state: "resting",
    activeSince: null,
    carriedSeconds: 0,
    openStretch: null,
    pausedRunId: null,
    pausedElapsedMs: null,
  };
}
