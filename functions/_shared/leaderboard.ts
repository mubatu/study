import type {
  LeaderboardPeriod,
  LeaderboardResponse,
} from "../../shared/contracts";
import {
  rankLeaderboardSessions,
  type LeaderboardAdjustmentRow,
  type LeaderboardSessionRow,
} from "../../shared/leaderboard";
import {
  addCalendarDays,
  monthBounds,
  studyDayBounds,
  studyDayKeyForInstant,
} from "../../shared/studyTime";
import type { Env } from "./env";
import { getUser } from "./dashboard";

export async function buildLeaderboard(
  env: Env,
  userId: string,
  period: LeaderboardPeriod,
  nowMs = Date.now(),
): Promise<LeaderboardResponse> {
  const currentDay = studyDayKeyForInstant(nowMs);
  const rangeStartMs =
    period === "today"
      ? studyDayBounds(currentDay).startMs
      : monthBounds(currentDay.slice(0, 7)).startMs;
  const rangeEndMs = nowMs;
  const rangeStartDate =
    period === "today" ? currentDay : `${currentDay.slice(0, 7)}-01`;
  const rangeEndDate =
    period === "today"
      ? addCalendarDays(currentDay, 1)
      : (() => {
          const [year, month] = currentDay.slice(0, 7).split("-").map(Number);
          const nextMonth = new Date(Date.UTC(year, month, 1));
          return `${nextMonth.getUTCFullYear()}-${(nextMonth.getUTCMonth() + 1)
            .toString()
            .padStart(2, "0")}-01`;
        })();

  const [, result, adjustmentResult] = await Promise.all([
    getUser(env, userId),
    env.DB.prepare(
      `SELECT
         sessions.user_id,
         users.display_name,
         sessions.started_at_ms,
         sessions.ended_at_ms
       FROM study_sessions AS sessions
       INNER JOIN users ON users.id = sessions.user_id
       WHERE sessions.started_at_ms < ?
         AND (sessions.ended_at_ms IS NULL OR sessions.ended_at_ms > ?)`,
    )
      .bind(rangeEndMs, rangeStartMs)
      .all<LeaderboardSessionRow>(),
    env.DB.prepare(
      `SELECT
         adjustments.user_id,
         users.display_name,
         SUM(adjustments.delta_seconds) AS delta_seconds
       FROM study_adjustments AS adjustments
       INNER JOIN users ON users.id = adjustments.user_id
       WHERE adjustments.study_date >= ?
         AND adjustments.study_date < ?
       GROUP BY adjustments.user_id, users.display_name`,
    )
      .bind(rangeStartDate, rangeEndDate)
      .all<LeaderboardAdjustmentRow>(),
  ]);

  const ranked = rankLeaderboardSessions(
    result.results,
    rangeStartMs,
    rangeEndMs,
    adjustmentResult.results,
  );

  return {
    serverTime: new Date(nowMs).toISOString(),
    period,
    periodStart: new Date(rangeStartMs).toISOString(),
    periodEnd: new Date(rangeEndMs).toISOString(),
    entries: ranked.slice(0, 20),
    currentUser: ranked.find((entry) => entry.user.id === userId) ?? null,
  };
}
