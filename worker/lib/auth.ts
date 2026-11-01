import type { UserProfile } from "../../shared/contracts";
import type { Env } from "./env";

const SESSION_COOKIE = "study_session";
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export interface SessionUser extends UserProfile {
  isAdmin: boolean;
}

interface SessionUserRow {
  id: string;
  display_name: string;
  is_admin: number;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function readSessionToken(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;

  for (const part of header.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return value.join("=") || null;
  }
  return null;
}

function serializeSessionCookie(
  request: Request,
  token: string,
  maxAgeSeconds: number,
): string {
  // Plain-http local development (wrangler pages dev) cannot store Secure cookies in every browser.
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export async function createSession(
  env: Env,
  request: Request,
  userId: string,
  nowMs = Date.now(),
): Promise<string> {
  const token = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAtMs = nowMs + SESSION_TTL_MS;

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM auth_sessions WHERE user_id = ? AND expires_at_ms <= ?",
    ).bind(userId, nowMs),
    env.DB.prepare(
      `INSERT INTO auth_sessions
        (token_hash, user_id, created_at_ms, expires_at_ms)
       VALUES (?, ?, ?, ?)`,
    ).bind(await hashToken(token), userId, nowMs, expiresAtMs),
  ]);

  return serializeSessionCookie(request, token, SESSION_TTL_MS / 1000);
}

export async function getSessionUser(
  env: Env,
  request: Request,
  nowMs = Date.now(),
): Promise<SessionUser | null> {
  const token = readSessionToken(request);
  if (!token) return null;

  const user = await env.DB.prepare(
    `SELECT users.id, users.display_name, users.is_admin
       FROM auth_sessions
       INNER JOIN users ON users.id = auth_sessions.user_id
      WHERE auth_sessions.token_hash = ?
        AND auth_sessions.expires_at_ms > ?`,
  )
    .bind(await hashToken(token), nowMs)
    .first<SessionUserRow>();

  return user
    ? {
        id: user.id,
        displayName: user.display_name,
        isAdmin: user.is_admin === 1,
      }
    : null;
}

export async function endSession(env: Env, request: Request): Promise<string> {
  const token = readSessionToken(request);
  if (token) {
    await env.DB.prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await hashToken(token))
      .run();
  }
  return serializeSessionCookie(request, "", 0);
}
