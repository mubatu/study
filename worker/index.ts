import type { UserProfile } from "../shared/contracts";
import { getSessionUser } from "./lib/auth";
import type { Env } from "./lib/env";
import { handleError, HttpError, json } from "./lib/http";
import { getActivity } from "./routes/activity";
import { putAdjustment } from "./routes/adjustment";
import { getAuthSession, postGoogleSignIn, postLogout } from "./routes/auth";
import { getDashboard } from "./routes/dashboard";
import { getLeaderboard } from "./routes/leaderboard";
import { putNote } from "./routes/note";
import { putState } from "./routes/state";

type PublicHandler = (request: Request, env: Env) => Promise<Response>;
type SignedInHandler = (
  request: Request,
  env: Env,
  user: UserProfile,
) => Promise<Response>;

type Route = { method: string; path: string } & (
  | { public: true; handler: PublicHandler }
  | { public?: false; handler: SignedInHandler }
);

const ROUTES: Route[] = [
  { method: "GET", path: "/api/auth/session", public: true, handler: getAuthSession },
  { method: "POST", path: "/api/auth/google", public: true, handler: postGoogleSignIn },
  { method: "POST", path: "/api/auth/logout", public: true, handler: postLogout },
  { method: "GET", path: "/api/dashboard", handler: getDashboard },
  { method: "GET", path: "/api/leaderboard", handler: getLeaderboard },
  { method: "GET", path: "/api/activity", handler: getActivity },
  { method: "PUT", path: "/api/state", handler: putState },
  { method: "PUT", path: "/api/note", handler: putNote },
  { method: "PUT", path: "/api/adjustment", handler: putAdjustment },
];

export async function handleApiRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const method = request.method;

    // The session cookie is SameSite=Lax; also reject cross-site writes outright.
    if (method !== "GET" && method !== "HEAD") {
      const origin = request.headers.get("Origin");
      if (origin && origin !== url.origin) {
        throw new HttpError(403, "Cross-site requests are not allowed.");
      }
    }

    const pathRoutes = ROUTES.filter((route) => route.path === url.pathname);
    if (pathRoutes.length === 0) throw new HttpError(404, "Not found.");

    const route = pathRoutes.find((candidate) => candidate.method === method);
    if (!route) {
      return json(
        { error: "Method not allowed." },
        {
          status: 405,
          headers: { Allow: pathRoutes.map((candidate) => candidate.method).join(", ") },
        },
      );
    }

    if (route.public) return await route.handler(request, env);

    const user = await getSessionUser(env, request);
    if (!user) throw new HttpError(401, "Sign in to continue.");
    return await route.handler(request, env, user);
  } catch (error) {
    return handleError(error);
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // wrangler.toml routes /api/* here first; everything else is a static asset.
    const { pathname } = new URL(request.url);
    return pathname.startsWith("/api/")
      ? handleApiRequest(request, env)
      : env.ASSETS.fetch(request);
  },
};
