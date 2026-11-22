import type {
  StateResponse,
  StudyState,
  UserProfile,
} from "../../shared/contracts";
import { MAX_SESSION_DURATION_MS } from "../../shared/studyTime";
import type { Env } from "../lib/env";
import { HttpError, json, readJson } from "../lib/http";
import { elapsedAfterStretchMs, readTimer } from "../lib/timer";

interface StateRequest {
  state?: unknown;
}

function requireState(input: unknown): StudyState {
  if (input !== "studying" && input !== "paused" && input !== "resting") {
    throw new HttpError(400, "State must be studying, paused or resting.");
  }
  return input;
}

const CLOSE_OPEN_STRETCH_SQL = `UPDATE study_sessions
    SET ended_at_ms = MIN(?, started_at_ms + ?)
  WHERE user_id = ?
    AND ended_at_ms IS NULL`;

const CLEAR_PAUSE_SQL = `UPDATE users
    SET paused_run_id = NULL, paused_elapsed_ms = NULL, paused_at_ms = NULL
  WHERE id = ?`;

// studying: Start (from resting) or Resume (from paused). A resumed stretch
// joins the paused session's run, so the session still counts once.
// paused: Pause, keeping the timer value. resting: Stop, ending the session.
// Requests that match the current state change nothing.
export async function putState(
  request: Request,
  env: Env,
  user: UserProfile,
): Promise<Response> {
  const body = await readJson<StateRequest>(request);
  const userId = user.id;
  const requestedState = requireState(body.state);
  const nowMs = Date.now();
  const current = await readTimer(env, userId, nowMs);
  const db = env.DB;

  if (requestedState === "studying" && current.state !== "studying") {
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO study_sessions
            (id, user_id, started_at_ms, ended_at_ms, created_at_ms, run_id, carried_ms)
           VALUES (?, ?, ?, NULL, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          userId,
          nowMs,
          nowMs,
          current.pausedRunId ?? crypto.randomUUID(),
          current.pausedRunId ? (current.pausedElapsedMs ?? 0) : 0,
        ),
      db.prepare(CLEAR_PAUSE_SQL).bind(userId),
    ]);
  } else if (requestedState === "paused" && current.openStretch) {
    await db.batch([
      db.prepare(CLOSE_OPEN_STRETCH_SQL).bind(nowMs, MAX_SESSION_DURATION_MS, userId),
      db
        .prepare(
          `UPDATE users
              SET paused_run_id = ?, paused_elapsed_ms = ?, paused_at_ms = ?
            WHERE id = ?`,
        )
        .bind(
          current.openStretch.runId,
          elapsedAfterStretchMs(current.openStretch, nowMs),
          nowMs,
          userId,
        ),
    ]);
  } else if (requestedState === "resting" && current.state !== "resting") {
    await db.batch([
      db.prepare(CLOSE_OPEN_STRETCH_SQL).bind(nowMs, MAX_SESSION_DURATION_MS, userId),
      db.prepare(CLEAR_PAUSE_SQL).bind(userId),
    ]);
  }

  const next = await readTimer(env, userId, nowMs);
  const response: StateResponse = {
    state: next.state,
    serverTime: new Date(nowMs).toISOString(),
    activeSince: next.activeSince,
    carriedSeconds: next.carriedSeconds,
  };

  return json(response);
}
