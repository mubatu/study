import { MAX_DAILY_TOTAL_SECONDS } from "../../shared/adjustments";
import type {
  DailyTotal,
  StudyAdjustmentOperation,
} from "../../shared/contracts";
import { studyDayKeyForInstant } from "../../shared/studyTime";
import type { SessionUser } from "../lib/auth";
import { buildDashboard } from "../lib/dashboard";
import type { Env } from "../lib/env";
import { HttpError, json, readJson } from "../lib/http";
import {
  requireAdjustmentMinutes,
  requireAdjustmentOperation,
  requireUserId,
} from "../lib/validation";
import { requireAdmin } from "./admin";

interface AdjustmentRequest {
  userId?: unknown;
  minutes?: unknown;
  operation?: unknown;
}

export async function putAdjustment(
  request: Request,
  env: Env,
  user: SessionUser,
): Promise<Response> {
  // Manual adjustments change leaderboard totals, so only admins may make them.
  requireAdmin(user);
  const body = await readJson<AdjustmentRequest>(request);
  const userId =
    body.userId === undefined ? user.id : requireUserId(body.userId);
  const minutes = requireAdjustmentMinutes(body.minutes);
  const operation: StudyAdjustmentOperation = requireAdjustmentOperation(
    body.operation,
  );
  const nowMs = Date.now();
  const studyDate = studyDayKeyForInstant(nowMs);
  const month = studyDate.slice(0, 7);

  const dashboard = await buildDashboard(
    env,
    userId,
    month,
    nowMs,
  );
  const seconds = minutes * 60;
  const direction = operation === "add" ? 1 : -1;
  const nextTotalSeconds = dashboard.currentDay.totalSeconds + direction * seconds;
  const nextSessionCount = dashboard.currentDay.sessionCount + direction;

  if (nextTotalSeconds < 0 || nextSessionCount < 0) {
    throw new HttpError(
      400,
      "There is not enough study time or session count to remove that amount.",
    );
  }

  if (nextTotalSeconds > MAX_DAILY_TOTAL_SECONDS) {
    throw new HttpError(400, "Today's total cannot exceed 24 hours.");
  }

  await env.DB.prepare(
    `INSERT INTO study_adjustments
      (id, user_id, study_date, delta_seconds, session_delta, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      userId,
      studyDate,
      direction * seconds,
      direction,
      nowMs,
    )
    .run();

  const response: DailyTotal = {
    date: studyDate,
    totalSeconds: nextTotalSeconds,
    sessionCount: nextSessionCount,
  };
  return json(response);
}
