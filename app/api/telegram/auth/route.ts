import { createCustomToken, firebaseAdminReady } from "@/lib/firebase-server";
import { verifyInitData } from "@/lib/telegram-server";

// Telegram ichida ochilganda: initData imzosini tekshirib, Firebase uchun kirish tokeni beramiz
export async function POST(request: Request) {
  const { initData } = (await request.json().catch(() => ({}))) as { initData?: string };
  const user = verifyInitData(initData ?? "");
  if (!user) return Response.json({ error: "invalid" }, { status: 401 });
  if (!firebaseAdminReady()) return Response.json({ error: "not-configured" }, { status: 503 });

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Telegram";
  const token = createCustomToken(`tg:${user.id}`, { tg: user.id });
  return Response.json({ token, name });
}
