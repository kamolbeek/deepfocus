"use client";

// Telegram Mini App ichida ochilganda kerak bo'ladigan kichik qism
type WebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  setBottomBarColor?: (c: string) => void;
  disableVerticalSwipes?: () => void;
  isVersionAtLeast?: (v: string) => boolean;
  HapticFeedback?: {
    impactOccurred: (s: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (t: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
};

export function telegram(): WebApp | null {
  if (typeof window === "undefined") return null;
  const w = (window as unknown as { Telegram?: { WebApp?: WebApp } }).Telegram?.WebApp;
  return w && w.initData ? w : null;
}

export function initTelegram() {
  const w = telegram();
  if (!w) return false;
  try {
    w.ready();
    w.expand();
    w.setHeaderColor?.("#F5F5F7");
    w.setBackgroundColor?.("#F5F5F7");
    w.setBottomBarColor?.("#FFFFFF");
    if (w.isVersionAtLeast?.("7.7")) w.disableVerticalSwipes?.();
  } catch {
    /* eski Telegram versiyalari */
  }
  return true;
}

export const haptic = {
  tap: () => telegram()?.HapticFeedback?.impactOccurred("light"),
  start: () => telegram()?.HapticFeedback?.impactOccurred("medium"),
  success: () => telegram()?.HapticFeedback?.notificationOccurred("success"),
  select: () => telegram()?.HapticFeedback?.selectionChanged(),
};
