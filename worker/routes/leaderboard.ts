import type { UserProfile } from "../../shared/contracts";
import type { Env } from "../lib/env";
import { json } from "../lib/http";
import { buildLeaderboard } from "../lib/leaderboard";
import { requireLeaderboardPeriod } from "../lib/validation";

export async function getLeaderboard(
  request: Request,
  env: Env,
  user: UserProfile,
): Promise<Response> {
  const url = new URL(request.url);
  const period = requireLeaderboardPeriod(url.searchParams.get("period"));

  return json(await buildLeaderboard(env, user.id, period));
}
