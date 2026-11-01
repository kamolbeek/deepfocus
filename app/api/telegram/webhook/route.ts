import { safeEqual, tg } from "@/lib/telegram-server";

type Update = {
  message?: { chat: { id: number }; from?: { first_name?: string }; text?: string };
};

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
