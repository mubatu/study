import { endSession } from "../../_shared/auth";
import type { Env } from "../../_shared/env";
import { handleError, json } from "../../_shared/http";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const cookie = await endSession(context.env, context.request);
    return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
  } catch (error) {
    return handleError(error);
  }
};
