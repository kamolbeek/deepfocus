"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signInWithCustomToken,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { collection, doc, getDoc, getDocs, writeBatch, type Firestore } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Session, Settings, Task } from "@/lib/store";
import { telegram } from "@/lib/telegram";

export type SyncStatus = "off" | "signed-out" | "syncing" | "synced" | "error";
export type CloudUser = { uid: string; email: string | null; name: string | null };

// Oxirgi muvaffaqiyatli sinxron holati: nima o'zgarganini shundan bilamiz
type Snapshot = { userId: string; tasks: Record<string, string>; sessions: string[]; settings: string };
const SNAP_KEY = "df.synced";
const EMAIL_KEY = "df.signinEmail";

export const sessionId = (s: Session) => s.id ?? `s${s.at}`;
const taskJson = (t: Task) => JSON.stringify([t.title, t.estimate, t.done, t.completed]);

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

// ---- Firestore: users/{uid}, users/{uid}/tasks/{id}, users/{uid}/sessions/{id}

async function fetchAll(fs: Firestore, uid: string) {
  const [ts, ss, us] = await Promise.all([
    getDocs(collection(fs, "users", uid, "tasks")),
    getDocs(collection(fs, "users", uid, "sessions")),
    getDoc(doc(fs, "users", uid)),
  ]);
  const tasks: Task[] = ts.docs.map((d) => {
    const v = d.data();
    return {
      id: d.id,
      title: String(v.title ?? ""),
      estimate: Number(v.estimate ?? 1),
      done: Number(v.done ?? 0),
      completed: !!v.completed,
      createdAt: Number(v.createdAt ?? Date.now()),
    };
  });
  const sessions: Session[] = ss.docs.map((d) => {
    const v = d.data();
    return { id: d.id, at: Number(v.at), minutes: Number(v.minutes), taskId: v.taskId ?? undefined };
  });
  const settings = (us.exists() ? (us.data().settings ?? null) : null) as Settings | null;
  return { tasks, sessions, settings };
}

type Ops = { upTasks: Task[]; delTasks: string[]; upSess: Session[]; settings?: Settings };

