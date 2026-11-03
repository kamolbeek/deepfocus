// DeepFokus — Mac ish stolidagi kompanyon.
// Taymer shu yerda (asosiy jarayonda) ishlaydi: oyna yashirin bo'lsa ham menyu satri to'g'ri vaqtni ko'rsatadi.
const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  globalShortcut,
  screen,
  ipcMain,
  nativeImage,
  powerMonitor,
  Notification,
  shell,
} = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn } = require("node:child_process");
const os = require("node:os");
const { METHODS, methodById } = require("./shared/methods.js");
const { createAgents } = require("./agents.js");
const voice = require("./voice.js");

if (!app.requestSingleInstanceLock()) app.quit();

const WEB_URL = "https://deepfocus-gilt.vercel.app";
// Ish stolidagi kompanyon oynasining asosiy o'lchami (kattalik koeffitsiyenti bilan ko'paytiriladi)
const PET_W = 230;
const PET_H = 330;
// Notch oynasi: ochilgan panel shu o'lchamga sig'adi
const NOTCH_W = 620;
const NOTCH_H = 460;

// ---------- Mahalliy fayl: sozlamalar, sessiyalar, oyna joyi
const storePath = () => path.join(app.getPath("userData"), "deepfokus.json");
const DEFAULTS = {
  method: "pomodoro",
  focus: 25,
  short: 5,
  long: 15,
  longEvery: 4,
  dailyGoal: 4,
  sound: true,
  hidden: false,
  pos: null,
  mode: "notch", // "notch" — kamera yonida, "desktop" — ish stolida
  petScale: 1,
  roam: true, // ish stolida yurib yurish
  outfit: "none", // notch'dagi kompanyon kiyimi
  bodyShape: "round",
  bodyColor: "",
  sessions: [],
};
let store = { ...DEFAULTS };
// kutilmagan xato bo'lsa ham ekranga oyna chiqarmaymiz — logga yozib, ishlashda davom etamiz
process.on("uncaughtException", (err) => console.error("[deepfokus]", err));
function loadStore() {
  try {
    store = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(storePath(), "utf8")) };
    if (store.pos && !(Number.isFinite(store.pos.x) && Number.isFinite(store.pos.y))) store.pos = null;
    if (!Number.isFinite(store.petScale)) store.petScale = 1;
    // 1.0: notch'da Mochi (Coucou dizayni, muallif ruxsati bilan)
    if (!store.v10) {
      store.v10 = true;
      store.bodyShape = "round";
      store.bodyColor = "";
      store.outfit = "none";
    }
  } catch {
    store = { ...DEFAULTS };
  }
}
let saveTimer = null;
function saveStore() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(storePath()), { recursive: true });
      fs.writeFileSync(storePath(), JSON.stringify(store, null, 2));
    } catch (e) {
      console.error("saqlab bo'lmadi", e);
    }
  }, 300);
}

