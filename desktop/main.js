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
const { METHODS, methodById } = require("./shared/methods.js");

if (!app.requestSingleInstanceLock()) app.quit();

const WEB_URL = "https://deepfocus-gilt.vercel.app";
const WIN_W = 230;
const WIN_H = 330;

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
  sessions: [],
};
let store = { ...DEFAULTS };
function loadStore() {
  try {
    store = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(storePath(), "utf8")) };
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
    if (T.mode === "focus")
      say(pick(["Boshladik! Men shu yerdaman.", "Telefonni chetga qo'yamiz 🙂", "Bitta ish, to'liq diqqat."]), 4000);
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
  if (store.sound) win?.webContents.send("sound", kind);
}

// ---------- Holatni oynaga yuborish
function state() {
  const l = left();
  const total = flowing() ? 60 * 60_000 : dur(T.mode);
  const p = plan();
  return {
    mode: T.mode,
    running: T.running,
    flowing: flowing(),
    time: fmt(l),
    pct: Math.min(1, total ? l / total : 0),
    label: flowing() ? (T.running ? "Oqimda" : "Erkin fokus") : labels()[T.mode],
    round: secMode() ? `${Math.min(p.longEvery, (T.cycle % p.longEvery) + (T.mode === "focus" ? 1 : 0)) || p.longEvery} / ${p.longEvery}` : "",
    method: method()?.name ?? "Maxsus",
    canFinish: flowing() && elapsed() >= 60_000,
    started: T.running || (flowing() ? T.flowAcc > 0 : T.remaining < dur(T.mode)),
    celebrate: Date.now() < T.celebrateUntil,
    goalHit: todaySessions().length === store.dailyGoal,
    away: T.away,
    today: todaySessions().length,
    hour: new Date().getHours(),
    lastAt: store.sessions.length ? store.sessions[store.sessions.length - 1].at : 0,
    bubble: Date.now() < bubble.until ? bubble.text : "",
    look: lookX(),
  };
}
// Ko'zlari ekrandagi kursor ortidan qaraydi
function lookX() {
  if (!win || win.isDestroyed()) return 0;
  const [wx] = win.getPosition();
  const c = screen.getCursorScreenPoint();
  return Math.max(-1, Math.min(1, (c.x - (wx + WIN_W / 2)) / 500));
}
function push() {
  win?.webContents.send("state", state());
}

// ---------- Kompanyon oynasi
let win = null;
function defaultPos() {
  const wa = screen.getPrimaryDisplay().workArea;
  // oyoqlari Dock'ning tepasida tursin; pastdagi taymer qatori Dock ustiga tushishi mumkin
  return { x: wa.x + wa.width - WIN_W - 24, y: wa.y + wa.height - 248 };
}
function clampPos(p) {
  const d = screen.getDisplayNearestPoint({ x: p.x + WIN_W / 2, y: p.y + WIN_H / 2 });
  const b = d.bounds;
  return {
    x: Math.round(Math.min(Math.max(p.x, b.x - WIN_W / 3), b.x + b.width - (WIN_W * 2) / 3)),
    y: Math.round(Math.min(Math.max(p.y, b.y), b.y + b.height - WIN_H / 2)),
  };
}
function createWindow() {
  const pos = clampPos(store.pos ?? defaultPos());
  win = new BrowserWindow({
    width: WIN_W,
    height: WIN_H,
    x: pos.x,
    y: pos.y,
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    skipTaskbar: true,
    focusable: false, // ishlayotgan dasturdan fokusni o'g'irlamasin
    acceptFirstMouse: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Shaffof joylar orqali bosish ostidagi oynaga o'tsin; kompanyon ustida esa ushlaymiz
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, "renderer", "index.html"));
  // Sinov rejimi: oynani rasmga olib chiqib ketadi
  if (process.env.DF_SHOT) {
    win.webContents.on("console-message", (e) => console.log("[renderer]", e.message));
    setTimeout(async () => {
      if (process.env.DF_HOVER) win.webContents.executeJavaScript("document.querySelectorAll('.hit').forEach(el=>el.dispatchEvent(new MouseEvent('mouseenter')))");
      if (process.env.DF_RUN) toggle();
      await new Promise((r) => setTimeout(r, 1500));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(process.env.DF_SHOT, img.toPNG());
      app.quit();
    }, 3500);
  }
  win.once("ready-to-show", () => {
    if (!store.hidden) win.showInactive();
    push();
  });
}

