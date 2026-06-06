import type { Env } from "../_shared/env";
import { buildDashboard } from "../_shared/dashboard";
import { handleError, json } from "../_shared/http";
import { requireMonth, requireUserId } from "../_shared/validation";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const userId = requireUserId(url.searchParams.get("userId"));
    const month = requireMonth(url.searchParams.get("month"));

    return json(await buildDashboard(context.env, userId, month));
  } catch (error) {
    return handleError(error);
  }
};
