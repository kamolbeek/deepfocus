import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { verifyInitData } from "@/lib/telegram-server";

function adminAuth() {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel'da kalit bir qatorda saqlanadi: "\n" belgilarini haqiqiy qatorga aylantiramiz
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!projectId || !clientEmail || !privateKey) return null;
  const app = getApps()[0] ?? initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return getAuth(app);
}

// Telegram ichida ochilganda: initData imzosini tekshirib, Firebase uchun kirish tokeni beramiz
export async function POST(request: Request) {
  const { initData } = (await request.json().catch(() => ({}))) as { initData?: string };
  const user = verifyInitData(initData ?? "");
  if (!user) return Response.json({ error: "invalid" }, { status: 401 });

  const auth = adminAuth();
  if (!auth) return Response.json({ error: "not-configured" }, { status: 503 });

  const uid = `tg:${user.id}`;
  const displayName = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Telegram";
  try {
    await auth.updateUser(uid, { displayName });
  } catch {
    await auth.createUser({ uid, displayName });
  }
  const token = await auth.createCustomToken(uid, { tg: user.id, username: user.username ?? null });
  return Response.json({ token });
}
