import type { AuthSessionResponse } from "../../../shared/contracts";
import { getSessionUser } from "../../_shared/auth";
import type { Env } from "../../_shared/env";
import { handleError, json } from "../../_shared/http";

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const response: AuthSessionResponse = {
      user: await getSessionUser(context.env, context.request),
      googleClientId: context.env.GOOGLE_CLIENT_ID || null,
    };
    return json(response);
  } catch (error) {
    return handleError(error);
  }
};
