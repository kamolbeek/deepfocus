import { dayKey, type Session, type Settings } from "@/lib/store";
import { SCENES } from "@/lib/scenes";

// Tanga va tajriba (XP) sessiyalardan hisoblanadi, alohida saqlanmaydi:
// shuning uchun qurilmalar orasida hech qachon chalkashmaydi.
export const GOAL_BONUS = 20; // kunlik maqsad bajarilgan har kun uchun

// n-darajaga yetish uchun kerak bo'ladigan jami fokus daqiqalari: 0, 60, 180, 360, 600...
export const xpForLevel = (n: number) => 30 * n * (n - 1);

export function levelOf(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  return { level, into: xp - from, need: to - from, pct: (xp - from) / (to - from) };
}

export function progressOf(sessions: Session[], settings: Settings) {
  const xp = sessions.reduce((a, s) => a + s.minutes, 0);
  const perDay = new Map<string, number>();
  for (const s of sessions) perDay.set(dayKey(s.at), (perDay.get(dayKey(s.at)) ?? 0) + 1);
  const goalDays = [...perDay.values()].filter((n) => n >= settings.dailyGoal).length;
  const earned = xp + goalDays * GOAL_BONUS;
  const spent = (settings.owned ?? []).reduce((a, id) => a + (SCENES.find((x) => x.id === id)?.price ?? 0), 0);
  return { xp, ...levelOf(xp), earned, spent, coins: Math.max(0, earned - spent), goalDays };
}
