import type {
  LeaderboardPeriod,
  LeaderboardResponse,
} from "../../shared/contracts";
import {
  rankLeaderboardSessions,
  type LeaderboardSessionRow,
} from "../../shared/leaderboard";
import {
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

  const [, result] = await Promise.all([
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
  ]);

  const ranked = rankLeaderboardSessions(
    result.results,
    rangeStartMs,
    rangeEndMs,
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