function setHidden(h) {
  store.hidden = h;
  saveStore();
  if (h) win?.hide();
  else win?.showInactive();
  rebuildMenu();
}

// Sudrash: kursor ortidan oynani suramiz
let drag = null;
ipcMain.on("drag-start", (_e, off) => {
  clearInterval(drag);
  drag = setInterval(() => {
    const c = screen.getCursorScreenPoint();
    win.setPosition(Math.round(c.x - off.x), Math.round(c.y - off.y));
  }, 12);
});
ipcMain.on("drag-end", () => {
  clearInterval(drag);
  drag = null;
  const [x, y] = win.getPosition();
  const p = clampPos({ x, y });
  win.setPosition(p.x, p.y);
  store.pos = p;
  saveStore();
});
ipcMain.on("interactive", (_e, on) => win?.setIgnoreMouseEvents(!on, { forward: true }));
ipcMain.on("cmd", (_e, c) => {
  if (c === "toggle") toggle();
  else if (c === "skip") skip();
  else if (c === "reset") reset();
  else if (c === "menu") tray?.popUpContextMenu();
});
ipcMain.on("poke", () => {
  if (!bubble.text || Date.now() > bubble.until)
    say(pick(["Hey! 😄", "Qitiq bo'lyapti!", "Ishla, ishla 🙂", "Men shu yerdaman!", "Diqqat bilan!"]), 2500);
});

// ---------- Menyu satri
let tray = null;
let lastTitle = "";
function trayTitle() {
  if (!T.running && !(flowing() && T.flowAcc > 0) && T.remaining === dur(T.mode)) return "";
  const icon = T.mode === "focus" ? (secMode() ? "🔥" : "🎧") : "☕";
  return ` ${icon} ${fmt(left())}${T.running ? "" : " ⏸"}`;
}
function rebuildMenu() {
  if (!tray) return;
  const run = T.running;
  const today = todaySessions();
  const mins = today.reduce((a, s) => a + s.minutes, 0);
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
    { label: store.hidden ? "Kompanyonni ko'rsatish" : "Kompanyonni yashirish", accelerator: "Alt+Cmd+H", click: () => setHidden(!store.hidden) },
    {
      label: "Kompanyonni joyiga qaytarish",
      click: () => {
        store.pos = defaultPos();
        win.setPosition(store.pos.x, store.pos.y);
        saveStore();
        setHidden(false);
      },
    },
    { label: "Ovoz", type: "checkbox", checked: store.sound, click: (i) => ((store.sound = i.checked), saveStore()) },
    {
      label: "Kompyuter yonganda ochilsin",
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (i) => app.setLoginItemSettings({ openAtLogin: i.checked }),
    },
    { type: "separator" },
    { label: "DeepFokus saytini ochish", click: () => shell.openExternal(WEB_URL) },
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
  loadStore();
  T.remaining = dur("focus");
  app.dock?.hide();

  const icon = nativeImage.createFromPath(path.join(__dirname, "assets", "trayTemplate.png"));
  icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("DeepFokus");
  rebuildMenu();
  createWindow();

  globalShortcut.register("Alt+Command+F", toggle);
  globalShortcut.register("Alt+Command+H", () => setHidden(!store.hidden));

  setInterval(tick, 250);
  setInterval(watchIdle, 5000);
  powerMonitor.on("lock-screen", () => {
    if (T.running && T.mode === "focus") say("Qaytganingda davom etamiz.", 5000);
  });
  setTimeout(() => say(todaySessions().length ? "Qaytding! Davom etamizmi?" : "Salom! Bugun nimaga fokus qilamiz?", 5000), 1200);
});

app.on("second-instance", () => setHidden(false));
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", (e) => e.preventDefault());