async function push(fs: Firestore, uid: string, ops: Ops) {
  const writes: ((b: ReturnType<typeof writeBatch>) => void)[] = [];
  const now = Date.now();
  for (const t of ops.upTasks)
    writes.push((b) =>
      b.set(doc(fs, "users", uid, "tasks", t.id), {
        title: t.title.slice(0, 300),
        estimate: t.estimate,
        done: t.done,
        completed: t.completed,
        createdAt: t.createdAt,
        updatedAt: now,
      }),
    );
  for (const id of ops.delTasks) writes.push((b) => b.delete(doc(fs, "users", uid, "tasks", id)));
  for (const s of ops.upSess)
    writes.push((b) =>
      b.set(doc(fs, "users", uid, "sessions", sessionId(s)), { at: s.at, minutes: s.minutes, taskId: s.taskId ?? null }),
    );
  if (ops.settings) writes.push((b) => b.set(doc(fs, "users", uid), { settings: ops.settings, updatedAt: now }, { merge: true }));
  // Firestore bitta paketda 500 tagacha yozuv qabul qiladi
  for (let i = 0; i < writes.length; i += 450) {
    const b = writeBatch(fs);
    writes.slice(i, i + 450).forEach((w) => w(b));
    await b.commit();
  }
}

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
  const [user, setUser] = useState<CloudUser | null>(null);
  const [status, setStatus] = useState<SyncStatus>(auth ? "signed-out" : "off");
  const snap = useRef<Snapshot | null>(null);
  const latest = useRef({ tasks, sessions, settings });
  useEffect(() => {
    latest.current = { tasks, sessions, settings };
  }, [tasks, sessions, settings]);
  const busy = useRef(false);

  // Kirish holatini kuzatish va emaildagi havola bilan qaytganda kirishni yakunlash
  useEffect(() => {
    if (!auth) return;
    const a = auth;
    if (isSignInWithEmailLink(a, window.location.href)) {
      const email = localStorage.getItem(EMAIL_KEY) ?? window.prompt("Kirish uchun emailingizni yozing") ?? "";
      if (email)
        signInWithEmailLink(a, email, window.location.href)
          .then(() => localStorage.removeItem(EMAIL_KEY))
          .catch((e) => console.error("[DeepFokus] email havola xatosi", e))
          .finally(() => window.history.replaceState(null, "", window.location.pathname));
    }
    let tgTried = false;
    return onAuthStateChanged(a, (u: User | null) => {
      setUser(u ? { uid: u.uid, email: u.email, name: u.displayName } : null);
      // Telegram ichida bo'lsa, Telegram hisobi bilan avtomatik kirish
      const w = telegram();
      if (!u && w && !tgTried) {
        tgTried = true;
        fetch("/api/telegram/auth", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ initData: w.initData }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d: { token?: string } | null) => (d?.token ? signInWithCustomToken(a, d.token) : null))
          .catch((e) => console.error("[DeepFokus] Telegram orqali kirish xatosi", e));
      }
    });
  }, []);

  // Bulutdagini olib, shu qurilmadagi bilan birlashtirish
  const pull = useCallback(async () => {
    if (!db || !user || busy.current) return;
    busy.current = true;
    setStatus("syncing");
    try {
      const remoteAll = await fetchAll(db, user.uid);
      const prev = loadSnap();
      const same = prev?.userId === user.uid ? prev : null;
      const local = latest.current;

      // Vazifalar: shu qurilmada o'zgargan bo'lsa shu qurilmaniki, aks holda bulutdagi
      const remote = new Map(remoteAll.tasks.map((t) => [t.id, t]));
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
      const sess = new Map(remoteAll.sessions.map((s) => [sessionId(s), s]));
      const remoteSessIds = new Set(sess.keys());
      for (const s of local.sessions) if (!sess.has(sessionId(s))) sess.set(sessionId(s), { ...s, id: sessionId(s) });

      const nextTasks = [...merged.values()].sort((a, b) => a.createdAt - b.createdAt);
      const nextSessions = [...sess.values()].sort((a, b) => a.at - b.at);
      const rs = remoteAll.settings;
      const localUnchanged = same?.settings === JSON.stringify(local.settings);
      const nextSettings = rs && (localUnchanged || !same) ? { ...local.settings, ...rs } : local.settings;

      await push(db, user.uid, {
        upTasks: nextTasks.filter((t) => {
          const r = remote.get(t.id);
          return !r || taskJson(r) !== taskJson(t);
        }),
        delTasks: [...remote.keys()].filter((id) => !merged.has(id)),
        upSess: nextSessions.filter((s) => !remoteSessIds.has(sessionId(s))),
        settings: JSON.stringify(rs) !== JSON.stringify(nextSettings) ? nextSettings : undefined,
      });

      snap.current = snapOf(user.uid, nextTasks, nextSessions, nextSettings);
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
    if (!auth) return;
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
    if (!db || !user || !snap.current || busy.current) return;
    const s = snap.current;
    const upTasks = tasks.filter((t) => s.tasks[t.id] !== taskJson(t));
    const ids = new Set(tasks.map((t) => t.id));
    const delTasks = Object.keys(s.tasks).filter((id) => !ids.has(id));
    const known = new Set(s.sessions);
    const upSess = sessions.filter((x) => !known.has(sessionId(x)));
    const setChanged = s.settings !== JSON.stringify(settings);
    if (!upTasks.length && !delTasks.length && !upSess.length && !setChanged) return;

    const fs = db;
    const timer = setTimeout(async () => {
      setStatus("syncing");
      try {
        await push(fs, user.uid, { upTasks, delTasks, upSess, settings: setChanged ? settings : undefined });
        snap.current = snapOf(user.uid, tasks, sessions, settings);
        saveSnap(snap.current);
        setStatus("synced");
      } catch (e) {
        console.error("[DeepFokus] yuborishda xato", e);
        setStatus("error");
      }
    }, 800);
    return () => clearTimeout(timer);
  }, [user, tasks, sessions, settings]);

  const signInGoogle = useCallback(async () => {
    if (!auth) return { error: "off" };
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      return {};
    } catch (e) {
      const code = (e as { code?: string }).code ?? "";
      if (code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment") {
        await signInWithRedirect(auth, provider);
        return {};
      }
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") return {};
      return { error: code || "error" };
    }
  }, []);

  const signInEmail = useCallback(async (email: string) => {
    if (!auth) return { error: "off" };
    try {
      await sendSignInLinkToEmail(auth, email, { url: window.location.origin, handleCodeInApp: true });
      localStorage.setItem(EMAIL_KEY, email);
      return {};
    } catch (e) {
      return { error: (e as { code?: string }).code ?? "error" };
    }
  }, []);

  const signOut = useCallback(async () => {
    if (auth) await fbSignOut(auth);
    saveSnap(null);
  }, []);

  const [inTelegram, setInTelegram] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInTelegram(!!telegram());
  }, []);

  return { enabled: !!auth, inTelegram, user, status, signInGoogle, signInEmail, signOut, refresh: pull };
}
