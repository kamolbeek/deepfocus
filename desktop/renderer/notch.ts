// Notch'dagi kompanyon: Coucou kabi ixcham orol, kichrayib qoladigan mini holat,
// kursorga qaraydigan, uxlab-uyg'onadigan, silasa yurakcha bo'ladigan kompanyon va ochiladigan panel.
import type { BodyShape, Outfit } from "./buddy/engine";
import { GhostSprite, GHOST_ORIGINAL, ghostReady, type GhostEmote } from "./ghost";

type State = {
  mode: "focus" | "short" | "long";
  running: boolean;
  flowing: boolean;
  time: string;
  label: string;
  round: string;
  method: string;
  methodId: string;
  methods: { id: string; name: string; badge: string }[];
  canFinish: boolean;
  started: boolean;
  celebrate: boolean;
  goalHit: boolean;
  away: boolean;
  today: number;
  todayMin: number;
  goal: number;
  streak: number;
  hour: number;
  lastAt: number;
  bubble: string;
  idleSec: number;
  outfit: Outfit;
  bodyShape: BodyShape;
  bodyColor: string;
};

declare global {
  interface Window {
    df: {
      onState: (cb: (s: State) => void) => void;
      onCursor: (cb: (c: { x: number; y: number }) => void) => void;
      onActivity: (cb: (a: { kind: string; text: string }) => void) => void;
      onSound: (cb: (k: string) => void) => void;
      onTestOpen: (cb: () => void) => void;
      cmd: (c: string, arg?: unknown) => void;
      poke: () => void;
      interactive: (on: boolean) => void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);
const MB = Math.max(24, Number(q.get("mb")) || 37);
const NOTCH = Number(q.get("notch")) || 0;
const island = $("island");
const root = document.documentElement.style;
root.setProperty("--mb", `${MB}px`);

// ---------- Ranglar, shakllar, kiyimlar
export const COLORS: { name: string; hex: string }[] = [
  { name: "Lavanda", hex: "#C8A5E7" },
  { name: "Asl rangi", hex: GHOST_ORIGINAL },
  { name: "Anor", hex: "#F08A8A" },
  { name: "Limon", hex: "#F3D27A" },
  { name: "Kivi", hex: "#8CCB7E" },
  { name: "Yalpiz", hex: "#8FD4B0" },
  { name: "Paxta", hex: "#F2F0EC" },
  { name: "Ko'mir", hex: "#3A3A42" },
];
const OUTFITS: { id: Outfit; name: string }[] = [
  { id: "none", name: "Kiyimsiz" },
  { id: "crown", name: "Toj" },
  { id: "santaHat", name: "Qorbobo qalpog'i" },
  { id: "beanie", name: "Shapka" },
  { id: "partyHat", name: "Bayram qalpog'i" },
  { id: "bow", name: "Bantik" },
  { id: "sunglasses", name: "Quyosh ko'zoynagi" },
  { id: "roundGlasses", name: "Dumaloq ko'zoynak" },
  { id: "scarf", name: "Sharf" },
  { id: "bunnyEars", name: "Quyon quloqlari" },
  { id: "witchHat", name: "Sehrgar shlyapasi" },
];
const EMOTES: { id: GhostEmote | "dizzy" | "roll"; name: string }[] = [
  { id: "love", name: "❤️ Yurak" },
  { id: "happy", name: "Xursand" },
  { id: "surprised", name: "Hayron" },
  { id: "proud", name: "⭐ Mag'rur" },
  { id: "yawn", name: "Esnash" },
  { id: "roll", name: "Aylanish" },
  { id: "dizzy", name: "Boshi aylanish" },
];

// ---------- Orol o'lchamlari (Coucou'dagidek ixcham)
const WING_COMPACT = NOTCH ? 50 : 66;
const WING_MINI = NOTCH ? 34 : 50;
type View = "mini" | "compact" | "peek" | "activity" | "open" | "look";
const width = (v: View) =>
  v === "open" || v === "look" ? 420 : v === "activity" ? Math.max(NOTCH + 2 * 120, 320) : NOTCH + 2 * (v === "mini" ? WING_MINI : v === "peek" ? WING_COMPACT + 8 : WING_COMPACT);
const height = (v: View) => (v === "open" ? MB + 228 : v === "look" ? MB + 300 : v === "activity" ? MB + 32 : v === "peek" ? MB + 8 : MB);
const radius = (v: View) => (v === "open" || v === "look" ? 30 : v === "activity" ? 20 : v === "peek" ? 16 : 12);

// Kompanyon kanvasi: tana kengligi ≈ 0.68 × kanvas
const OVER = 0.32; // tepada yuraklar va z'lar uchun joy
function botBox(v: View) {
  const W = width(v);
  const wing = (W - NOTCH) / 2;
  if (v === "open" || v === "look") {
    // panelning chap tomonida katta
    const d = 136;
    return { x: (460 - W) / 2 + 16 + 64, y: MB + 4 + 66, d };
  }
  const head = Math.min(MB - 7, wing - 12) + (v === "peek" ? 4 : 0);
  const d = head / 0.74; // arvohcha: bo'yi uzun, ozgina kichikroq
  const left = (460 - W) / 2;
  return { x: left + wing / 2 + (NOTCH ? 3 : 0), y: MB / 2 + (v === "peek" ? 3 : 1), d };
}

let view: View = "compact";
function setView(v: View) {
  view = v;
  root.setProperty("--w", `${width(v)}px`);
  root.setProperty("--h", `${height(v)}px`);
  root.setProperty("--r", `${radius(v)}px`);
  root.setProperty("--wright", `${NOTCH ? 12 : 14}px`);
  const b = botBox(v);
  // kanvas orol ichida emas, oyna koordinatasida turadi (orol transform bilan markazlashgan)
  root.setProperty("--bx", `${b.x - (460 - width(v)) / 2}px`);
  root.setProperty("--by", `${b.y - (b.d * OVER) / 2}px`);
  root.setProperty("--bd", `${b.d}px`);
  root.setProperty("--bo", `${b.d * OVER}px`);
  island.className = `island ${v === "look" ? "open look" : v}`;
  $("main").hidden = v === "look";
  $("look").hidden = v !== "look";
  if (v !== "mini") lastActiveAt = performance.now();
}

// ---------- Kompanyon
const engine = new GhostSprite();
const canvas = $("bot") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
engine.onDizzy = () => {
  engine.setState("dizzy");
  setTimeout(() => engine.setState(baseState()), 2600);
};

let S0: State | null = null;
let asleep = false;
let lastActiveAt = performance.now();
let mouse = { x: -999, y: -999 };

const botCenter = () => {
  const r = canvas.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * (OVER / (1 + OVER)) + (r.height / (1 + OVER)) * 0.5, r: r.width * 0.36 };
};

function baseState() {
  if (asleep) return "sleeping" as const;
  if (S0?.running && S0.mode === "focus") return "working" as const;
  return "idle" as const;
}

// ---------- Sichqoncha: orolga kelganda kattalashadi, bosganda ochiladi
let inside = false;
let closeTimer = 0;
island.addEventListener("mouseenter", () => {
  inside = true;
  clearTimeout(closeTimer);
  window.df.interactive(true);
  if (view === "mini" || view === "compact" || view === "activity") setView("peek");
});
island.addEventListener("mouseleave", () => {
  inside = false;
  clearTimeout(closeTimer);
  closeTimer = window.setTimeout(
    () => {
      if (inside) return;
      setView("compact");
      window.df.interactive(false);
    },
    view === "open" || view === "look" ? 900 : 150,
  );
});
island.addEventListener("click", (e) => {
  if (view === "open" || view === "look") return;
  e.stopPropagation();
  setView("open");
});
// Kompanyonni bosish — chertish (3 marta tez — boshi aylanadi)
canvas.addEventListener("click", (e) => {
  if (view !== "open" && view !== "look") return; // yig'ilganda bosish panelni ochadi
  e.stopPropagation();
  engine.slap();
  window.df.poke();
});

$("toggle").addEventListener("click", () => window.df.cmd("toggle"));
$("reset").addEventListener("click", () => window.df.cmd("reset"));
$("skip").addEventListener("click", () => window.df.cmd("skip"));
$("desk").addEventListener("click", () => {
  setView("compact");
  window.df.interactive(false);
  window.df.cmd("desktop");
});
$("big").addEventListener("click", () => window.df.cmd("big"));
$("gear").addEventListener("click", () => setView("look"));
$("back").addEventListener("click", () => setView("open"));
window.df.onTestOpen(() => setView(q.get("look") ? "look" : "open"));

// ---------- Ko'rinish: kiyim, shakl, rang tugmalari (har biri kichik kompanyon bilan)
function miniIcon(size: number, setup: (e: GhostSprite) => void) {
  const c = document.createElement("canvas");
  const dpr = 2;
  c.width = size * dpr;
  c.height = size * dpr;
  const e = new GhostSprite();
  e.lookX = 0;
  setup(e);
  const g = c.getContext("2d")!;
  return {
    c,
    e,
    draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      e.update(1 / 60);
      e.draw(g, size, size * 1.15);
    },
  };
}
const icons: ReturnType<typeof miniIcon>[] = [];
const outfitBtns: Record<string, HTMLButtonElement> = {};
for (const o of OUTFITS) {
  const b = document.createElement("button");
  b.title = o.name;
  b.setAttribute("aria-label", o.name);
  const ic = miniIcon(40, (e) => e.setOutfit(o.id, false));
  icons.push(ic);
  b.appendChild(ic.c);
  b.addEventListener("click", () => window.df.cmd("look", { outfit: o.id }));
  $("outfits").appendChild(b);
  outfitBtns[o.id] = b;
}
const colorBtns: Record<string, HTMLButtonElement> = {};
for (const c of COLORS) {
  const b = document.createElement("button");
  b.style.background = c.hex;
  b.title = c.name;
  b.setAttribute("aria-label", c.name);
  b.addEventListener("click", () => window.df.cmd("look", { color: c.hex }));
  $("colors").appendChild(b);
  colorBtns[c.hex] = b;
}
for (const em of EMOTES) {
  const b = document.createElement("button");
  b.className = "chip";
  b.textContent = em.name;
  b.addEventListener("click", () => {
    wake();
    if (em.id === "dizzy") engine.onDizzy?.();
    else if (em.id === "roll") engine.doRoll(950);
    else engine.triggerEmote(em.id, 2.2);
  });
  $("emotes").appendChild(b);
}
// ikonkalar kursorga qaramaydi, faqat bir marta chiziladi (va kiyim/rang o'zgarsa)
const redrawIcons = () => icons.forEach((i) => i.draw());
ghostReady.then(() => redrawIcons());

