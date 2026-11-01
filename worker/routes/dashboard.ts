import type { UserProfile } from "../../shared/contracts";
import { buildDashboard } from "../lib/dashboard";
import type { Env } from "../lib/env";
import { json } from "../lib/http";
import { requireMonth } from "../lib/validation";

export async function getDashboard(
  request: Request,
  env: Env,
  user: UserProfile,
): Promise<Response> {
  const url = new URL(request.url);
  const month = requireMonth(url.searchParams.get("month"));

  return json(await buildDashboard(env, user.id, month));
}
