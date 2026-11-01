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

// Xizmat hisobi bilan Google access token olish (bir soatgacha keshlaymiz)
const tokenCache = new Map<string, { token: string; exp: number }>();
export async function accessToken(scope: string) {
  const hit = tokenCache.get(scope);
  if (hit && hit.exp > Date.now() + 60_000) return hit.token;
  const c = creds();
  if (!c) throw new Error("not-configured");
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { iss: c.clientEmail, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 },
    c.privateKey,
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const data = (await res.json()) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!data.access_token) throw new Error(`${data.error}: ${data.error_description}`);
  tokenCache.set(scope, { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 });
  return data.access_token;
}

// Kalit haqiqatan ishlashini tekshirish
export async function checkServiceAccount() {
  if (!creds()) return { ok: false, error: "not-configured" };
  try {
    await accessToken("https://www.googleapis.com/auth/datastore");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ---- Firestore REST (server huquqi bilan, qoidalarni chetlab o'tadi)
type FsValue = { stringValue?: string; integerValue?: string; booleanValue?: boolean; nullValue?: null };
const fsBase = () =>
  `https://firestore.googleapis.com/v1/projects/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const fsHeaders = async () => ({
  authorization: `Bearer ${await accessToken("https://www.googleapis.com/auth/datastore")}`,
  "content-type": "application/json",
});

export async function fsGet(path: string): Promise<Record<string, FsValue> | null> {
  const res = await fetch(`${fsBase()}/${path}`, { headers: await fsHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`firestore get ${res.status}`);
  return ((await res.json()) as { fields?: Record<string, FsValue> }).fields ?? {};
}

// Faqat berilgan maydonlarni yangilaydi (qolganlari o'zgarmaydi)
export async function fsPatch(path: string, fields: Record<string, FsValue>) {
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  const res = await fetch(`${fsBase()}/${path}?${mask}`, {
    method: "PATCH",
    headers: await fsHeaders(),
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`firestore patch ${res.status}`);
}

export async function fsDelete(path: string) {
  const res = await fetch(`${fsBase()}/${path}`, { method: "DELETE", headers: await fsHeaders() });
  if (!res.ok && res.status !== 404) throw new Error(`firestore delete ${res.status}`);
}
