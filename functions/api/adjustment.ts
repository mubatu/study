import { MAX_DAILY_TOTAL_SECONDS } from "../../shared/adjustments";
import type {
  DailyTotal,
  StudyAdjustmentOperation,
} from "../../shared/contracts";
import { studyDayKeyForInstant } from "../../shared/studyTime";
import { buildDashboard } from "../_shared/dashboard";
import type { Env } from "../_shared/env";
import { handleError, HttpError, json, readJson } from "../_shared/http";
import {
  requireAdjustmentMinutes,
  requireAdjustmentOperation,
  requireUserId,
} from "../_shared/validation";

interface AdjustmentRequest {
  userId?: unknown;
  minutes?: unknown;
  operation?: unknown;
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  try {
    const body = await readJson<AdjustmentRequest>(context.request);
    const userId = requireUserId(body.userId);
    const minutes = requireAdjustmentMinutes(body.minutes);
    const operation: StudyAdjustmentOperation = requireAdjustmentOperation(
      body.operation,
    );
    const nowMs = Date.now();
    const studyDate = studyDayKeyForInstant(nowMs);
    const month = studyDate.slice(0, 7);

    const dashboard = await buildDashboard(
      context.env,
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

    await context.env.DB.prepare(
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
  } catch (error) {
    return handleError(error);
  }
};
