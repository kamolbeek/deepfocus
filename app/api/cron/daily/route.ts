import { docId, fsGet, fsList, fsNum, fsSessionsSince, type FsAny } from "@/lib/firebase-server";
import { safeEqual, tg } from "@/lib/telegram-server";

// Har kuni 20:00 (Toshkent) Telegram'ga ulangan foydalanuvchilarga bitta xabar:
// bugun fokus qilmagan bo'lsa — eslatma, qilgan bo'lsa — kunlik natija.
export const maxDuration = 60;

const TZ_OFFSET = 5 * 3600_000; // Toshkent UTC+5, yozgi vaqt yo'q
const dayOf = (ms: number) => Math.floor((ms + TZ_OFFSET) / 86_400_000);

function authorized(request: Request, url: URL) {
  const cron = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (cron && safeEqual(header, `Bearer ${cron}`)) return true;
  const key = process.env.TELEGRAM_SETUP_KEY;
  return !!key && safeEqual(url.searchParams.get("key") ?? "", key);
}

type Target = { tgId: string; uid: string };

async function targets(): Promise<Target[]> {
  const byTg = new Map<string, string>();
  // Faqat Telegram orqali kirganlar: uid = "tg:<id>"
  for (const d of await fsList("users", ["settings"])) {
    const uid = docId(d);
    if (uid.startsWith("tg:")) byTg.set(uid.slice(3), uid);
  }
  // Saytdagi hisobga ulanganlar ustun turadi
  for (const d of await fsList("tgLinks", ["uid"])) {
    const uid = d.fields?.uid?.stringValue;
    if (uid) byTg.set(docId(d), uid);
  }
  return [...byTg].map(([tgId, uid]) => ({ tgId, uid }));
}

function streakFrom(days: Set<number>, today: number) {
  let d = days.has(today) ? today : today - 1;
  let n = 0;
  while (days.has(d)) {
    n++;
    d--;
  }
  return n;
}

function message(todayCount: number, todayMin: number, streak: number, goal: number) {
  if (todayCount === 0) {
    return streak > 0
      ? `🔥 ${streak} kunlik streakingiz bor. Bugun uzilib qolmasin!\n\nBitta 25 daqiqalik sprint kifoya, kompanyoningiz kutib turibdi.`
      : `Bugun hali fokus qilmadingiz.\n\n25 daqiqa ajrating: telefonni chetga qo'ying, bitta ishni oxiriga yetkazing. Kompanyoningiz yoningizda bo'ladi.`;
  }
  const goalLine =
    todayCount >= goal ? "Kunlik maqsad bajarildi ✅" : `Kunlik maqsadgacha yana ${goal - todayCount} ta sprint qoldi.`;
  return `Bugungi natija: ${todayCount} ta sprint, ${todayMin} daqiqa chuqur ish.\n🔥 Streak: ${streak} kun\n\n${goalLine}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!authorized(request, url)) return new Response("forbidden", { status: 403 });
  const dry = url.searchParams.get("dry") === "1";
  const only = url.searchParams.get("only");

  const now = Date.now();
  const today = dayOf(now);
  const appUrl = new URL("/", request.url).toString();
  const report: { tgId: string; sent: boolean; skipped?: string; text?: string }[] = [];

  for (const t of await targets()) {
    if (only && t.tgId !== only) continue;
    try {
      const user = await fsGet(`users/${encodeURIComponent(t.uid)}`);
      const s = (user?.settings as FsAny | undefined)?.mapValue?.fields ?? {};
      if (s.reminders?.booleanValue === false) {
        report.push({ tgId: t.tgId, sent: false, skipped: "o'chirilgan" });
        continue;
      }
      const goal = fsNum(s.dailyGoal) || 4;
      const sessions = await fsSessionsSince(t.uid, now - 120 * 86_400_000);
      const days = new Set(sessions.map((x) => dayOf(x.at)));
      const todays = sessions.filter((x) => dayOf(x.at) === today);
      const text = message(
        todays.length,
        todays.reduce((a, x) => a + x.minutes, 0),
        streakFrom(days, today),
        goal,
      );
      if (dry) {
        report.push({ tgId: t.tgId, sent: false, text });
        continue;
      }
      const r = await tg("sendMessage", {
        chat_id: Number(t.tgId),
        text: `${text}\n\n— Eslatmalarni Profil → Sozlamalar bo'limida o'chirib qo'yishingiz mumkin.`,
        reply_markup: { inline_keyboard: [[{ text: "Fokusni boshlash", web_app: { url: appUrl } }]] },
      });
      report.push({ tgId: t.tgId, sent: r.ok, skipped: r.ok ? undefined : r.description });
    } catch (e) {
      report.push({ tgId: t.tgId, sent: false, skipped: (e as Error).message });
    }
  }
  return Response.json({ ok: true, count: report.length, report });
}
