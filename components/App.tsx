"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Companion from "@/components/Companion";
import type { Mood } from "@/lib/companion-engine";
import {
  DEFAULT_SETTINGS,
  lastNDays,
  streakOf,
  todaySessions,
  uid,
  usePersisted,
  type Session,
  type Settings,
  type Task,
} from "@/lib/store";
import {
  ChartIcon,
  CheckIcon,
  ChevronIcon,
  FlameIcon,
  ListIcon,
  PlusIcon,
  ResetIcon,
  SkipIcon,
  TargetIcon,
  TimerIcon,
  TrashIcon,
  UserIcon,
  CloudIcon,
  MailIcon,
  GoogleIcon,
} from "@/components/Icons";
import { useCloudSync, type SyncStatus } from "@/lib/sync";
import type { User } from "@supabase/supabase-js";

type Mode = "focus" | "short" | "long";
type Tab = "timer" | "tasks" | "stats" | "me";

const MODE_LABEL: Record<Mode, string> = { focus: "Fokus", short: "Qisqa tanaffus", long: "Uzun tanaffus" };
const WEEKDAYS = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];
const MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const BUBBLES: Record<Mood, string> = {
  idle: "Salom! Bugun nimaga fokus qilamiz?",
  focus: "Jim... ishlayapmiz. Men shu yerdaman.",
  happy: "Uraa! Yana bitta sessiya tayyor!",
  surprised: "Voy! Kunlik maqsad bajarildi!",
  wait: "Seni kutyapman. 25 daqiqa, keyin choy?",
  tired: "Seni sog'indim... bitta sessiya qilamizmi?",
  sleep: "Zzz... kech bo'ldi, ertaga davom etamiz.",
  dizzy: "Boshim aylanib ketdi!",
};
const RING = 2 * Math.PI * 114;

function chime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.18, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 1.2);
    });
  } catch {
    /* ovoz chiqmasa ham davom etamiz */
  }
}

