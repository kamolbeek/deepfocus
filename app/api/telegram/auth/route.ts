import { createCustomToken, firebaseAdminReady, fsGet } from "@/lib/firebase-server";
import { verifyInitData } from "@/lib/telegram-server";

// Telegram ichida ochilganda: initData imzosini tekshirib, Firebase uchun kirish tokeni beramiz.
// Agar Telegram hisobi saytdagi hisobga ulangan bo'lsa, o'sha hisobga kiritamiz.
export async function POST(request: Request) {
  const { initData } = (await request.json().catch(() => ({}))) as { initData?: string };
  const user = verifyInitData(initData ?? "");
  if (!user) return Response.json({ error: "invalid" }, { status: 401 });
  if (!firebaseAdminReady()) return Response.json({ error: "not-configured" }, { status: 503 });

  let uid = `tg:${user.id}`;
  try {
    const link = await fsGet(`tgLinks/${user.id}`);
    if (link?.uid?.stringValue) uid = link.uid.stringValue;
  } catch (e) {
    console.error("[DeepFokus] tgLinks o'qishda xato", e);
  }
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || "Telegram";
  const token = createCustomToken(uid, { tg: user.id });
  return Response.json({ token, name, uid, linked: !uid.startsWith("tg:") });
}
