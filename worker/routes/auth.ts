import type {
  AuthSessionResponse,
  GoogleSignInResponse,
  UserProfile,
} from "../../shared/contracts";
import { createSession, endSession, getSessionUser } from "../lib/auth";
import type { Env } from "../lib/env";
import { verifyGoogleIdToken } from "../lib/googleIdToken";
import { HttpError, json, readJson } from "../lib/http";
import { normalizeProfileName } from "../lib/validation";

interface GoogleSignInBody {
  credential?: unknown;
  profile?: { mode?: unknown; name?: unknown };
}

interface UserRow {
  id: string;
  display_name: string;
  is_admin: number;
}

function toProfile(row: UserRow): UserProfile {
  return { id: row.id, displayName: row.display_name };
}

async function findLinkedUser(
  env: Env,
  googleSub: string,
): Promise<UserRow | null> {
  return env.DB.prepare(
    "SELECT id, display_name, is_admin FROM users WHERE google_sub = ?",
  )
    .bind(googleSub)
    .first<UserRow>();
}

export async function postGoogleSignIn(
  request: Request,
  env: Env,
): Promise<Response> {
  const clientId = env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new HttpError(503, "Google sign-in is not configured.");
  }

  const body = await readJson<GoogleSignInBody>(request);
  const identity = await verifyGoogleIdToken(body.credential, clientId);
  const { DB } = env;

  let user = await findLinkedUser(env, identity.sub);

  if (!user) {
    // An administrator can pre-link an existing name profile by setting its email.
    await DB.prepare(
      `UPDATE users
          SET google_sub = ?
        WHERE email = ?
          AND google_sub IS NULL
          AND id = (
            SELECT id FROM users
             WHERE email = ? AND google_sub IS NULL
             LIMIT 1
          )`,
    )
      .bind(identity.sub, identity.email, identity.email)
      .run();
    user = await findLinkedUser(env, identity.sub);
  }

  if (!user) {
    const mode = body.profile?.mode;

    if (mode === undefined) {
      const response: GoogleSignInResponse = {
        status: "needs_profile",
        suggestedName: Array.from(identity.name.trim()).slice(0, 40).join(""),
      };
      return json(response);
    }

    const normalized = normalizeProfileName(body.profile?.name);

    if (mode === "create") {
      await DB.prepare(
        `INSERT OR IGNORE INTO users
          (id, name_key, display_name, created_at_ms, google_sub, email)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          crypto.randomUUID(),
          `google:${identity.sub}`,
          normalized.displayName,
          Date.now(),
          identity.sub,
          identity.email,
        )
        .run();
    } else if (mode === "claim") {
      const result = await DB.prepare(
        `UPDATE users
            SET google_sub = ?, email = ?
          WHERE name_key = ?
            AND google_sub IS NULL`,
      )
        .bind(identity.sub, identity.email, normalized.nameKey)
        .run();

      if (!result.meta.changes) {
        throw new HttpError(
          404,
          "No unlinked profile uses that name. Check the spelling or create a new profile.",
        );
      }
    } else {
      throw new HttpError(400, "Profile mode must be create or claim.");
    }

    user = await findLinkedUser(env, identity.sub);
    if (!user) throw new Error("Profile was not available after sign-in.");
  } else {
    await DB.prepare("UPDATE users SET email = ? WHERE id = ?")
      .bind(identity.email, user.id)
      .run();
  }

  const cookie = await createSession(env, request, user.id);
  const response: GoogleSignInResponse = {
    status: "signed_in",
    user: toProfile(user),
    isAdmin: user.is_admin === 1,
  };
  return json(response, { headers: { "Set-Cookie": cookie } });
}

export async function getAuthSession(
  request: Request,
  env: Env,
): Promise<Response> {
  const user = await getSessionUser(env, request);
  const response: AuthSessionResponse = {
    user: user ? { id: user.id, displayName: user.displayName } : null,
    isAdmin: user?.isAdmin ?? false,
    googleClientId: env.GOOGLE_CLIENT_ID || null,
  };
  return json(response);
}

export async function postLogout(
  request: Request,
  env: Env,
): Promise<Response> {
  const cookie = await endSession(env, request);
  return json({ ok: true }, { headers: { "Set-Cookie": cookie } });
}