// ---------- Uyqu: 5 daqiqa harakatsizlikdan keyin uxlaydi, kursor yaqinlashsa uyg'onadi
function sleep() {
  if (asleep) return;
  engine.triggerEmote("yawn", 1.6);
  setTimeout(() => {
    asleep = true;
    engine.setState("sleeping");
  }, 1400);
}
function wake() {
  if (!asleep) return;
  asleep = false;
  engine.setState(baseState());
  engine.triggerEmote("surprised", 0.7);
  setTimeout(() => engine.triggerEmote("happy", 1.2), 750);
  lastActiveAt = performance.now();
}

// ---------- Silash: kursor kompanyon ustida u yoq-bu yoqqa yursa — yurakcha
let pet = { active: false, since: 0, travel: 0, last: { x: 0, y: 0 } };
let lastLove = 0;
window.df.onCursor((c) => {
  const prev = mouse;
  mouse = c;
  const b = botCenter();
  // ko'zlar va bosh kursorga qaraydi
  engine.lookX = Math.tanh((c.x - b.x) / 260);
  engine.lookY = -Math.tanh((c.y - b.y) / 200);

  const dist = Math.hypot(c.x - b.x, c.y - b.y);
  if (asleep && dist < 130) wake();

  const over = dist < Math.max(14, b.r);
  const now = performance.now();
  if (over && !asleep) {
    if (!pet.active) {
      pet = { active: true, since: now, travel: 0, last: c };
      engine.blink();
      engine.tgEs = 1.06;
    } else {
      pet.travel += Math.hypot(c.x - prev.x, c.y - prev.y);
    }
    if (now - pet.since > 1100 && pet.travel > 70 && now - lastLove > 5000) {
      lastLove = now;
      engine.triggerEmote("love", 2.2);
      pet.travel = 0;
    }
  } else if (pet.active) {
    pet.active = false;
    engine.tgEs = 1;
  }
});

