import type { AuthData, Env } from "../_shared/env";
import { buildDashboard } from "../_shared/dashboard";
import { handleError, json } from "../_shared/http";
import { requireMonth } from "../_shared/validation";

export const onRequestGet: PagesFunction<Env, string, AuthData> = async (context) => {
  try {
    const url = new URL(context.request.url);
    const userId = context.data.user.id;
    const month = requireMonth(url.searchParams.get("month"));

    return json(await buildDashboard(context.env, userId, month));
  } catch (error) {
    return handleError(error);
  }
};