// ---------- Kun hisoblari (mahalliy vaqt)
const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
const todaySessions = () => store.sessions.filter((s) => dayKey(s.at) === dayKey(Date.now()));
function streak() {
  const days = new Set(store.sessions.map((s) => dayKey(s.at)));
  const d = new Date();
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(dayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

// ---------- Taymer
const LABELS = { focus: "Fokus", short: "Qisqa tanaffus", long: "Uzun tanaffus" };
const T = {
  mode: "focus",
  running: false,
  endAt: 0,
  remaining: 0,
  cycle: 0,
  flowAcc: 0,
  startAt: 0,
  flowBreak: 5 * 60_000,
  celebrateUntil: 0,
  away: false,
  halfSaid: false,
  lastSaid: false,
};

const method = () => methodById(store.method);
const secMode = () => method()?.unit === "sec";
const isFlow = () => !!method()?.flow;
const plan = () => (secMode() ? method() : store);
const unitMs = () => (secMode() ? 1000 : 60_000);
const labels = () => method()?.labels ?? LABELS;
const flowing = () => isFlow() && T.mode === "focus";

function dur(m) {
  const p = plan();
  if (m === "focus") return p.focus * unitMs();
  if (m === "short") return isFlow() ? T.flowBreak : p.short * unitMs();
  return p.long * unitMs();
}
const elapsed = () => T.flowAcc + (T.running && flowing() ? Date.now() - T.startAt : 0);
const left = () => (flowing() ? elapsed() : T.running ? Math.max(0, T.endAt - Date.now()) : T.remaining);

function fmt(ms) {
  const s = Math.ceil(ms / 1000);
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function setMode(m, autoStart = false) {
  T.mode = m;
  T.remaining = dur(m);
  T.halfSaid = false;
  T.lastSaid = false;
  if (autoStart) {
    T.endAt = Date.now() + T.remaining;
    T.running = true;
  } else T.running = false;
  rebuildMenu();
}

function record(minutes) {
  const t = Date.now();
  store.sessions.push({ at: t, minutes });
  saveStore();
  T.celebrateUntil = t + 6000;
}

function notify(title, body) {
  if (Notification.isSupported()) new Notification({ title, body, silent: !store.sound }).show();
}

function complete() {
  if (T.mode === "focus") {
    T.cycle++;
    if (secMode()) {
      const p = plan();
      if (T.cycle % p.longEvery === 0) {
        record(Math.max(1, Math.round((p.focus * p.longEvery) / 60)));
        say("Barakalla! To'plam tugadi, 1 daqiqa dam ol.", 5000);
        notify("Tabata tugadi", "Zo'r! Endi bir daqiqa dam oling.");
        setMode("long", true);
      } else {
        sound("tick");
        setMode("short", true);
      }
      return;
    }
    const p = plan();
    record(p.focus);
    const today = todaySessions().length;
    const goal = store.dailyGoal;
    say(
      today === goal
        ? "Voy! Bugungi maqsad bajarildi! 🎉"
        : pick(["Uraa! Sprint tugadi!", "Zo'r ishlading! Endi ko'zingni dam oldir.", "Yana bitta tayyor! 💪"]),
      6000,
    );
    notify("Sprint tugadi 🎉", `Bugun ${today} ta sprint. Endi tanaffus: o'rningizdan turing.`);
    activity("done", `+${p.focus} daqiqa · bugun ${today} ta sprint`);
    sound("done");
    setMode(T.cycle % p.longEvery === 0 ? "long" : "short");
  } else if (secMode() && T.mode === "short") {
    sound("tick");
    setMode("focus", true);
  } else {
    say("Tanaffus tugadi. Yana bittasini qilamizmi?", 6000);
    notify("Tanaffus tugadi", "Keyingi sprintga tayyormisiz?");
    sound("done");
    setMode("focus");
  }
}

function toggle() {
  if (flowing()) {
    if (T.running) {
      T.flowAcc += Date.now() - T.startAt;
      T.running = false;
    } else {
      T.startAt = Date.now();
      T.running = true;
      say(pick(["Oqimga tushamiz. Charchasang, tanaffus qilamiz.", "Boshladik! Men shu yerdaman."]), 4000);
    }
  } else if (T.running) {
    T.remaining = Math.max(0, T.endAt - Date.now());
    T.running = false;
    say("Pauza. Qachon tayyor bo'lsang, davom etamiz.", 3500);
  } else {
    if (T.remaining <= 0) T.remaining = dur(T.mode);
    T.endAt = Date.now() + T.remaining;
    T.running = true;
    if (T.mode === "focus") {
      say(pick(["Boshladik! Men shu yerdaman.", "Telefonni chetga qo'yamiz 🙂", "Bitta ish, to'liq diqqat."]), 4000);
      activity("start", `${method()?.name ?? "Fokus"} boshlandi · ${fmt(T.remaining)}`);
    }
    else say("Tanaffus: o'rningdan tur, suv ich.", 4000);
  }
  rebuildMenu();
  push();
}

function finishFlow() {
  const spent = elapsed();
  T.flowAcc = 0;
  T.running = false;
  if (spent < 60_000) return setMode("focus");
  record(Math.round(spent / 60_000));
  T.flowBreak = Math.min(30, Math.max(1, Math.round(spent / 5 / 60_000))) * 60_000;
  say(`Zo'r oqim bo'ldi! ${Math.round(T.flowBreak / 60_000)} daqiqa dam ol.`, 5000);
  sound("done");
  T.mode = "short";
  T.remaining = T.flowBreak;
  rebuildMenu();
}

function skip() {
  if (flowing()) return finishFlow();
  setMode(T.mode === "focus" ? "short" : "focus");
  push();
}
function reset() {
  T.running = false;
  T.flowAcc = 0;
  T.cycle = 0;
  setMode(T.mode);
  push();
}
function chooseMethod(id) {
  const m = methodById(id);
  if (!m) return;
  store.method = id;
  if (m.unit === "min" && !m.flow) Object.assign(store, { focus: m.focus, short: m.short, long: m.long, longEvery: m.longEvery });
  saveStore();
  T.flowAcc = 0;
  T.cycle = 0;
  setMode("focus");
  say(`${m.name}: ${m.rule}`, 7000);
  push();
}

// ---------- Kompanyon gaplari
const pick = (a) => a[Math.floor(Math.random() * a.length)];
let bubble = { text: "", until: 0 };
function say(text, ms = 4000) {
  bubble = { text, until: Date.now() + ms };
  push();
}
function sound(kind) {
  if (store.sound) activeWin()?.webContents.send("sound", kind);
}
// Muhim voqealar notch'da "jonli faoliyat" bo'lib qisqa ochiladi
function activity(kind, text) {
  notchWin?.webContents.send("activity", { kind, text });
}

// ---------- Holatni oynalarga yuborish
function state() {
  const l = left();
  const total = flowing() ? 60 * 60_000 : dur(T.mode);
  const p = plan();
  const today = todaySessions();
  return {
    mode: T.mode,
    running: T.running,
    flowing: flowing(),
    time: fmt(l),
    pct: Math.min(1, total ? l / total : 0),
    label: flowing() ? (T.running ? "Oqimda" : "Erkin fokus") : labels()[T.mode],
    round: secMode() ? `${Math.min(p.longEvery, (T.cycle % p.longEvery) + (T.mode === "focus" ? 1 : 0)) || p.longEvery} / ${p.longEvery}` : "",
    method: method()?.name ?? "Maxsus",
    methodId: store.method,
    methods: METHODS.map((m) => ({ id: m.id, name: m.name, badge: m.badge })),
    canFinish: flowing() && elapsed() >= 60_000,
    started: T.running || (flowing() ? T.flowAcc > 0 : T.remaining < dur(T.mode)),
    celebrate: Date.now() < T.celebrateUntil,
    goalHit: today.length === store.dailyGoal,
    away: T.away,
    today: today.length,
    todayMin: today.reduce((a, s) => a + s.minutes, 0),
    goal: store.dailyGoal,
    streak: streak(),
    hour: new Date().getHours(),
    lastAt: store.sessions.length ? store.sessions[store.sessions.length - 1].at : 0,
    bubble: Date.now() < bubble.until ? bubble.text : "",
    appMode: store.mode,
    outfit: store.outfit,
    bodyShape: store.bodyShape,
    bodyColor: store.bodyColor,
    idleSec: powerMonitor.getSystemIdleTime(),
    scale: store.petScale,
    agents: agents ? agents.snapshot() : null,
    sound: store.sound,
  };
}
const alive = (w) => w && !w.isDestroyed();
const activeWin = () => (store.mode === "notch" ? notchWin : pet);
function push() {
  const s = state();
  if (alive(notchWin)) notchWin.webContents.send("state", s);
  if (alive(pet)) pet.webContents.send("state", s);
}

// Kursor holatini tez-tez (30 marta/soniya) yuboramiz: ko'zlar silliq kuzatadi
let petCatch = false;
let petIgnore = true;
// notch: fayl sudrab kelinganda orol ustida oyna sichqonchani qabul qiladi
let notchCatch = false;
let notchIgnore = true;
let notchHover = false;
function sendCursor() {
  const c = screen.getCursorScreenPoint();
  followCursorDisplay(c);
  if (alive(notchWin) && notchWin.isVisible() && store.mode === "notch") {
    const b = notchWin.getBounds();
    const mid = b.x + b.width / 2;
    const { menuBar } = notchGeometry();
    // faqat menyu satridagi orol qismi — pastdagi ilovalarga bosish to'silmasin
    const inside = Math.abs(c.x - mid) < 150 && c.y >= b.y && c.y < b.y + menuBar + 2;
    notchCatch = inside;
    const ignore = !(notchHover || inside);
    if (ignore !== notchIgnore) {
      notchIgnore = ignore;
      notchWin.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }
  // ish stolidagi kompanyon ustiga kursor kelsa (fayl sudralayotganda ham) — oyna uni qabul qiladi
  if (alive(pet) && pet.isVisible() && !drag && !resizing) {
    const b = pet.getBounds();
    const inside = c.x > b.x + b.width * 0.15 && c.x < b.x + b.width * 0.85 && c.y > b.y + b.height * 0.12 && c.y < b.y + b.height * 0.8;
    petCatch = inside;
    const ignore = !(petHover || inside);
    if (ignore !== petIgnore) {
      petIgnore = ignore;
      pet.setIgnoreMouseEvents(ignore, { forward: true });
    }
  }
  for (const w of [notchWin, pet]) {
    if (!alive(w) || !w.isVisible()) continue;
    const [wx, wy] = w.getPosition();
    w.webContents.send("cursor", { x: c.x - wx, y: c.y - wy });
  }
}

const commonPrefs = () => ({
  preload: path.join(__dirname, "preload.js"),
  backgroundThrottling: false,
  contextIsolation: true,
  sandbox: true,
});
function testHooks(w, file) {
  if (!process.env.DF_SHOT || !file) return;
  w.webContents.on("console-message", (e) => console.log("[renderer]", e.message));
  setTimeout(async () => {
    if (process.env.DF_OPEN) w.webContents.send("test-open");
    if (process.env.DF_RUN) toggle();
    await new Promise((r) => setTimeout(r, Number(process.env.DF_WAIT) || 1800));
    const img = await w.webContents.capturePage();
    fs.writeFileSync(file, img.toPNG());
    app.quit();
  }, 3500);
}

// ---------- Notch oynasi (kamera yonida)
let notchWin = null;
// Notch qaysi ekranda turgani (kursor boshqa ekranga o'tsa, u ham o'tadi)
let notchDisplayId = null;
function notchDisplay() {
  return screen.getAllDisplays().find((x) => x.id === notchDisplayId) ?? screen.getPrimaryDisplay();
}
function notchGeometry(d = notchDisplay()) {
  // Sinov uchun: DF_MB / DF_NOTCH bilan notch'li Mac'ni taqlid qilish mumkin
  const menuBar = Number(process.env.DF_MB) || Math.max(24, d.workArea.y - d.bounds.y);
  // notch faqat MacBook'ning o'z ekranida bo'ladi (menyu satri balandroq)
  const builtIn = d.internal !== false;
  const hasNotch = process.env.DF_NOTCH ? true : builtIn && menuBar >= 30;
  return { d, menuBar, hasNotch, notchW: hasNotch ? Number(process.env.DF_NOTCH) || 184 : 0 };
}
function placeNotch(d) {
  if (!alive(notchWin)) return;
  notchDisplayId = d.id;
  const g = notchGeometry(d);
  notchWin.setBounds({ x: Math.round(d.bounds.x + d.bounds.width / 2 - NOTCH_W / 2), y: d.bounds.y, width: NOTCH_W, height: NOTCH_H });
  notchWin.webContents.send("geom", { mb: g.menuBar, notch: g.notchW });
}
let pendingDisplay = null;
let pendingSince = 0;
function followCursorDisplay(c) {
  if (store.mode !== "notch" || store.hidden || !alive(notchWin)) return;
  const d = screen.getDisplayNearestPoint(c);
  if (d.id === notchDisplay().id) {
    pendingDisplay = null;
    return;
  }
  if (pendingDisplay !== d.id) {
    pendingDisplay = d.id;
    pendingSince = Date.now();
    return;
  }
  if (Date.now() - pendingSince < 250) return;
  pendingDisplay = null;
  placeNotch(d);
}
function createNotchWindow() {
  notchDisplayId = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
  const { d, menuBar, hasNotch, notchW } = notchGeometry();
  notchWin = new BrowserWindow({
    width: NOTCH_W,
    height: NOTCH_H,
    x: Math.round(d.bounds.x + d.bounds.width / 2 - NOTCH_W / 2),
    y: d.bounds.y,
    type: "panel",
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false,
    acceptFirstMouse: true,
    enableLargerThanScreen: true,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: commonPrefs(),
  });
  notchWin.setAlwaysOnTop(true, "screen-saver");
  notchWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notchWin.setIgnoreMouseEvents(true, { forward: true });
  notchWin.loadFile(path.join(__dirname, "renderer", "notch.html"), {
    query: { mb: String(menuBar), notch: String(notchW), hasNotch: hasNotch ? "1" : "0", look: process.env.DF_LOOK ? "1" : "", tab: process.env.DF_TAB || "" },
  });
  notchWin.once("ready-to-show", () => {
    if (store.mode === "notch" && !store.hidden) notchWin.showInactive();
    // macOS menyu satri ustiga chiqishga qarshilik qilsa ham, joyini qayta qo'yamiz
    notchWin.setBounds({ x: Math.round(d.bounds.x + d.bounds.width / 2 - NOTCH_W / 2), y: d.bounds.y, width: NOTCH_W, height: NOTCH_H });
    push();
  });
  testHooks(notchWin, store.mode === "notch" ? process.env.DF_SHOT : null);
}

// ---------- Ish stolidagi kompanyon
let pet = null;
const petSize = () => ({ w: Math.round(PET_W * store.petScale), h: Math.round(PET_H * store.petScale) });
function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  const { w } = petSize();
  // oyoqlari Dock'ning tepasida tursin; pastdagi taymer qatori Dock ustiga tushishi mumkin
  return { x: wa.x + wa.width - w - 24, y: wa.y + wa.height - Math.round(248 * store.petScale) };
}
function clampPos(p) {
  const { w, h } = petSize();
  const d = screen.getDisplayNearestPoint({ x: p.x + w / 2, y: p.y + h / 2 });
  const b = d.bounds;
  return {
    x: Math.round(Math.min(Math.max(p.x, b.x - w / 3), b.x + b.width - (w * 2) / 3)),
    y: Math.round(Math.min(Math.max(p.y, b.y + 20), b.y + b.height - h / 2)),
  };
}
function createPetWindow() {
  const pos = clampPos(store.pos ?? defaultPos());
  const { w, h } = petSize();
  pet = new BrowserWindow({
    width: w,
    height: h,
    x: pos.x,
    y: pos.y,
    type: "panel",
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false, // ishlayotgan dasturdan fokusni o'g'irlamasin
    acceptFirstMouse: true,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: commonPrefs(),
  });
  pet.setAlwaysOnTop(true, "floating");
  pet.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  pet.setIgnoreMouseEvents(true, { forward: true });
  pet.loadFile(path.join(__dirname, "renderer", "index.html"));
  pet.webContents.on("did-finish-load", () => pet.webContents.setZoomFactor(store.petScale));
  pet.once("ready-to-show", () => {
    if (store.mode === "desktop" && !store.hidden) pet.showInactive();
    push();
  });
  testHooks(pet, store.mode === "desktop" ? process.env.DF_SHOT : null);
}

function applyVisibility() {
  const showNotch = store.mode === "notch" && !store.hidden;
  const showPet = store.mode === "desktop" && !store.hidden;
  if (alive(notchWin)) showNotch ? notchWin.showInactive() : notchWin.hide();
  if (alive(pet)) showPet ? pet.showInactive() : pet.hide();
  rebuildMenu();
  push();
}
function setHidden(h) {
  store.hidden = h;
  saveStore();
  applyVisibility();
}
function setAppMode(m) {
  if (store.mode === m) return;
  store.mode = m;
  store.hidden = false;
  saveStore();
  if (m === "desktop") {
    // notch tagidan tushib, ekran pastiga yetib keladi
    const { d } = notchGeometry();
    const { w } = petSize();
    pet.setPosition(Math.round(d.bounds.x + d.bounds.width / 2 - w / 2), d.bounds.y + 30);
    applyVisibility();
    pet.webContents.send("arrive");
    const target = clampPos(store.pos ?? defaultPos());
    glide(target.x, target.y, 900);
    say("Ish stoliga tushdim! Meni surib qo'ysang bo'ladi.", 5000);
  } else {
    applyVisibility();
    activity("start", "Notch'ga qaytdim 👋");
  }
}

// Oynani silliq ko'chirish (tushish va yurish uchun)
let glideTimer = null;
function glide(tx, ty, ms, onDone) {
  clearInterval(glideTimer);
  const [sx, sy] = pet.getPosition();
  const t0 = Date.now();
  glideTimer = setInterval(() => {
    const k = Math.min(1, (Date.now() - t0) / ms);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    pet.setPosition(Math.round(sx + (tx - sx) * e), Math.round(sy + (ty - sy) * e));
    if (k >= 1) {
      clearInterval(glideTimer);
      glideTimer = null;
      onDone?.();
    }
  }, 16);
}

// ---------- Ish stolida yurish
let petHover = false;
let walking = false;
let nextWalkAt = Date.now() + 15_000;
function maybeWalk() {
  if (store.mode !== "desktop" || store.hidden || !store.roam || walking || drag || resizing || petHover) return;
  if (T.running && T.mode === "focus") return; // fokus paytida jim o'tiradi
  if (Date.now() < nextWalkAt) return;
  nextWalkAt = Date.now() + 20_000 + Math.random() * 40_000;
  const [x, y] = pet.getPosition();
  const { w } = petSize();
  const wa = screen.getDisplayNearestPoint({ x, y }).workArea;
  const minX = wa.x + 10;
  const maxX = wa.x + wa.width - w - 10;
  let tx = x + (Math.random() < 0.5 ? -1 : 1) * (120 + Math.random() * 360);
  tx = Math.max(minX, Math.min(maxX, tx));
  if (Math.abs(tx - x) < 60) return;
  walking = true;
  pet.webContents.send("walk", { on: true, dir: tx > x ? 1 : -1 });
  const speed = 70 * store.petScale; // px/soniya
  const ms = (Math.abs(tx - x) / speed) * 1000;
  const t0 = Date.now();
  clearInterval(glideTimer);
  glideTimer = setInterval(() => {
    if (drag || petHover) {
      stopWalk();
      return;
    }
    const k = Math.min(1, (Date.now() - t0) / ms);
    pet.setPosition(Math.round(x + (tx - x) * k), y);
    if (k >= 1) stopWalk();
  }, 16);
}
function stopWalk() {
  clearInterval(glideTimer);
  glideTimer = null;
  if (!walking) return;
  walking = false;
  pet.webContents.send("walk", { on: false });
  const [x, y] = pet.getPosition();
  store.pos = { x, y };
  saveStore();
}

// ---------- Momiq: Claude obunasi (kompyuterdagi Claude Code) orqali savol-javob — API kalit kerak emas
const MOMIQ_SYS =
  "Sen Momiq — DeepFokus fokus ilovasidagi yoqimtoy kompanyon yordamchisan. Odatda o'zbek tilida, samimiy, qisqa va aniq gaplash. " +
  "Foydalanuvchi qaysi tilda yozsa yoki gapirsa, o'sha tilda javob ber; agar u «falon tilda gapir» desa, keyingi javoblarni to'liq o'sha tilda ber, u boshqa til so'ramaguncha. " +
  "Fayl berilsa, uni o'qib, mazmunini va eng muhim jihatlarini tushuntir.";
const MOMIQ_VOICE_SYS =
  "Hozir OVOZLI suhbat: javobing ovoz bilan o'qib beriladi. 1–3 jumla, jonli so'zlashuv tilida, ro'yxat, markdown, kod va emoji ishlatma. " +
  "Javob oxirida alohida qatorda javob tilini ISO 639-1 kodi bilan yoz, masalan: [lang: uz]";
let chatWin = null;
let chatLog = [];
let chatContinue = false;
let chatBusy = false;
let claudeEnv = null;
function findClaude() {
  if (claudeEnv) return Promise.resolve(claudeEnv);
  return new Promise((resolve) => {
    const home = os.homedir();
    const extra = [
      path.join(home, ".claude", "local"),
      path.join(home, ".local", "bin"),
      path.join(home, ".npm-global", "bin"),
      path.join(home, ".bun", "bin"),
      "/opt/homebrew/bin",
      "/usr/local/bin",
    ];
    try {
      const nvm = path.join(home, ".nvm", "versions", "node");
      for (const v of fs.readdirSync(nvm)) extra.push(path.join(nvm, v, "bin"));
    } catch {}
    let out = "";
    const p = spawn("/bin/zsh", ["-lc", 'printf "%s\\n" "$PATH"; command -v claude || true'], { env: process.env });
    const done = () => {
      const [pth, bin] = out.trim().split("\n");
      const PATH = [pth || process.env.PATH || "", ...extra].join(":");
      let claude = (bin || "").trim();
      if (!claude || !fs.existsSync(claude)) claude = extra.map((d) => path.join(d, "claude")).find((f) => fs.existsSync(f)) || "";
      claudeEnv = { PATH, claude };
      resolve(claudeEnv);
    };
    p.stdout.on("data", (d) => (out += d));
    p.on("close", done);
    p.on("error", done);
    setTimeout(() => p.kill(), 6000);
  });
}
function chatPush() {
  if (alive(chatWin)) chatWin.webContents.send("chat", { log: chatLog, busy: chatBusy });
}
function openChat() {
  const W = 380;
  const H = 480;
  let x, y;
  if (store.mode === "desktop" && alive(pet)) {
    const b = pet.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    x = b.x + b.width + 8 + W > wa.x + wa.width ? b.x - W - 8 : b.x + b.width + 8;
    y = Math.max(wa.y + 8, Math.min(b.y, wa.y + wa.height - H - 8));
  } else {
    const { d, menuBar } = notchGeometry();
    x = Math.round(d.bounds.x + d.bounds.width / 2 - W / 2);
    y = d.bounds.y + menuBar + 10;
  }
  if (!alive(chatWin)) {
    chatWin = new BrowserWindow({
      width: W, height: H, x: Math.round(x), y: Math.round(y),
      frame: false, transparent: false, resizable: false, hasShadow: true, roundedCorners: true,
      skipTaskbar: true, fullscreenable: false, show: false, backgroundColor: "#121214",
      webPreferences: commonPrefs(),
    });
    chatWin.setAlwaysOnTop(true, "floating");
    chatWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    chatWin.loadFile(path.join(__dirname, "renderer", "chat.html"));
    chatWin.once("ready-to-show", () => {
      chatWin.show();
      chatPush();
    });
  } else {
    chatWin.setPosition(Math.round(x), Math.round(y));
    chatWin.show();
    chatWin.focus();
    chatPush();
  }
}
async function askMomiq(text, files = [], opts = {}) {
  if (chatBusy) return;
  const viaVoice = !!opts.voice;
  files = files.filter((f) => typeof f === "string" && f && fs.existsSync(f));
  text = String(text || "").trim();
  if (!text && !files.length) return;
  openChat();
  const names = files.map((f) => path.basename(f));
  chatLog.push({ role: "user", text: text || "", files: names, voice: viaVoice });
  chatBusy = true;
  chatPush();
  const finish = (reply, error = false) => {
    chatBusy = false;
    let lang = "";
    if (viaVoice && !error) {
      const m = reply.match(/\n?\s*\[lang:\s*([a-z]{2,3})\]\s*$/i);
      if (m) {
        lang = m[1].toLowerCase();
        reply = reply.slice(0, m.index).trim();
      }
    }
    chatLog.push({ role: "momiq", text: reply, error, voice: viaVoice });
    chatPush();
    if (store.mode === "desktop" && !error) say("Javob tayyor! 👻", 3500);
    if (viaVoice && !error && store.voiceReply !== false) speakOut(reply, lang);
  };
  const { PATH, claude } = await findClaude();
  if (!claude) {
    return finish(
      "Kompyuterda Claude Code topilmadi. Terminalda bir marta shuni bajaring:\n\nnpm install -g @anthropic-ai/claude-code\nclaude\n\nkeyin Claude obunangiz bilan kiring. Shundan so'ng men obunangiz orqali javob beraman, API kalit kerak emas.",
      true,
    );
  }
  let prompt = text;
  if (files.length) {
    const list = files.map((f) => `- ${f}`).join("\n");
    prompt = `${text || "Shu fayl(lar)ni ko'rib chiq: nima ekanini va eng muhim jihatlarini qisqa tushuntirib ber."}\n\nFayllar:\n${list}`;
  }
  const dir = path.join(app.getPath("userData"), "momiq");
  fs.mkdirSync(dir, { recursive: true });
  const args = ["-p", prompt, "--output-format", "text", "--append-system-prompt", viaVoice ? `${MOMIQ_SYS}\n${MOMIQ_VOICE_SYS}` : MOMIQ_SYS];
  if (chatContinue) args.push("--continue");
  if (files.length) {
    args.push("--allowedTools", "Read");
    for (const d of new Set(files.map((f) => path.dirname(f)))) args.push("--add-dir", d);
  }
  let out = "";
  let err = "";
  let p;
  try {
    // stdin yopiq: aks holda Claude Code kirish kutib, ogohlantirish beradi
    p = spawn(claude, args, { cwd: dir, env: { ...process.env, PATH }, stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    return finish(`Claude Code'ni ishga tushirib bo'lmadi: ${e.message}`, true);
  }
  const killer = setTimeout(() => p.kill(), 240_000);
  p.stdout.on("data", (d) => (out += d));
  p.stderr.on("data", (d) => (err += d));
  p.on("error", (e) => {
    clearTimeout(killer);
    finish(`Claude Code'ni ishga tushirib bo'lmadi: ${e.message}`, true);
  });
  p.on("close", (code) => {
    clearTimeout(killer);
    const AUTH = /failed to authenticate|oauth|not logged in|please run \/login|invalid api key|unauthorized/i;
    if (AUTH.test(out) || AUTH.test(err))
      return finish("Claude Code'ga kirish muddati tugagan. Terminalni ochib `claude` deb yozing, keyin `/login` orqali Claude obunangiz bilan qayta kiring. Shundan keyin menga yana yozing 👻", true);
    if (out.trim() && (code === 0 || !/error/i.test(out.slice(0, 40)))) {
      chatContinue = true;
      return finish(out.trim());
    }
    // ogohlantirish qatorlarini olib tashlaymiz, faqat haqiqiy xato qoladi
    const msg = (err || out)
      .split("\n")
      .filter((l) => l.trim() && !/^warning:|no stdin data/i.test(l.trim()))
      .join("\n")
      .trim();
    if (/log ?in|auth|credential|api key|unauthor/i.test(msg))
      return finish("Claude Code'ga kirilmagan. Terminalda `claude` ni ishga tushirib, /login orqali Claude obunangiz bilan kiring.", true);
    finish(msg ? `Xato: ${msg.slice(0, 600)}` : "Javob kelmadi, qaytadan urinib ko'ring.", true);
  });
}
ipcMain.on("chat-send", (_e, m) => askMomiq(m?.text, Array.isArray(m?.files) ? m.files : []));

// ---------- Ovoz: eshitish (ElevenLabs Scribe) → Claude → gapirish (Eleven v3)
function voiceStatus(status, extra = {}) {
  for (const w of [chatWin, notchWin, pet]) if (alive(w)) w.webContents.send("voice", { status, ...extra });
}
async function speakOut(text, lang = "") {
  if (!voice.hasKey() || !text) return;
  try {
    voiceStatus("speaking");
    const mp3 = await voice.speak(text, store.voiceId || "", lang);
    if (alive(chatWin)) chatWin.webContents.send("voice-audio", mp3.toString("base64"));
    else voiceStatus("idle");
  } catch (e) {
    voiceStatus("error", { message: e.message });
  }
}
ipcMain.handle("voice-stt", async (_e, { data, mime }) => {
  try {
    voiceStatus("thinking");
    const buf = Buffer.from(data, "base64");
    const r = await voice.transcribe(buf, mime || "audio/webm", store.voiceLang || "");
    if (!r.text) {
      voiceStatus("idle");
      return { ok: true, text: "" };
    }
    askMomiq(r.text, [], { voice: true, lang: r.lang });
    return { ok: true, text: r.text, lang: r.lang };
  } catch (e) {
    voiceStatus("error", { message: e.message });
    return { ok: false, error: e.message };
  }
});
ipcMain.on("voice-done", () => voiceStatus("idle"));
ipcMain.on("voice-listening", () => voiceStatus("listening"));
ipcMain.on("voice-say", (_e, text) => speakOut(String(text || "")));
ipcMain.handle("voice-settings", async () => {
  let voices = [];
  let account = null;
  if (voice.hasKey()) {
    try {
      voices = await voice.voices();
      account = await voice.check();
    } catch (e) {
      account = { ok: false, error: e.message };
    }
  }
  return { hasKey: voice.hasKey(), voices, account, voiceId: store.voiceId || "", voiceReply: store.voiceReply !== false, voiceLang: store.voiceLang || "" };
});
ipcMain.on("voice-config", (_e, c) => {
  if (typeof c?.key === "string") voice.setKey(c.key);
  if (typeof c?.voiceId === "string") store.voiceId = c.voiceId;
  if (typeof c?.voiceReply === "boolean") store.voiceReply = c.voiceReply;
  if (typeof c?.voiceLang === "string") store.voiceLang = c.voiceLang;
  saveStore();
  push();
});
function startVoice() {
  openChat();
  setTimeout(() => alive(chatWin) && chatWin.webContents.send("voice-start"), alive(chatWin) && chatWin.isVisible() ? 50 : 500);
}
ipcMain.on("chat-new", () => {
  if (chatBusy) return;
  chatLog = [];
  chatContinue = false;
  chatPush();
});
ipcMain.on("chat-close", () => alive(chatWin) && chatWin.hide());
ipcMain.on("chat-files", (_e, files) => askMomiq("", Array.isArray(files) ? files : []));
ipcMain.handle("file-icon", async (_e, f) => {
  try {
    return (await app.getFileIcon(String(f), { size: "large" })).toDataURL();
  } catch {
    return "";
  }
});

// ---------- Sudrash va kattalashtirish
let drag = null;
let resizing = null;
const okNum = (n) => typeof n === "number" && Number.isFinite(n);
const DRAG_MAX_MS = 20000; // xavfsizlik: sudrash/kattalashtirish hech qachon cheksiz davom etmaydi
ipcMain.on("drag-start", (_e, off) => {
  stopWalk();
  clearInterval(drag);
  clearInterval(resizing);
  resizing = null;
  if (!off || !okNum(off.x) || !okNum(off.y)) return;
  const z = okNum(store.petScale) ? store.petScale : 1;
  const t0 = Date.now();
  drag = setInterval(() => {
    if (!pet || pet.isDestroyed() || Date.now() - t0 > DRAG_MAX_MS) return endDrag();
    const c = screen.getCursorScreenPoint();
    const x = Math.round(c.x - off.x * z);
    const y = Math.round(c.y - off.y * z);
    if (okNum(x) && okNum(y)) pet.setPosition(x, y);
  }, 12);
});
function endDrag() {
  clearInterval(drag);
  drag = null;
  if (!pet || pet.isDestroyed()) return;
  const [x, y] = pet.getPosition();
  const p = clampPos({ x, y });
  pet.setPosition(p.x, p.y);
  store.pos = p;
  saveStore();
}
ipcMain.on("drag-end", () => endDrag());
function setScale(z) {
  if (!okNum(z) || !pet || pet.isDestroyed()) return;
  z = Math.round(Math.max(0.55, Math.min(1.8, z)) * 100) / 100;
  const [x, y] = pet.getPosition();
  const old = petSize();
  store.petScale = z;
  const { w, h } = petSize();
  // pastki o'rta nuqta joyida qolsin (oyoqlari sakramasin)
  pet.setBounds({ x: Math.round(x + old.w / 2 - w / 2), y: Math.round(y + old.h - h), width: w, height: h });
  pet.webContents.setZoomFactor(z);
  saveStore();
  push();
}
ipcMain.on("resize-start", () => {
  stopWalk();
  clearInterval(drag);
  drag = null;
  const c0 = screen.getCursorScreenPoint();
  const z0 = okNum(store.petScale) ? store.petScale : 1;
  const t0 = Date.now();
  clearInterval(resizing);
  resizing = setInterval(() => {
    if (Date.now() - t0 > DRAG_MAX_MS) return endResize();
    const c = screen.getCursorScreenPoint();
    setScale(z0 + (c.x - c0.x + (c.y - c0.y)) / 260);
  }, 30);
});
ipcMain.on("resize-end", () => endResize());
function endResize() {
  clearInterval(resizing);
  resizing = null;
  if (!pet || pet.isDestroyed()) return;
  const [x, y] = pet.getPosition();
  store.pos = clampPos({ x, y });
  saveStore();
  rebuildMenu();
}

ipcMain.on("interactive", (e, on) => {
  const w = BrowserWindow.fromWebContents(e.sender);
  if (w === pet) {
    const ignore = !(on || petCatch);
    petIgnore = ignore;
    w.setIgnoreMouseEvents(ignore, { forward: true });
  } else if (w === notchWin) {
    notchHover = on;
    const ignore = !(on || notchCatch);
    notchIgnore = ignore;
    w.setIgnoreMouseEvents(ignore, { forward: true });
  } else w?.setIgnoreMouseEvents(!on, { forward: true });
  if (w === pet) {
    petHover = on;
    if (on) stopWalk();
  }
});
// ---------- Agentlar (Claude Code va boshqalar)
let agents = null;
ipcMain.on("agent", (_e, c, arg) => {
  if (!agents) return;
  if (c === "approve") agents.answer(String(arg?.id || ""), arg?.decision ?? null);
  else if (c === "install") agents.install(String(arg));
  else if (c === "uninstall") agents.uninstall(String(arg));
  else if (c === "active") agents.setActive(String(arg?.id), !!arg?.on);
  else if (c === "nasiya") agents.setNasiya(arg || {});
  else if (c === "notify") {
    store.agentNotify = !!arg;
    saveStore();
    push();
  } else if (c === "open" && typeof arg === "string" && arg) shell.openPath(arg);
  else if (c === "demo") agents.demo();
  else if (c === "sound") {
    store.sound = !!arg;
    saveStore();
    push();
  }
});

ipcMain.on("cmd", (_e, c, arg) => {
  if (c === "toggle") toggle();
  else if (c === "skip") skip();
  else if (c === "reset") reset();
  else if (c === "menu") tray?.popUpContextMenu();
  else if (c === "chat") openChat();
  else if (c === "voice") startVoice();
  else if (c === "method") chooseMethod(arg);
  else if (c === "desktop") setAppMode("desktop");
  else if (c === "notch") setAppMode("notch");
  else if (c === "big") openBig();
  else if (c === "scale") setScale(arg);
  else if (c === "look") {
    if (arg?.outfit) store.outfit = String(arg.outfit);
    if (arg?.shape) store.bodyShape = String(arg.shape);
    if (arg?.color) store.bodyColor = arg.color === "none" ? "" : String(arg.color);
    saveStore();
    push();
  }
});
ipcMain.on("poke", () => {
  if (!bubble.text || Date.now() > bubble.until)
    say(pick(["Hey! 😄", "Qitiq bo'lyapti!", "Ishla, ishla 🙂", "Men shu yerdaman!", "Diqqat bilan!"]), 2500);
});

// ---------- Katta oyna: to'liq DeepFokus (vazifalar, statistika, hisob)
let big = null;
function openBig() {
  if (alive(big)) {
    big.show();
    big.focus();
    return;
  }
  big = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 420,
    minHeight: 600,
    title: "DeepFokus",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#F5F5F7",
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  app.dock?.show();
  big.loadURL(WEB_URL);
  big.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  big.on("closed", () => {
    big = null;
    app.dock?.hide();
  });
}

// ---------- Menyu satri
let tray = null;
let lastTitle = "";
function trayTitle() {
  if (store.mode === "notch" && !store.hidden) return ""; // vaqt notch'da ko'rinib turadi
  if (!T.running && !(flowing() && T.flowAcc > 0) && T.remaining === dur(T.mode)) return "";
  const icon = T.mode === "focus" ? (secMode() ? "🔥" : "🎧") : "☕";
  return ` ${icon} ${fmt(left())}${T.running ? "" : " ⏸"}`;
}
function rebuildMenu() {
  if (!tray) return;
  const run = T.running;
  const today = todaySessions();
  const mins = today.reduce((a, s) => a + s.minutes, 0);
  const sizes = [
    ["Kichik", 0.75],
    ["O'rta", 1],
    ["Katta", 1.35],
  ];
  const menu = Menu.buildFromTemplate([
    { label: `${method()?.name ?? "Maxsus"} · ${flowing() ? "Erkin fokus" : labels()[T.mode]}`, enabled: false },
    { label: run ? "Pauza" : T.mode === "focus" ? "Fokusni boshlash" : "Tanaffusni boshlash", accelerator: "Alt+Cmd+F", click: toggle },
    { label: flowing() ? "Tanaffus qilish" : T.mode === "focus" ? "Tanaffusga o'tish" : "Fokusga o'tish", click: skip },
    { label: "Qaytadan", click: reset },
    { type: "separator" },
    {
      label: "Usul",
      submenu: METHODS.map((m) => ({
        label: `${m.name}  (${m.badge})`,
        type: "radio",
        checked: store.method === m.id,
        click: () => chooseMethod(m.id),
      })),
    },
    { type: "separator" },
    { label: `Bugun: ${today.length} / ${store.dailyGoal} sprint · ${mins} daq`, enabled: false },
    { label: `🔥 Streak: ${streak()} kun`, enabled: false },
    { type: "separator" },
    {
      label: "Kompanyon qayerda yashaydi",
      submenu: [
        { label: "Notch'da (kamera yonida)", type: "radio", checked: store.mode === "notch", click: () => setAppMode("notch") },
        { label: "Ish stolida", type: "radio", checked: store.mode === "desktop", click: () => setAppMode("desktop") },
      ],
    },
    {
      label: "Kattaligi (ish stolida)",
      submenu: sizes.map(([l, z]) => ({
        label: l,
        type: "radio",
        checked: Math.abs(store.petScale - z) < 0.05,
        click: () => setScale(z),
      })),
    },
    { label: "Ish stolida yurib yursin", type: "checkbox", checked: store.roam, click: (i) => ((store.roam = i.checked), saveStore()) },
    { label: store.hidden ? "Kompanyonni ko'rsatish" : "Kompanyonni yashirish", accelerator: "Alt+Cmd+H", click: () => setHidden(!store.hidden) },
    {
      label: "Kompanyonni joyiga qaytarish",
      click: () => {
        store.pos = defaultPos();
        if (alive(pet)) pet.setPosition(store.pos.x, store.pos.y);
        saveStore();
        setHidden(false);
      },
    },
    { type: "separator" },
    { label: "To'liq oynani ochish", accelerator: "Alt+Cmd+D", click: openBig },
    { label: "Momiq'dan so'rash", accelerator: "Alt+Cmd+M", click: openChat },
    { label: "Momiq bilan gaplashish", accelerator: "Alt+Cmd+V", click: startVoice },
    { label: "Ovoz", type: "checkbox", checked: store.sound, click: (i) => ((store.sound = i.checked), saveStore()) },
    {
      label: "Kompyuter yonganda ochilsin",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { type: "separator" },
    { label: "Chiqish", accelerator: "Cmd+Q", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

// ---------- Asosiy sikl
function tick() {
  if (T.running && !flowing() && left() <= 0) complete();

  if (T.running && T.mode === "focus" && !secMode() && !flowing()) {
    const total = dur("focus");
    const l = left();
    if (!T.halfSaid && total >= 10 * 60_000 && l < total / 2) {
      T.halfSaid = true;
      say(pick(["Yarmiga keldik, zo'r ketyapsan!", "Yarim yo'l bosib o'tildi 💪"]), 4000);
    }
    if (!T.lastSaid && total >= 5 * 60_000 && l < 60_000) {
      T.lastSaid = true;
      say("Oxirgi daqiqa! Fikringni yakunla.", 4000);
    }
  }

  const title = trayTitle();
  if (title !== lastTitle) {
    tray?.setTitle(title, { fontType: "monospacedDigit" });
    lastTitle = title;
  }
  maybeWalk();
  push();
}

// Kompyuterdan uzoqlashganini sezish (fokus paytida 5 daqiqa harakatsiz)
let idleNudgeAt = Date.now();
function watchIdle() {
  const idle = powerMonitor.getSystemIdleTime();
  const focusRunning = T.running && T.mode === "focus" && !secMode();
  if (focusRunning && idle >= 300 && !T.away) {
    T.away = true;
    say("Qayerga ketding? Fokus davom etyapti 👀", 8000);
  } else if (T.away && idle < 5) {
    T.away = false;
    say("Xush kelibsan! Davom etamiz.", 4000);
  }
  if (!focusRunning) T.away = false;

  // Uzoq vaqt fokus bo'lmasa, kunduzi ohista eslatib qo'yadi
  const h = new Date().getHours();
  if (!T.running && idle < 60 && h >= 9 && h < 22 && Date.now() - idleNudgeAt > 50 * 60_000) {
    idleNudgeAt = Date.now();
    say(todaySessions().length ? "Yana bitta sprint qilamizmi? ⌥⌘F" : "Bugun hali boshlamadik. 25 daqiqa? ⌥⌘F", 7000);
  }
}

app.whenReady().then(() => {
  store.agentNotify ??= true;
  agents = createAgents({ store, saveStore, onChange: () => push(), say, sound: (k) => store.sound && activeWin()?.webContents.send("sound", k) });
  agents.start();
  if (process.env.DF_DEMO) setTimeout(() => agents.demo(), 2500);
  loadStore();
  if (process.env.DF_MODE) store.mode = process.env.DF_MODE;
  T.remaining = dur("focus");
  app.dock?.hide();

  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("DeepFokus");
  rebuildMenu();
  createNotchWindow();
  createPetWindow();

  globalShortcut.register("Alt+Command+F", toggle);
  globalShortcut.register("Alt+Command+H", () => setHidden(!store.hidden));
  globalShortcut.register("Alt+Command+D", openBig);
  globalShortcut.register("Alt+Command+M", openChat);
  globalShortcut.register("Alt+Command+V", startVoice);

  setInterval(tick, 250);
  setInterval(sendCursor, 33);
  setInterval(watchIdle, 5000);
  powerMonitor.on("lock-screen", () => {
    if (T.running && T.mode === "focus") say("Qaytganingda davom etamiz.", 5000);
  });
  const replace = () => placeNotch(notchDisplay());
  screen.on("display-metrics-changed", replace);
  screen.on("display-added", replace);
  screen.on("display-removed", replace);
  if (process.env.DF_VOICETEST) {
    setTimeout(async () => {
      voice.setKey("test-key");
      try {
        const r = await voice.transcribe(Buffer.from("xx"), "audio/webm");
        console.log("[voicetest] stt:", JSON.stringify(r));
        await askMomiq(r.text, [], { voice: true, lang: r.lang });
      } catch (e) {
        console.log("[voicetest] err:", e.message);
      }
    }, 1500);
    setTimeout(async () => {
      if (alive(chatWin)) fs.writeFileSync("/tmp/chatwin.png", (await chatWin.webContents.capturePage()).toPNG());
      console.log("[voicetest] log:", JSON.stringify(chatLog));
      app.quit();
    }, 9000);
  }
  if (process.env.DF_ASK) {
    setTimeout(() => askMomiq(process.env.DF_ASK, process.env.DF_ASKFILE ? [process.env.DF_ASKFILE] : []), 1500);
    setTimeout(async () => {
      if (alive(chatWin)) fs.writeFileSync("/tmp/chatwin.png", (await chatWin.webContents.capturePage()).toPNG());
      app.quit();
    }, 6000);
  }
  setTimeout(() => say(todaySessions().length ? "Qaytding! Davom etamizmi?" : "Salom! Bugun nimaga fokus qilamiz?", 5000), 1200);
});

app.on("second-instance", () => setHidden(false));
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", (e) => e.preventDefault());