// ---------- Jonli faoliyat
let actTimer = 0;
function showActivity(text: string, ms = 3600) {
  if (view === "open" || view === "look") return;
  $("act").textContent = text;
  setView("activity");
  clearTimeout(actTimer);
  actTimer = window.setTimeout(() => {
    if (view === "activity") setView(inside ? "peek" : "compact");
  }, ms);
}
window.df.onActivity((a) => {
  wake();
  if (a.kind === "done") {
    engine.setState("finished");
    setTimeout(() => engine.setState(baseState()), 2600);
  } else engine.triggerEmote("happy", 1.4);
  showActivity(a.text);
});

// ---------- Ovozlar (o'zimizniki, juda yengil)
let audio: AudioContext | null = null;
window.df.onSound((kind) => {
  try {
    audio ??= new AudioContext();
    const notes = kind === "tick" ? [880] : [523.25, 659.25, 783.99];
    notes.forEach((f, i) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t = audio!.currentTime + i * 0.16;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === "tick" ? 0.35 : 1.1));
      o.connect(g).connect(audio!.destination);
      o.start(t);
      o.stop(t + 1.2);
    });
  } catch {
    /* ovoz chiqmasa ham davom etamiz */
  }
});

// ---------- Holat
let lastBubble = "";
let chipsKey = "";
let lookKey = "";
let wasRunning = false;
let lastGoalHit = false;

