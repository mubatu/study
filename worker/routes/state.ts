import type {
  StateResponse,
  StudyState,
  UserProfile,
} from "../../shared/contracts";
import { MAX_SESSION_DURATION_MS } from "../../shared/studyTime";
import type { Env } from "../lib/env";
import { HttpError, json, readJson } from "../lib/http";

interface StateRequest {
  state?: unknown;
}

interface OpenSessionRow {
  started_at_ms: number;
}

function requireState(input: unknown): StudyState {
  if (input !== "studying" && input !== "resting") {
    throw new HttpError(400, "State must be studying or resting.");
  }
  return input;
}

export async function putState(
  request: Request,
  env: Env,
  user: UserProfile,
): Promise<Response> {
  const body = await readJson<StateRequest>(request);
  const userId = user.id;
  const requestedState = requireState(body.state);
  const nowMs = Date.now();

  if (requestedState === "studying") {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO study_sessions
        (id, user_id, started_at_ms, ended_at_ms, created_at_ms)
       VALUES (?, ?, ?, NULL, ?)`,
    )
      .bind(crypto.randomUUID(), userId, nowMs, nowMs)
      .run();
  } else {
    await env.DB.prepare(
      `UPDATE study_sessions
          SET ended_at_ms = MIN(?, started_at_ms + ?)
        WHERE user_id = ?
          AND ended_at_ms IS NULL`,
    )
      .bind(nowMs, MAX_SESSION_DURATION_MS, userId)
      .run();
  }

  const openSession = await env.DB.prepare(
    `SELECT started_at_ms
       FROM study_sessions
      WHERE user_id = ?
        AND ended_at_ms IS NULL
      LIMIT 1`,
  )
    .bind(userId)
    .first<OpenSessionRow>();

  const response: StateResponse = {
    state: openSession ? "studying" : "resting",
    serverTime: new Date(nowMs).toISOString(),
    activeSince: openSession
      ? new Date(openSession.started_at_ms).toISOString()
      : null,
  };

  return json(response);
}
