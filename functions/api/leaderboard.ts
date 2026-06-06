import { buildLeaderboard } from "../_shared/leaderboard";
import type { Env } from "../_shared/env";
import { handleError, json } from "../_shared/http";
import {
  requireLeaderboardPeriod,
  requireUserId,
} from "../_shared/validation";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const userId = requireUserId(url.searchParams.get("userId"));
    const period = requireLeaderboardPeriod(url.searchParams.get("period"));

    return json(await buildLeaderboard(context.env, userId, period));
  } catch (error) {
    return handleError(error);
  }
};
