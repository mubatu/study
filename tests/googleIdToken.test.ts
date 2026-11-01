// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { verifyGoogleIdToken } from "../worker/lib/googleIdToken";

const CLIENT_ID = "client-id.apps.googleusercontent.com";
const NOW_MS = Date.parse("2026-06-06T10:00:00.000Z");
const KEY_ID = "test-key";

let privateKey: CryptoKey;
let publicJwk: JsonWebKey;

function base64Url(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signToken(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: KEY_ID },
): Promise<string> {
  const signingInput = `${base64Url(JSON.stringify(header))}.${base64Url(
    JSON.stringify(payload),
  )}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
}

const validPayload = {
  iss: "https://accounts.google.com",
  aud: CLIENT_ID,
  sub: "1234567890",
  exp: NOW_MS / 1000 + 3600,
  email: "Batu@Example.com",
  email_verified: true,
  name: "Batu",
};

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  privateKey = pair.privateKey;
  publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});

function stubGoogleCerts() {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify({ keys: [{ ...publicJwk, kid: KEY_ID }] }), {
      headers: { "Cache-Control": "public, max-age=3600" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyGoogleIdToken", () => {
  it("accepts a correctly signed token for this client", async () => {
    stubGoogleCerts();
    const token = await signToken(validPayload);

    await expect(
      verifyGoogleIdToken(token, CLIENT_ID, NOW_MS),
    ).resolves.toEqual({
      sub: "1234567890",
      email: "batu@example.com",
      name: "Batu",
    });
  });

  it("rejects tokens issued for another client", async () => {
    stubGoogleCerts();
    const token = await signToken({ ...validPayload, aud: "other-client" });

    await expect(
      verifyGoogleIdToken(token, CLIENT_ID, NOW_MS),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects expired tokens", async () => {
    stubGoogleCerts();
    const token = await signToken({
      ...validPayload,
      exp: NOW_MS / 1000 - 120,
    });

    await expect(
      verifyGoogleIdToken(token, CLIENT_ID, NOW_MS),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects tampered payloads", async () => {
    stubGoogleCerts();
    const [header, , signature] = (await signToken(validPayload)).split(".");
    const forgedPayload = base64Url(
      JSON.stringify({ ...validPayload, sub: "someone-else" }),
    );

    await expect(
      verifyGoogleIdToken(
        `${header}.${forgedPayload}.${signature}`,
        CLIENT_ID,
        NOW_MS,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects unknown signing keys after refreshing Google's keys", async () => {
    const fetchMock = stubGoogleCerts();
    const token = await signToken(validPayload, {
      alg: "RS256",
      kid: "rotated-away",
    });

    await expect(
      verifyGoogleIdToken(token, CLIENT_ID, NOW_MS),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("requires a verified email address", async () => {
    stubGoogleCerts();
    const token = await signToken({ ...validPayload, email_verified: false });

    await expect(
      verifyGoogleIdToken(token, CLIENT_ID, NOW_MS),
    ).rejects.toMatchObject({ status: 403 });
  });
});
