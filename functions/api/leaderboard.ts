import { buildLeaderboard } from "../_shared/leaderboard";
import type { AuthData, Env } from "../_shared/env";
import { handleError, json } from "../_shared/http";
import { requireLeaderboardPeriod } from "../_shared/validation";

export const onRequestGet: PagesFunction<Env, string, AuthData> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const userId = context.data.user.id;
    const period = requireLeaderboardPeriod(url.searchParams.get("period"));

    return json(await buildLeaderboard(context.env, userId, period));
  } catch (error) {
    return handleError(error);
  }
};
