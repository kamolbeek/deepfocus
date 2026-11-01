import { safeEqual, tg } from "@/lib/telegram-server";

// Botni bir marta sozlash: webhook, menyu tugmasi, buyruqlar va tavsif.
// Faqat TELEGRAM_SETUP_KEY ni biladigan odam ishga tushira oladi.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = process.env.TELEGRAM_SETUP_KEY ?? "";
  if (!key || !safeEqual(url.searchParams.get("key") ?? "", key)) return new Response("forbidden", { status: 403 });

  const origin = `${url.protocol}//${url.host}`;
  const results = {
    webhook: await tg("setWebhook", {
      url: `${origin}/api/telegram/webhook`,
      secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ["message"],
      drop_pending_updates: true,
    }),
    menu: await tg("setChatMenuButton", {
      menu_button: { type: "web_app", text: "Ochish", web_app: { url: `${origin}/` } },
    }),
    commands: await tg("setMyCommands", {
      commands: [
        { command: "start", description: "DeepFokus'ni ochish" },
        { command: "help", description: "Yordam" },
      ],
    }),
    description: await tg("setMyDescription", {
      description:
        "DeepFokus — kompanyon bilan fokus taymer. Vazifalarni rejalashtiring, 25 daqiqalik sprintlarda chuqur ishlang va har kungi streakni ushlab turing.",
    }),
    short: await tg("setMyShortDescription", {
      short_description: "Kompanyon bilan fokus taymer: sprintlar, vazifalar va streak.",
    }),
  };
  const ok = Object.values(results).every((r) => r.ok);
  return Response.json({ ok, results }, { status: ok ? 200 : 500 });
}