const fmt = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export default function App() {
  const [settings, setSettings, settingsReady] = usePersisted<Settings>("df.settings", DEFAULT_SETTINGS);
  const [tasks, setTasks, tasksReady] = usePersisted<Task[]>("df.tasks", []);
  const [sessions, setSessions, sessionsReady] = usePersisted<Session[]>("df.sessions", []);
  const cloud = useCloudSync({
    ready: settingsReady && tasksReady && sessionsReady,
    tasks,
    setTasks,
    sessions,
    setSessions,
    settings,
    setSettings,
  });
  const [activeTaskId, setActiveTaskId] = usePersisted<string | null>("df.activeTask", null);
  const [tab, setTab] = useState<Tab>("timer");

  const dur = useCallback((m: Mode) => (m === "focus" ? settings.focus : m === "short" ? settings.short : settings.long) * 60_000, [settings]);
  const [mode, setMode] = useState<Mode>("focus");
  const [running, setRunning] = useState(false);
  const [endAt, setEndAt] = useState(0);
  const [remaining, setRemaining] = useState(DEFAULT_SETTINGS.focus * 60_000);
  const [cycle, setCycle] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [celebrateUntil, setCelebrateUntil] = useState(0);
  const [dizzyUntil, setDizzyUntil] = useState(0);
  const pokes = useRef<number[]>([]);

  useEffect(() => {
    // sozlamalar localStorage'dan yuklanganda taymer davomiyligini yangilash
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!running) setRemaining(dur(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const left = running ? Math.max(0, endAt - now) : remaining;
  const total = dur(mode);
  const today = todaySessions(sessions);
  const streak = streakOf(sessions);
  const activeTask = tasks.find((t) => t.id === activeTaskId && !t.completed) ?? null;

  const switchMode = useCallback(
    (m: Mode) => {
      setMode(m);
      setRunning(false);
      setRemaining(dur(m));
    },
    [dur],
  );

  const complete = useCallback(() => {
    const t = Date.now();
    if (settings.sound) chime();
    if (mode === "focus") {
      setSessions((s) => [...s, { id: `s${t}`, at: t, minutes: settings.focus, taskId: activeTask?.id }]);
      if (activeTask) setTasks((ts) => ts.map((x) => (x.id === activeTask.id ? { ...x, done: x.done + 1 } : x)));
      const c = cycle + 1;
      setCycle(c);
      setCelebrateUntil(t + 6000);
      switchMode(c % settings.longEvery === 0 ? "long" : "short");
    } else {
      switchMode("focus");
    }
  }, [mode, settings, activeTask, cycle, setSessions, setTasks, switchMode]);

  useEffect(() => {
    // taymer nolga yetganda sessiyani yakunlash (tashqi vaqt manbasiga reaksiya)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (running && left <= 0) complete();
  }, [running, left, complete]);

  useEffect(() => {
    document.title = running ? `${fmt(left)} · ${MODE_LABEL[mode]} — DeepFokus` : "DeepFokus";
  }, [running, left, mode]);

  const toggle = () => {
    if (running) {
      setRemaining(Math.max(0, endAt - Date.now()));
      setRunning(false);
    } else {
      setEndAt(Date.now() + (remaining > 0 ? remaining : total));
      setRunning(true);
    }
  };
  const reset = () => {
    setRunning(false);
    setRemaining(total);
  };

  const mood: Mood = useMemo(() => {
    if (now < dizzyUntil) return "dizzy";
    if (now < celebrateUntil) return today.length === settings.dailyGoal ? "surprised" : "happy";
    if (running) return mode === "focus" ? "focus" : "idle";
    const h = new Date(now).getHours();
    if (h >= 23 || h < 6) return "sleep";
    const last = sessions.length ? sessions[sessions.length - 1].at : 0;
    if (last && now - last > 2 * 86_400_000) return "tired";
    if (today.length === 0) return "wait";
    return "idle";
  }, [now, dizzyUntil, celebrateUntil, running, mode, sessions, today.length, settings.dailyGoal]);

  const onPoke = () => {
    const t = Date.now();
    pokes.current = pokes.current.filter((p) => t - p < 2000).concat(t);
    if (pokes.current.length >= 5) {
      pokes.current = [];
      setDizzyUntil(t + 3000);
    }
  };

  const d = new Date(now);
  const dateLabel = `${WEEKDAYS[d.getDay()]}, ${d.getDate()}-${MONTHS[d.getMonth()]}`;
  const startLabel = running ? "Pauza" : remaining < total && remaining > 0 ? "Davom ettirish" : "Boshlash";

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col bg-[#F5F5F7] text-[#1D1D1F]">
      <main className="flex flex-1 flex-col gap-3.5 px-5 pb-28 pt-10">
        {tab === "timer" && (
          <>
            <header className="flex items-end justify-between">
              <div>
                <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-[#6E6E73]">{dateLabel}</p>
                <h1 className="text-[34px] font-bold leading-tight tracking-[-0.8px]">Fokus</h1>
              </div>
              <div className="flex items-center gap-1.5 rounded-full bg-white px-3 py-2 shadow-[0_1px_2px_rgba(0,0,0,.06)]">
                <FlameIcon className="h-[18px] w-[18px] text-[#C93400]" />
                <span className="text-[15px] font-bold">{streak} kun</span>
              </div>
            </header>

            <button
              type="button"
              onClick={() => setTab("tasks")}
              className="flex min-h-11 items-center gap-3 rounded-2xl bg-white px-4 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,.05)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#5E5CE6]/12">
                <TargetIcon className="h-[18px] w-[18px] text-[#5E5CE6]" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-base font-semibold">{activeTask ? activeTask.title : "Nimaga fokus qilamiz?"}</span>
                <span className="text-[13px] text-[#6E6E73]">
                  {activeTask ? `${activeTask.done} / ${activeTask.estimate} sprint` : "Vazifa tanlash yoki qo'shish"}
                </span>
              </span>
              <ChevronIcon className="h-[18px] w-[18px] text-[#8E8E93]" />
            </button>

            <div role="group" aria-label="Rejim" className="grid grid-cols-3 gap-0.5 rounded-[10px] bg-[#E8E8ED] p-0.5">
              {(["focus", "short", "long"] as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => switchMode(m)}
                  className={`min-h-9 rounded-lg px-1 text-[13px] transition ${
                    mode === m ? "bg-white font-semibold shadow-[0_1px_3px_rgba(0,0,0,.12)]" : "font-medium text-[#3C3C43]"
                  }`}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>

            <div className="relative mx-auto flex h-[256px] w-[256px] items-center justify-center">
              <svg width="256" height="256" viewBox="0 0 256 256" aria-hidden="true" className="absolute inset-0">
                <circle cx="128" cy="128" r="114" fill="none" stroke="#E5E5EA" strokeWidth="10" />
                <circle
                  cx="128"
                  cy="128"
                  r="114"
                  fill="none"
                  stroke={mode === "focus" ? "#5E5CE6" : "#30B07A"}
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={RING}
                  strokeDashoffset={RING * (1 - left / total)}
                  transform="rotate(-90 128 128)"
                  style={{ transition: "stroke-dashoffset .25s linear" }}
                />
              </svg>
              <div className="relative flex flex-col items-center gap-1">
                <span className="text-[64px] font-semibold leading-none tracking-[-3px] tabular-nums">{fmt(left)}</span>
                <span className="text-[15px] font-medium text-[#6E6E73]">{mode === "focus" ? "Fokus vaqti" : "Tanaffus"}</span>
              </div>
            </div>

            <div className="flex items-end gap-2">
              <Companion mood={mood} onPoke={onPoke} className="h-[118px] w-[104px] shrink-0" heightFrac={0.86} />
              <div className="mb-6 flex-1 rounded-2xl rounded-bl-[4px] bg-white px-3.5 py-2.5 text-[14px] leading-snug shadow-[0_1px_2px_rgba(0,0,0,.05)]">
                {BUBBLES[mood]}
              </div>
            </div>

            <div className="flex items-center justify-center gap-6">
              <button type="button" aria-label="Qaytadan boshlash" onClick={reset} className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#E8E8ED]">
                <ResetIcon className="h-[22px] w-[22px]" />
              </button>
              <button
                type="button"
                onClick={toggle}
                className={`h-[60px] min-w-[176px] rounded-full px-7 text-[17px] font-semibold text-white shadow-[0_6px_16px_rgba(94,92,230,.25)] transition active:scale-[.97] ${
                  running ? "bg-[#1D1D1F]" : "bg-[#5E5CE6]"
                }`}
              >
                {startLabel}
              </button>
              <button
                type="button"
                aria-label="Keyingi rejimga o'tish"
                onClick={() => switchMode(mode === "focus" ? "short" : "focus")}
                className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[#E8E8ED]"
              >
                <SkipIcon className="h-[22px] w-[22px]" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5" aria-label={`Bugun ${today.length} / ${settings.dailyGoal} sessiya`}>
              {Array.from({ length: Math.max(settings.dailyGoal, today.length) }).map((_, i) => (
                <span key={i} className={`h-2 w-2 rounded-full ${i < today.length ? "bg-[#5E5CE6]" : "bg-[#D1D1D6]"}`} />
              ))}
              <span className="ml-1.5 text-[13px] font-medium text-[#6E6E73]">
                {today.length} / {settings.dailyGoal} bugun
              </span>
            </div>
          </>
        )}

        {tab === "tasks" && (
          <TasksView
            tasks={tasks}
            setTasks={setTasks}
            activeTaskId={activeTaskId}
            onFocus={(id) => {
              setActiveTaskId(id);
              setTab("timer");
            }}
          />
        )}

        {tab === "stats" && <StatsView sessions={sessions} streak={streak} />}

        {tab === "me" && <AccountView cloud={cloud} sessions={sessions} tasks={tasks} />}
      </main>

      <nav
        aria-label="Asosiy menyu"
        className="fixed bottom-0 left-1/2 grid w-full max-w-[440px] -translate-x-1/2 grid-cols-4 border-t border-[#E5E5EA] bg-white/95 px-2 pb-[max(env(safe-area-inset-bottom),18px)] pt-1.5 backdrop-blur"
      >
        {(
          [
            ["timer", "Taymer", TimerIcon],
            ["tasks", "Reja", ListIcon],
            ["stats", "Statistika", ChartIcon],
            ["me", "Profil", UserIcon],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            aria-current={tab === id ? "page" : undefined}
            onClick={() => setTab(id)}
            className={`flex min-h-12 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold ${tab === id ? "text-[#5E5CE6]" : "text-[#6E6E73]"}`}
          >
            <Icon className="h-6 w-6" />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function TasksView({
  tasks,
  setTasks,
  activeTaskId,
  onFocus,
}: {
  tasks: Task[];
  setTasks: (f: (t: Task[]) => Task[]) => void;
  activeTaskId: string | null;
  onFocus: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [estimate, setEstimate] = useState(2);
  const open = tasks.filter((t) => !t.completed);
  const doneTasks = tasks.filter((t) => t.completed);
  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const v = title.trim();
    if (!v) return;
    setTasks((ts) => [...ts, { id: uid(), title: v, estimate, done: 0, completed: false, createdAt: Date.now() }]);
    setTitle("");
    setEstimate(2);
  };
  const row = (t: Task, last: boolean) => (
    <li key={t.id} className={`flex items-center gap-3 px-4 py-3 ${last ? "" : "border-b border-[#F0F0F2]"}`}>
      <button
        type="button"
        aria-label={t.completed ? `${t.title} — qayta ochish` : `${t.title} — bajarildi deb belgilash`}
        onClick={() => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, completed: !x.completed } : x)))}
        className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border-2 ${t.completed ? "border-[#5E5CE6] bg-[#5E5CE6]" : "border-[#C7C7CC]"}`}
      >
        {t.completed && <CheckIcon className="h-3.5 w-3.5 text-white" />}
      </button>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`truncate text-base font-medium ${t.completed ? "text-[#6E6E73] line-through" : ""}`}>{t.title}</span>
        <span className="text-[13px] text-[#6E6E73]">
          {t.done} / {t.estimate} sprint{t.id === activeTaskId && !t.completed ? " · hozirgi" : ""}
        </span>
      </span>
      {!t.completed && (
        <button type="button" onClick={() => onFocus(t.id)} className="min-h-9 rounded-full bg-[#5E5CE6]/12 px-3 text-[13px] font-semibold text-[#5E5CE6]">
          Fokus
        </button>
      )}
      <button
        type="button"
        aria-label={`${t.title} — o'chirish`}
        onClick={() => setTasks((ts) => ts.filter((x) => x.id !== t.id))}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[#8E8E93]"
      >
        <TrashIcon className="h-[18px] w-[18px]" />
      </button>
    </li>
  );
  return (
    <>
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-[#6E6E73]">
          Bugun · {doneTasks.length} / {tasks.length} bajarildi
        </p>
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.8px]">Reja</h1>
      </header>
      <form onSubmit={add} className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.05)]">
        <label htmlFor="task-title" className="sr-only">
          Yangi vazifa
        </label>
        <input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Masalan: matematikadan 20 ta masala"
          className="min-h-11 rounded-xl bg-[#F5F5F7] px-3.5 text-base outline-none placeholder:text-[#8E8E93] focus:ring-2 focus:ring-[#5E5CE6]/40"
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium text-[#6E6E73]">Sprint</span>
            <button type="button" aria-label="Kamaytirish" onClick={() => setEstimate((e) => Math.max(1, e - 1))} className="h-9 w-9 rounded-full bg-[#F5F5F7] text-lg font-semibold">
              −
            </button>
            <span className="w-5 text-center font-semibold tabular-nums">{estimate}</span>
            <button type="button" aria-label="Ko'paytirish" onClick={() => setEstimate((e) => Math.min(12, e + 1))} className="h-9 w-9 rounded-full bg-[#F5F5F7] text-lg font-semibold">
              +
            </button>
          </div>
          <button type="submit" className="flex min-h-10 items-center gap-1.5 rounded-full bg-[#5E5CE6] px-4 text-[15px] font-semibold text-white">
            <PlusIcon className="h-4 w-4" /> Qo&apos;shish
          </button>
        </div>
      </form>
      {open.length > 0 && <ul className="overflow-hidden rounded-2xl bg-white">{open.map((t, i) => row(t, i === open.length - 1))}</ul>}
      {open.length === 0 && (
        <p className="rounded-2xl bg-white px-4 py-6 text-center text-[15px] text-[#6E6E73]">
          Hali vazifa yo&apos;q. Bugun nimani tugatmoqchisan? Birinchisini yuqoridan qo&apos;sh.
        </p>
      )}
      {doneTasks.length > 0 && (
        <>
          <h2 className="ml-1 mt-2 text-xl font-bold tracking-[-0.3px]">Bajarilgan</h2>
          <ul className="overflow-hidden rounded-2xl bg-white">{doneTasks.map((t, i) => row(t, i === doneTasks.length - 1))}</ul>
        </>
      )}
    </>
  );
}

function StatsView({ sessions, streak }: { sessions: Session[]; streak: number }) {
  const days = lastNDays(sessions, 7);
  const weekMin = days.reduce((a, d) => a + d.minutes, 0);
  const max = Math.max(60, ...days.map((d) => d.minutes));
  const today = todaySessions(sessions);
  const h = Math.floor(weekMin / 60);
  const m = weekMin % 60;
  return (
    <>
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-[#6E6E73]">Natijalaring</p>
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.8px]">Statistika</h1>
      </header>
      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-[18px]">
        <div>
          <span className="text-[13px] font-medium text-[#6E6E73]">Shu hafta jami fokus</span>
          <p className="text-[34px] font-bold tracking-[-1px]">
            {h} soat {m} daq
          </p>
        </div>
        <div className="grid h-[150px] grid-cols-7 items-end gap-2">
          {days.map((d) => (
            <div key={d.key} className="flex h-full flex-col items-center justify-end gap-1.5">
              <div
                className={`w-full max-w-[30px] rounded-lg ${d.isToday ? "bg-[#5E5CE6]" : "bg-[#D1D1D6]"}`}
                style={{ height: d.minutes ? Math.max(8, Math.round((d.minutes / max) * 120)) : 4 }}
                title={`${d.minutes} daqiqa`}
              />
              <span className="text-[11px] font-semibold text-[#6E6E73]">{d.label}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          [String(today.length), "sessiya bugun"],
          [String(today.reduce((a, s) => a + s.minutes, 0)), "daqiqa bugun"],
          [String(streak), "kunlik streak"],
        ].map(([v, l]) => (
          <div key={l} className="flex flex-col gap-0.5 rounded-2xl bg-white p-3">
            <span className="text-[22px] font-bold tracking-[-0.5px]">{v}</span>
            <span className="text-xs text-[#6E6E73]">{l}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const STATUS_TEXT: Record<SyncStatus, string> = {
  off: "Bulut hali ulanmagan",
  "signed-out": "Kirmagansiz",
  syncing: "Saqlanmoqda...",
  synced: "Hammasi bulutda saqlangan",
  error: "Internet yo'q yoki xato. Keyinroq o'zi qayta urinadi",
};

function AccountView({
  cloud,
  sessions,
  tasks,
}: {
  cloud: {
    enabled: boolean;
    user: User | null;
    status: SyncStatus;
    signInGoogle: () => Promise<{ error?: string }>;
    signInEmail: (email: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
    refresh: () => Promise<void>;
  };
  sessions: Session[];
  tasks: Task[];
}) {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const totalMin = sessions.reduce((a, s) => a + s.minutes, 0);

  const stats = (
    <div className="grid grid-cols-3 gap-2.5">
      {[
        [String(sessions.length), "jami sprint"],
        [`${Math.floor(totalMin / 60)} soat`, "jami fokus"],
        [String(tasks.filter((t) => t.completed).length), "bajarilgan vazifa"],
      ].map(([v, l]) => (
        <div key={l} className="flex flex-col gap-0.5 rounded-2xl bg-white p-3">
          <span className="text-[22px] font-bold tracking-[-0.5px]">{v}</span>
          <span className="text-xs text-[#6E6E73]">{l}</span>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <header>
        <p className="text-[13px] font-semibold uppercase tracking-[0.4px] text-[#6E6E73]">Hisob</p>
        <h1 className="text-[34px] font-bold leading-tight tracking-[-0.8px]">Profil</h1>
      </header>

      {!cloud.enabled && (
        <section className="flex flex-col gap-1.5 rounded-[20px] bg-white p-[18px]">
          <p className="text-[17px] font-semibold">Ma&apos;lumotlar shu qurilmada saqlanyapti</p>
          <p className="text-[15px] leading-snug text-[#6E6E73]">
            Tez orada hisobga kirib, vazifa va sprintlaringizni boshqa qurilmada ham ko&apos;ra olasiz.
          </p>
        </section>
      )}

      {cloud.enabled && cloud.user && (
        <section className="flex flex-col gap-4 rounded-[20px] bg-white p-[18px]">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EEEEFD] text-[19px] font-bold text-[#5E5CE6]">
              {(cloud.user.email ?? "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-semibold">{cloud.user.user_metadata?.full_name ?? cloud.user.email}</p>
              <p className="truncate text-[13px] text-[#6E6E73]">{cloud.user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => cloud.refresh()}
            className="flex items-center gap-2.5 rounded-2xl bg-[#F5F5F7] px-3.5 py-3 text-left"
          >
            <CloudIcon className={`h-5 w-5 shrink-0 ${cloud.status === "error" ? "text-[#FF3B30]" : "text-[#5E5CE6]"}`} />
            <span className="text-[15px] font-medium" aria-live="polite">
              {STATUS_TEXT[cloud.status]}
            </span>
          </button>
          <button type="button" onClick={() => cloud.signOut()} className="h-12 rounded-2xl text-[17px] font-semibold text-[#FF3B30]">
            Chiqish
          </button>
        </section>
      )}

      {cloud.enabled && !cloud.user && (
        <section className="flex flex-col gap-3 rounded-[20px] bg-white p-[18px]">
          <div className="flex flex-col gap-1">
            <p className="text-[17px] font-semibold">Natijalaringiz yo&apos;qolmasin</p>
            <p className="text-[15px] leading-snug text-[#6E6E73]">
              Hisobga kirsangiz, vazifa va sprintlaringiz bulutda saqlanadi va telefon, kompyuterda bir xil ko&apos;rinadi.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setErr("");
              const r = await cloud.signInGoogle();
              if (r.error) setErr("Google orqali kirib bo'lmadi. Email bilan urinib ko'ring.");
              setBusy(false);
            }}
            className="flex h-[52px] items-center justify-center gap-2.5 rounded-2xl border border-[#D1D1D6] text-[17px] font-semibold disabled:opacity-60"
          >
            <GoogleIcon className="h-5 w-5" />
            Google bilan kirish
          </button>
          <div className="flex items-center gap-3 text-[13px] text-[#8E8E93]">
            <span className="h-px flex-1 bg-[#E5E5EA]" />
            yoki
            <span className="h-px flex-1 bg-[#E5E5EA]" />
          </div>
          {sent ? (
            <div className="flex items-start gap-2.5 rounded-2xl bg-[#EEEEFD] p-3.5" role="status">
              <MailIcon className="mt-0.5 h-5 w-5 shrink-0 text-[#5E5CE6]" />
              <p className="text-[15px] leading-snug">
                <b>{email}</b> manziliga havola yubordik. Pochtangizni ochib, havolani bosing.
              </p>
            </div>
          ) : (
            <form
              className="flex flex-col gap-2.5"
              onSubmit={async (e) => {
                e.preventDefault();
                const v = email.trim();
                if (!/^\S+@\S+\.\S+$/.test(v)) {
                  setErr("Email manzil to'g'ri yozilmagan.");
                  return;
                }
                setBusy(true);
                setErr("");
                const r = await cloud.signInEmail(v);
                if (r.error) setErr("Havolani yuborib bo'lmadi. Bir ozdan keyin qayta urinib ko'ring.");
                else setSent(true);
                setBusy(false);
              }}
            >
              <label htmlFor="df-email" className="sr-only">
                Email
              </label>
              <input
                id="df-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="email@manzil.uz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-2xl bg-[#F5F5F7] px-4 text-[17px] outline-none focus:ring-2 focus:ring-[#5E5CE6]"
              />
              <button
                type="submit"
                disabled={busy}
                className="h-[52px] rounded-2xl bg-[#5E5CE6] text-[17px] font-semibold text-white disabled:opacity-60"
              >
                Email orqali kirish
              </button>
            </form>
          )}
          {err && (
            <p className="text-[13px] text-[#FF3B30]" role="alert">
              {err}
            </p>
          )}
        </section>
      )}

      {stats}
    </>
  );
}
