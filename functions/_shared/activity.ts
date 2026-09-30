import type { MonthlyActivityResponse } from "../../shared/contracts";
import { aggregateSessions, monthBounds } from "../../shared/studyTime";
import { getUser } from "./dashboard";
import type { Env } from "./env";

interface SessionRow {
  id: string;
  started_at_ms: number;
  ended_at_ms: number | null;
}

interface AdjustmentRow {
  study_date: string;
  delta_seconds: number;
}

export async function buildMonthlyActivity(
  env: Env,
  userId: string,
  month: string,
  nowMs = Date.now(),
): Promise<MonthlyActivityResponse> {
  const user = await getUser(env, userId);
  const { startMs, endMs } = monthBounds(month);
  // Read only study time. Notes are never queried or included in this response.
  const [sessions, adjustments] = await Promise.all([
    env.DB.prepare(
      `SELECT id, started_at_ms, ended_at_ms
         FROM study_sessions
        WHERE user_id = ?
          AND started_at_ms < ?
          AND (ended_at_ms IS NULL OR ended_at_ms > ?)
        ORDER BY started_at_ms`,
    )
      .bind(userId, Math.min(endMs, nowMs), startMs)
      .all<SessionRow>(),
    env.DB.prepare(
      `SELECT study_date, SUM(delta_seconds) AS delta_seconds
         FROM study_adjustments
        WHERE user_id = ? AND study_date LIKE ?
        GROUP BY study_date`,
    )
      .bind(userId, `${month}-%`)
      .all<AdjustmentRow>(),
  ]);

  const totals = aggregateSessions(
    sessions.results.map((session) => ({
      id: session.id,
      startMs: session.started_at_ms,
      endMs: Math.min(session.ended_at_ms ?? nowMs, nowMs),
    })),
  );
  const hours = new Map(
    [...totals.values()]
      .filter((day) => day.date.startsWith(`${month}-`))
      .map((day) => [day.date, day.totalSeconds]),
  );
  for (const adjustment of adjustments.results) {
    hours.set(
      adjustment.study_date,
      Math.max(
        0,
        (hours.get(adjustment.study_date) ?? 0) + adjustment.delta_seconds,
      ),
    );
  }

  return {
    user,
    serverTime: new Date(nowMs).toISOString(),
    month,
    days: [...hours.entries()]
      .filter(([, totalSeconds]) => totalSeconds > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, totalSeconds]) => ({ date, totalSeconds })),
  };
}
