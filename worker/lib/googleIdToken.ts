import { HttpError } from "./http";

const GOOGLE_CERTS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const GOOGLE_ISSUERS = new Set([
  "accounts.google.com",
  "https://accounts.google.com",
]);
const CLOCK_SKEW_SECONDS = 60;
const DEFAULT_KEY_CACHE_MS = 60 * 60 * 1000;

interface GoogleJwk extends JsonWebKey {
  kid?: string;
}

interface JwtHeader {
  alg?: unknown;
  kid?: unknown;
}

interface GoogleIdTokenPayload {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  email?: unknown;
  email_verified?: unknown;
  name?: unknown;
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  name: string;
}

let cachedKeys: { keys: GoogleJwk[]; expiresAtMs: number } | null = null;

async function getGoogleKeys(forceRefresh: boolean): Promise<GoogleJwk[]> {
  if (!forceRefresh && cachedKeys && cachedKeys.expiresAtMs > Date.now()) {
    return cachedKeys.keys;
  }

  const response = await fetch(GOOGLE_CERTS_URL);
  if (!response.ok) {
    throw new Error(`Google certificates request failed: ${response.status}`);
  }

  const body = (await response.json()) as { keys?: GoogleJwk[] };
  const maxAge = /max-age=(\d+)/.exec(
    response.headers.get("Cache-Control") ?? "",
  );
  cachedKeys = {
    keys: Array.isArray(body.keys) ? body.keys : [],
    expiresAtMs:
      Date.now() + (maxAge ? Number(maxAge[1]) * 1000 : DEFAULT_KEY_CACHE_MS),
  };
  return cachedKeys.keys;
}

function decodeBase64Url(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function decodeJsonPart<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(part))) as T;
}

function invalidToken(): HttpError {
  return new HttpError(401, "Google sign-in could not be verified. Try again.");
}

export async function verifyGoogleIdToken(
  credential: unknown,
  clientId: string,
  nowMs = Date.now(),
): Promise<GoogleIdentity> {
  if (typeof credential !== "string") throw invalidToken();

  const parts = credential.split(".");
  if (parts.length !== 3) throw invalidToken();
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: JwtHeader;
  let payload: GoogleIdTokenPayload;
  let signature: Uint8Array;
  try {
    header = decodeJsonPart<JwtHeader>(headerPart);
    payload = decodeJsonPart<GoogleIdTokenPayload>(payloadPart);
    signature = decodeBase64Url(signaturePart);
  } catch {
    throw invalidToken();
  }

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw invalidToken();
  }

  // Google rotates keys; refetch once when the token uses a key we have not seen.
  let jwk = (await getGoogleKeys(false)).find((key) => key.kid === header.kid);
  if (!jwk) {
    jwk = (await getGoogleKeys(true)).find((key) => key.kid === header.kid);
  }
  if (!jwk) throw invalidToken();

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) throw invalidToken();

  if (
    typeof payload.iss !== "string" ||
    !GOOGLE_ISSUERS.has(payload.iss) ||
    payload.aud !== clientId ||
    typeof payload.exp !== "number" ||
    payload.exp + CLOCK_SKEW_SECONDS < nowMs / 1000 ||
    typeof payload.sub !== "string" ||
    !payload.sub
  ) {
    throw invalidToken();
  }

  if (typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new HttpError(403, "Your Google account email must be verified.");
  }

  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : "",
  };
}
