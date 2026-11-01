import { getSessionUser } from "../_shared/auth";
import type { AuthData, Env } from "../_shared/env";
import { handleError, HttpError } from "../_shared/http";

const PUBLIC_PREFIX = "/api/auth/";

export const onRequest: PagesFunction<Env, string, AuthData> = async (
  context,
) => {
  try {
    const url = new URL(context.request.url);
    const method = context.request.method;

    // The session cookie is SameSite=Lax; also reject cross-site writes outright.
    if (method !== "GET" && method !== "HEAD") {
      const origin = context.request.headers.get("Origin");
      if (origin && origin !== url.origin) {
        throw new HttpError(403, "Cross-site requests are not allowed.");
      }
    }

    if (url.pathname.startsWith(PUBLIC_PREFIX)) return context.next();

    const user = await getSessionUser(context.env, context.request);
    if (!user) throw new HttpError(401, "Sign in to continue.");

    context.data.user = user;
    return context.next();
  } catch (error) {
    return handleError(error);
  }
};
