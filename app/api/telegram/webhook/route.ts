import { fsDelete, fsGet, fsPatch } from "@/lib/firebase-server";
import { safeEqual, tg } from "@/lib/telegram-server";

type Update = {
  message?: { chat: { id: number }; from?: { id: number; first_name?: string; username?: string }; text?: string };
};

// Saytdan kelgan bir martalik kod bilan Telegram hisobini Google hisobiga bog'lash
async function linkAccount(code: string, from: { id: number; username?: string }) {
  if (!/^[A-Za-z0-9]{16,40}$/.test(code)) return false;
  const doc = await fsGet(`linkCodes/${code}`);
  const uid = doc?.uid?.stringValue;
  const exp = Number(doc?.exp?.integerValue ?? 0);
  if (!uid || exp < Date.now()) return false;
  await fsPatch(`tgLinks/${from.id}`, { uid: { stringValue: uid }, linkedAt: { integerValue: String(Date.now()) } });
  await fsPatch(`users/${uid}`, {
    telegramId: { integerValue: String(from.id) },
    telegramUsername: from.username ? { stringValue: from.username } : { nullValue: null },
  });
  await fsDelete(`linkCodes/${code}`);
  return true;
}

export async function POST(request: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
  const got = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || !safeEqual(got, secret)) return new Response("forbidden", { status: 403 });

  const update = (await request.json().catch(() => ({}))) as Update;
  const msg = update.message;
  if (!msg?.text) return Response.json({ ok: true });

  const appUrl = new URL("/", request.url).toString();
  const name = msg.from?.first_name ? `, ${msg.from.first_name}` : "";
  const openButton = { reply_markup: { inline_keyboard: [[{ text: "DeepFokus'ni ochish", web_app: { url: appUrl } }]] } };

  const linkCode = msg.text.match(/^\/start link_(\S+)/)?.[1];
  if (linkCode && msg.from) {
    let ok = false;
    try {
      ok = await linkAccount(linkCode, msg.from);
    } catch (e) {
      console.error("[DeepFokus] hisobni ulashda xato", e);
    }
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: ok
        ? "Hisoblar ulandi ✅\n\nEndi Telegram'da ham saytdagi vazifa va sprintlaringiz chiqadi. Ilovani oching:"
        : "Havola eskirgan yoki noto'g'ri. Saytda Profil bo'limidan «Telegram'ni ulash» tugmasini qayta bosing.",
      ...openButton,
    });
    return Response.json({ ok: true });
  }

  if (msg.text.startsWith("/start") || msg.text.startsWith("/open")) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text:
        `Salom${name}! Men DeepFokus kompanyoniman.\n\n` +
        `25 daqiqa chuqur ishlaymiz, keyin qisqa tanaffus qilamiz. Vazifalaringni rejalashtir, sprintlarni sana va har kuni streakni ushlab tur.\n\n` +
        `Boshlash uchun pastdagi tugmani bos.`,
      ...openButton,
    });
  } else if (msg.text.startsWith("/help")) {
    await tg("sendMessage", {
      chat_id: msg.chat.id,
      text: "Ilovani ochish uchun pastdagi tugmani yoki chap pastdagi «Ochish» menyusini bosing.",
      ...openButton,
    });
  } else {
    await tg("sendMessage", { chat_id: msg.chat.id, text: "Fokus qilishga tayyormisan? Ilovani och:", ...openButton });
  }
  return Response.json({ ok: true });
}
