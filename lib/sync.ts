"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import type { Session, Settings, Task } from "@/lib/store";

export type SyncStatus = "off" | "signed-out" | "syncing" | "synced" | "error";

type TaskRow = {
  id: string;
  title: string;
  estimate: number;
  done: number;
  completed: boolean;
  created_at: string;
};
type SessionRow = { id: string; ended_at: string; minutes: number; task_id: string | null };

// Oxirgi muvaffaqiyatli sinxron holati: nima o'zgarganini shundan bilamiz
type Snapshot = { userId: string; tasks: Record<string, string>; sessions: string[]; settings: string };
const SNAP_KEY = "df.synced";

export const sessionId = (s: Session) => s.id ?? `s${s.at}`;
const taskJson = (t: Task) => JSON.stringify([t.title, t.estimate, t.done, t.completed]);

const toTaskRow = (t: Task) => ({
  id: t.id,
  title: t.title.slice(0, 300),
  estimate: Math.min(99, Math.max(1, t.estimate)),
  done: t.done,
  completed: t.completed,
  created_at: new Date(t.createdAt).toISOString(),
  updated_at: new Date().toISOString(),
});
const fromTaskRow = (r: TaskRow): Task => ({
  id: r.id,
  title: r.title,
  estimate: r.estimate,
  done: r.done,
  completed: r.completed,
  createdAt: new Date(r.created_at).getTime(),
});
const toSessionRow = (s: Session) => ({
  id: sessionId(s),
  ended_at: new Date(s.at).toISOString(),
  minutes: s.minutes,
  task_id: s.taskId ?? null,
});
const fromSessionRow = (r: SessionRow): Session => ({
  id: r.id,
  at: new Date(r.ended_at).getTime(),
  minutes: r.minutes,
  taskId: r.task_id ?? undefined,
});

function loadSnap(): Snapshot | null {
  try {
    const raw = localStorage.getItem(SNAP_KEY);
    return raw ? (JSON.parse(raw) as Snapshot) : null;
  } catch {
    return null;
  }
}
function saveSnap(s: Snapshot | null) {
  try {
    if (s) localStorage.setItem(SNAP_KEY, JSON.stringify(s));
    else localStorage.removeItem(SNAP_KEY);
  } catch {
    /* ignore */
  }
}
const snapOf = (userId: string, tasks: Task[], sessions: Session[], settings: Settings): Snapshot => ({
  userId,
  tasks: Object.fromEntries(tasks.map((t) => [t.id, taskJson(t)])),
  sessions: sessions.map(sessionId),
  settings: JSON.stringify(settings),
});

type Args = {
  ready: boolean;
  tasks: Task[];
  setTasks: (v: Task[]) => void;
  sessions: Session[];
  setSessions: (v: Session[]) => void;
  settings: Settings;
  setSettings: (v: Settings) => void;
};