function render(s: State) {
  const showTime = s.started || s.running;
  $("wtext").textContent = showTime ? s.time : "";
  $("wtime").hidden = !showTime;
  const dot = $("wdot");
  dot.className = !s.running ? "pause" : s.mode === "focus" ? "" : "brk";

  // o'ng qanot: vaqt yo'q bo'lsa — bugungi sprintlar nuqtachalari
  const dots = $("wdots");
  dots.hidden = showTime;
  const n = Math.min(4, Math.max(s.goal, 1));
  if (dots.childElementCount !== n) dots.innerHTML = "<i></i>".repeat(n);
  [...dots.children].forEach((d, i) => d.classList.toggle("on", i < s.today));

  $("ptime").textContent = s.time;
  $("plabel").textContent = `${s.method} · ${s.round ? `${s.label} · ${s.round}` : s.label}`;
  const tg = $("toggle");
  tg.classList.toggle("running", s.running);
  tg.setAttribute("aria-label", s.running ? "Pauza" : "Boshlash");
  $("ic-play").toggleAttribute("hidden", s.running);
  $("ic-pause").toggleAttribute("hidden", !s.running);
  const sk = $<HTMLButtonElement>("skip");
  if (s.flowing) {
    sk.classList.add("text");
    sk.textContent = "Tanaffus";
    sk.disabled = !s.canFinish;
  } else if (sk.classList.contains("text")) {
    sk.classList.remove("text");
    sk.disabled = false;
    sk.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 5 9 7-9 7z"/><path d="M18 5v14"/></svg>';
  }
  $("stats").textContent = `Bugun ${s.today}/${s.goal} · ${s.todayMin} daq · 🔥 ${s.streak}`;

  const key = s.methods.map((m) => m.id).join() + s.methodId;
  if (key !== chipsKey) {
    chipsKey = key;
    const box = $("chips");
    box.innerHTML = "";
    for (const m of s.methods) {
      const b = document.createElement("button");
      b.className = `chip${m.id === s.methodId ? " on" : ""}`;
      b.innerHTML = `${m.name}<small>${m.badge}</small>`;
      b.addEventListener("click", () => window.df.cmd("method", m.id));
      box.appendChild(b);
    }
  }

  // ko'rinish: kiyim, shakl, rang
  const lk = `${s.outfit}|${s.bodyShape}|${s.bodyColor}`;
  if (lk !== lookKey) {
    const first = !lookKey;
    lookKey = lk;
    engine.setOutfit(s.outfit, !first);
    engine.setColor(s.bodyColor);
    root.setProperty("--acc", s.bodyColor);
    for (const ic of icons) {
      ic.e.setColor(s.bodyColor);
    }
    for (const o of OUTFITS) outfitBtns[o.id].classList.toggle("on", o.id === s.outfit);
    for (const c of COLORS) colorBtns[c.hex].classList.toggle("on", c.hex === s.bodyColor);
    redrawIcons();
  }

  // holat o'zgarishlari
  if (s.running && !wasRunning && s.mode === "focus") wake();
  wasRunning = s.running;
  if (s.goalHit && !lastGoalHit) setTimeout(() => engine.triggerEmote("proud", 2.4), 2700);
  lastGoalHit = s.goalHit;
  if (s.idleSec >= 300 && !s.running) sleep();
  else if (s.hour >= 23 || s.hour < 6) {
    if (!s.running && s.idleSec > 60) sleep();
  }
  const want = baseState();
  if (engine.state !== want && engine.state !== "dizzy" && engine.state !== "finished") engine.setState(want);

  if (s.bubble !== lastBubble) {
    lastBubble = s.bubble;
    if (s.bubble) showActivity(s.bubble, 4200);
  }
}

