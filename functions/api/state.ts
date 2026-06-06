import type { StateResponse, StudyState } from "../../shared/contracts";
import { getUser } from "../_shared/dashboard";
import type { Env } from "../_shared/env";
import { handleError, HttpError, json, readJson } from "../_shared/http";
import { requireUserId } from "../_shared/validation";

interface StateRequest {
  userId?: unknown;
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

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const body = await readJson<StateRequest>(context.request);
    const userId = requireUserId(body.userId);
    const requestedState = requireState(body.state);
    const nowMs = Date.now();

    await getUser(context.env, userId);

    if (requestedState === "studying") {
      await context.env.DB.prepare(
        `INSERT OR IGNORE INTO study_sessions
          (id, user_id, started_at_ms, ended_at_ms, created_at_ms)
         VALUES (?, ?, ?, NULL, ?)`,
      )
        .bind(crypto.randomUUID(), userId, nowMs, nowMs)
        .run();
    } else {
      await context.env.DB.prepare(
        `UPDATE study_sessions
            SET ended_at_ms = ?
          WHERE user_id = ?
            AND ended_at_ms IS NULL`,
      )
        .bind(nowMs, userId)
        .run();
    }

    const openSession = await context.env.DB.prepare(
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
  } catch (error) {
    return handleError(error);
  }
};
