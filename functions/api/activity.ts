import { buildMonthlyActivity } from "../_shared/activity";
import type { Env } from "../_shared/env";
import { handleError, json } from "../_shared/http";
import { requireMonth, requireUserId } from "../_shared/validation";

export const onRequestGet = async (context: {
  request: Request;
  env: Env;
}): Promise<Response> => {
  try {
    const url = new URL(context.request.url);
    const userId = requireUserId(url.searchParams.get("userId"));
    const month = requireMonth(url.searchParams.get("month"));

    return json(await buildMonthlyActivity(context.env, userId, month));
  } catch (error) {
    return handleError(error);
  }
};
