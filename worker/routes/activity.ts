import { buildMonthlyActivity } from "../lib/activity";
import type { Env } from "../lib/env";
import { json } from "../lib/http";
import { requireMonth, requireUserId } from "../lib/validation";

// Any signed-in user may view another profile's monthly hours, so the profile
// comes from the query string rather than the session.
export async function getActivity(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);
  const userId = requireUserId(url.searchParams.get("userId"));
  const month = requireMonth(url.searchParams.get("month"));

  return json(await buildMonthlyActivity(env, userId, month));
}
