"use client";

import { useCallback, useEffect, useState } from "react";

export type Task = {
  id: string;
  title: string;
  estimate: number; // rejalashtirilgan sprintlar
  done: number; // bajarilgan sprintlar
  completed: boolean;
  createdAt: number;
};

export type Session = {
  id?: string;
  at: number; // tugagan vaqt (ms)
  minutes: number;
  taskId?: string;
};

export type Settings = {
  focus: number;
  short: number;
  long: number;
  longEvery: number;
  dailyGoal: number;
  sound: boolean;
  accent: AccentId;
};

export type AccentId = "violet" | "blue" | "green" | "pink" | "orange";
// Oq matn bilan kontrast 4.5:1 dan yuqori bo'lgan yumshoq ranglar
export const ACCENTS: Record<AccentId, { name: string; main: string; soft: string }> = {
  violet: { name: "Binafsha", main: "#5E5CE6", soft: "#EEEEFD" },
  blue: { name: "Ko'k", main: "#2B68D0", soft: "#E8F0FC" },
  green: { name: "Yashil", main: "#1E7F55", soft: "#E3F3EB" },
  pink: { name: "Pushti", main: "#C0447A", soft: "#FAE8F0" },
  orange: { name: "Shaftoli", main: "#B5531A", soft: "#FBEDE3" },
};

export const DEFAULT_SETTINGS: Settings = {
  focus: 25,
  short: 5,
  long: 15,
  longEvery: 4,
  dailyGoal: 4,
  sound: true,
  accent: "violet",
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* saqlab bo'lmasa ham ilova ishlayveradi */
  }
}

// localStorage bilan sinxron state (server render paytida boshlang'ich qiymat)
export function usePersisted<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setValue(read(key, fallback));
    setReady(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const v = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        write(key, v);
        return v;
      });
    },
    [key],
  );
  return [value, update, ready] as const;
}

export const dayKey = (t: number | Date) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function todaySessions(sessions: Session[]) {
  const k = dayKey(Date.now());
  return sessions.filter((s) => dayKey(s.at) === k);
}

// Ketma-ket kunlar: bugun yoki kecha bilan tugagan seriya
export function streakOf(sessions: Session[]) {
  const days = new Set(sessions.map((s) => dayKey(s.at)));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export function lastNDays(sessions: Session[], n: number) {
  const out: { key: string; label: string; minutes: number; isToday: boolean }[] = [];
  const names = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    out.push({
      key: k,
      label: names[d.getDay()],
      minutes: sessions.filter((s) => dayKey(s.at) === k).reduce((a, s) => a + s.minutes, 0),
      isToday: i === 0,
    });
  }
  return out;
}

export const uid = () => Math.random().toString(36).slice(2, 10);
