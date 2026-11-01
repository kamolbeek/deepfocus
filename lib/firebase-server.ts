import "server-only";
import { createSign } from "node:crypto";

// Firebase Admin SDK o'rniga: maxsus kirish tokeni oddiy RS256 JWT,
// uni xizmat hisobi kaliti bilan o'zimiz imzolaymiz.
function creds() {
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  return clientEmail && privateKey ? { clientEmail, privateKey } : null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

function signJwt(payload: Record<string, unknown>, privateKey: string) {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${b64url(sig)}`;
}

export const firebaseAdminReady = () => creds() !== null;

// https://firebase.google.com/docs/auth/admin/create-custom-tokens#create_custom_tokens_using_a_third-party_jwt_library
export function createCustomToken(uid: string, claims: Record<string, unknown> = {}) {
  const c = creds();
  if (!c) throw new Error("not-configured");
  const now = Math.floor(Date.now() / 1000);
  return signJwt(
    {
      iss: c.clientEmail,
      sub: c.clientEmail,
      aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
      iat: now,
      exp: now + 3600,
      uid,
      claims,
    },
    c.privateKey,
  );
}

// Kalit haqiqatan ishlashini Google'dan access token so'rab tekshiramiz
export async function checkServiceAccount() {
  const c = creds();
  if (!c) return { ok: false, error: "not-configured" };
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    {
      iss: c.clientEmail,
      scope: "https://www.googleapis.com/auth/identitytoolkit",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 600,
    },
    c.privateKey,
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string; error_description?: string };
  return data.access_token ? { ok: true } : { ok: false, error: `${data.error}: ${data.error_description}` };
}