export function useCloudSync({ ready, tasks, setTasks, sessions, setSessions, settings, setSettings }: Args) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<SyncStatus>(supabase ? "signed-out" : "off");
  const snap = useRef<Snapshot | null>(null);
  const latest = useRef({ tasks, sessions, settings });
  useEffect(() => {
    latest.current = { tasks, sessions, settings };
  }, [tasks, sessions, settings]);
  const busy = useRef(false);

  // Kirish holatini kuzatish
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  // Bulutdagini olib, shu qurilmadagi bilan birlashtirish
  const pull = useCallback(async () => {
    if (!supabase || !user || busy.current) return;
    busy.current = true;
    setStatus("syncing");
    try {
      const [tr, sr, pr] = await Promise.all([
        supabase.from("tasks").select("id,title,estimate,done,completed,created_at"),
        supabase.from("sessions").select("id,ended_at,minutes,task_id"),
        supabase.from("profiles").select("settings").eq("id", user.id).maybeSingle(),
      ]);
      if (tr.error || sr.error || pr.error) throw tr.error ?? sr.error ?? pr.error;

      const prev = loadSnap();
      const same = prev?.userId === user.id ? prev : null;
      const local = latest.current;

      // Vazifalar: shu qurilmada o'zgargan bo'lsa shu qurilmaniki, aks holda bulutdagi
      const remote = new Map((tr.data as TaskRow[]).map((r) => [r.id, fromTaskRow(r)]));
      const merged = new Map(remote);
      const localIds = new Set(local.tasks.map((t) => t.id));
      for (const t of local.tasks) {
        const synced = same?.tasks[t.id];
        if (!remote.has(t.id)) {
          if (synced === undefined) merged.set(t.id, t); // yangi, hali yuborilmagan
          // aks holda boshqa qurilmada o'chirilgan
        } else if (synced === undefined || synced !== taskJson(t)) {
          merged.set(t.id, t);
        }
      }
      // Shu qurilmada o'chirilgan, lekin bulutda qolganlari
      for (const id of remote.keys()) if (same && same.tasks[id] !== undefined && !localIds.has(id)) merged.delete(id);

      // Sessiyalar faqat qo'shiladi: ikkalasini birlashtiramiz
      const sess = new Map((sr.data as SessionRow[]).map((r) => [r.id, fromSessionRow(r)]));
      const remoteSessIds = new Set(sess.keys());
      for (const s of local.sessions) if (!sess.has(sessionId(s))) sess.set(sessionId(s), { ...s, id: sessionId(s) });

      const nextTasks = [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
      const nextSessions = [...sess.values()].sort((a, b) => a.at - b.at);
      const remoteSettings = (pr.data?.settings ?? null) as Settings | null;
      const nextSettings = remoteSettings && same?.settings === JSON.stringify(local.settings) ? { ...local.settings, ...remoteSettings } : local.settings;

      // Bulutni ham shu holatga keltiramiz
      const upTasks = nextTasks.filter((t) => {
        const r = remote.get(t.id);
        return !r || taskJson(r) !== taskJson(t);
      });
      const delTasks = [...remote.keys()].filter((id) => !merged.has(id));
      const upSess = nextSessions.filter((s) => !remoteSessIds.has(sessionId(s)));
      const ops = [];
      if (upTasks.length) ops.push(supabase.from("tasks").upsert(upTasks.map(toTaskRow)));
      if (delTasks.length) ops.push(supabase.from("tasks").delete().in("id", delTasks));
      if (upSess.length) ops.push(supabase.from("sessions").upsert(upSess.map(toSessionRow)));
      if (JSON.stringify(remoteSettings) !== JSON.stringify(nextSettings))
        ops.push(supabase.from("profiles").upsert({ id: user.id, settings: nextSettings, updated_at: new Date().toISOString() }));
      const res = await Promise.all(ops);
      const err = res.find((r) => r.error)?.error;
      if (err) throw err;

      snap.current = snapOf(user.id, nextTasks, nextSessions, nextSettings);
      saveSnap(snap.current);
      setTasks(nextTasks);
      setSessions(nextSessions);
      setSettings(nextSettings);
      setStatus("synced");
    } catch (e) {
      console.error("[DeepFokus] sinxronlashda xato", e);
      setStatus("error");
    } finally {
      busy.current = false;
    }
  }, [user, setTasks, setSessions, setSettings]);

  // Kirgandan keyin va ilovaga qaytganda bulutdan yangilash
  useEffect(() => {
    if (!supabase) return;
    if (!user) {
      snap.current = null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("signed-out");
      return;
    }
    if (!ready) return;
    pull();
    const onVis = () => document.visibilityState === "visible" && pull();
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("online", pull);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", pull);
    };
  }, [user, ready, pull]);

  // Har o'zgarishdan keyin faqat farqni yuborish
  useEffect(() => {
    if (!supabase || !user || !snap.current || busy.current) return;
    const s = snap.current;
    const upTasks = tasks.filter((t) => s.tasks[t.id] !== taskJson(t));
    const ids = new Set(tasks.map((t) => t.id));
    const delTasks = Object.keys(s.tasks).filter((id) => !ids.has(id));
    const known = new Set(s.sessions);
    const upSess = sessions.filter((x) => !known.has(sessionId(x)));
    const setChanged = s.settings !== JSON.stringify(settings);
    if (!upTasks.length && !delTasks.length && !upSess.length && !setChanged) return;

    const timer = setTimeout(async () => {
      const sb = supabase!;
      setStatus("syncing");
      const ops = [];
      if (upTasks.length) ops.push(sb.from("tasks").upsert(upTasks.map(toTaskRow)));
      if (delTasks.length) ops.push(sb.from("tasks").delete().in("id", delTasks));
      if (upSess.length) ops.push(sb.from("sessions").upsert(upSess.map(toSessionRow)));
      if (setChanged) ops.push(sb.from("profiles").upsert({ id: user.id, settings, updated_at: new Date().toISOString() }));
      const res = await Promise.all(ops);
      const err = res.find((r) => r.error)?.error;
      if (err) {
        console.error("[DeepFokus] yuborishda xato", err);
        setStatus("error");
        return;
      }
      snap.current = snapOf(user.id, tasks, sessions, settings);
      saveSnap(snap.current);
      setStatus("synced");
    }, 800);
    return () => clearTimeout(timer);
  }, [user, tasks, sessions, settings]);

  const redirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
  const signInGoogle = useCallback(async () => {
    if (!supabase) return { error: "off" };
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
    return { error: error?.message };
  }, [redirectTo]);
  const signInEmail = useCallback(
    async (email: string) => {
      if (!supabase) return { error: "off" };
      const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      return { error: error?.message };
    },
    [redirectTo],
  );
  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    saveSnap(null);
  }, []);

  return { enabled: !!supabase, user, status, signInGoogle, signInEmail, signOut, refresh: pull };
}