window.df.onState((s) => {
  S0 = s;
  render(s);
});

// ---------- Tasodifiy jonli harakatlar: har doim nimadir qilib turadi
let nextAmbient = performance.now() + 6000;
function ambient(now: number) {
  if (now < nextAmbient) return;
  nextAmbient = now + 7000 + Math.random() * 9000;
  if (asleep || engine.state === "dizzy" || engine.state === "finished") return;
  const r = Math.random();
  if (r < 0.22) engine.triggerEmote("wink", 1.2);
  else if (r < 0.42) engine.triggerEmote("happy", 1.4);
  else if (r < 0.58) {
    engine.jump();
    setTimeout(() => engine.squash(), 420);
  } else if (r < 0.68) engine.doRoll(900);
  else if (r < 0.82) engine.squash();
  else if (r < 0.92) engine.triggerEmote("surprised", 1);
  else engine.triggerEmote("love", 1.6);
}

// ---------- Chizish sikli
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // bir muddat tegilmasa va taymer ishlamasa — mini holatga kichrayadi
  if (view === "compact" && !inside && !(S0?.running || S0?.started) && now - lastActiveAt > 6000) setView("mini");
  if (view === "mini" && (S0?.running || S0?.started)) setView("compact");

  ambient(now);
  engine.update(dt);

  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W = Math.round(r.width * dpr);
  const H = Math.round(r.height * dpr);
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, r.width, r.height);
  engine.particleOverhang = r.height - r.width;
  engine.draw(ctx, r.width, r.height);
  requestAnimationFrame(loop);
}
setView("compact");
requestAnimationFrame(loop);
