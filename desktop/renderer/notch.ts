// Notch'dagi kompanyon: yig'ilgan "orol", mo'ralash, jonli faoliyat va ochiladigan panel
import { BlobFace, SHAPE_LIST, EXPRESSIONS, type Expression, type Shape } from "./blob";

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
  blobShape: Shape;
  blobColor: string;
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
const WING = NOTCH ? 70 : 78;

const island = $("island");
const root = document.documentElement.style;
root.setProperty("--mb", `${MB}px`);

// Bloub ranglari
const COLORS = ["#111111", "#7A5230", "#D64545", "#E8862E", "#E8B33A", "#6CC77A", "#4FB08F", "#4F8DF0", "#7B5CF0", "#D64FB0", "#9A9A9A", "#EEEDE8"];
const SHAPE_NAME: Record<Shape, string> = {
  circle: "Doira",
  pebble: "Tosh",
  squircle: "Kvadrat",
  capsule: "Kapsula",
  triangle: "Uchburchak",
  hexagon: "Olti burchak",
  cloud: "Bulut",
  droplet: "Tomchi",
};
const EXPR_NAME: Record<Expression, string> = {
  neutral: "Oddiy",
  attentive: "Diqqatli",
  surprised: "Hayron",
  excited: "Hayajonli",
  happy: "Xursand",
  laughing: "Kulgan",
  angry: "Jahldor",
  sad: "Xafa",
  scared: "Qo'rqqan",
  suspicious: "Shubhali",
  confused: "Gangigan",
  curious: "Qiziquvchan",
  proud: "Mag'rur",
  shy: "Uyatchan",
  unimpressed: "Befarq",
  sleepy: "Uyquchi",
};

// ---------- O'lchamlar
type Sz = { w: number; h: number; r: number };
const collapsedW = NOTCH ? NOTCH + WING * 2 : 168;
const SIZES: Record<string, Sz> = {
  collapsed: { w: collapsedW, h: MB, r: 12 },
  peek: { w: collapsedW + 22, h: MB + 12, r: 16 },
  activity: { w: Math.max(collapsedW + 120, 330), h: MB + 34, r: 22 },
  open: { w: 420, h: MB + 228, r: 30 },
  look: { w: 420, h: MB + 270, r: 30 },
};
// Yuz chap qanotda, vaqt o'ng qanotda
root.setProperty("--facew", `${WING}px`);
root.setProperty("--facex", NOTCH ? "0px" : "6px");
root.setProperty("--wright", NOTCH ? "12px" : "14px");

let view: "collapsed" | "peek" | "activity" | "open" | "look" = "collapsed";
function setView(v: typeof view) {
  view = v;
  const s = SIZES[v];
  root.setProperty("--w", `${s.w}px`);
  root.setProperty("--h", `${s.h}px`);
  root.setProperty("--r", `${s.r}px`);
  island.className = `island ${v === "look" ? "open" : v}`;
  $("main").hidden = v === "look";
  $("look").hidden = v !== "look";
}
setView("collapsed");

// ---------- Yuz (notch) va avatar (panel)
const faceSvg = $("face") as unknown as SVGSVGElement;
const S = Math.round(MB * 1.22);
faceSvg.setAttribute("viewBox", `${-WING / 2} ${-MB / 2} ${WING} ${MB}`);
const face = new BlobFace({ svg: faceSvg, size: S, body: false, eyeColor: "#fff" });

const avSvg = $("avatar") as unknown as SVGSVGElement;
avSvg.setAttribute("viewBox", "-70 -70 140 140");
const avatar = new BlobFace({ svg: avSvg, size: 50, body: true, bodyColor: "#7B5CF0", eyeColor: "#fff", shape: "circle", eyeScale: 1.35 });

// ---------- Sichqoncha
let inside = false;
let closeTimer = 0;
island.addEventListener("mouseenter", () => {
  inside = true;
  clearTimeout(closeTimer);
  window.df.interactive(true);
  if (view === "collapsed" || view === "activity") setView("peek");
});
island.addEventListener("mouseleave", () => {
  inside = false;
  clearTimeout(closeTimer);
  closeTimer = window.setTimeout(
    () => {
      if (inside) return;
      setView("collapsed");
      window.df.interactive(false);
    },
    view === "open" || view === "look" ? 900 : 120,
  );
});
island.addEventListener("click", (e) => {
  if (view === "peek" || view === "collapsed" || view === "activity") {
    e.stopPropagation();
    setView("open");
    face.poke();
  }
});
avSvg.addEventListener("click", () => {
  avatar.poke();
  window.df.poke();
  pokeExpr("surprised", 700, "laughing", 1600);
});

$("toggle").addEventListener("click", () => window.df.cmd("toggle"));
$("reset").addEventListener("click", () => window.df.cmd("reset"));
$("skip").addEventListener("click", () => window.df.cmd("skip"));
$("desk").addEventListener("click", () => {
  setView("collapsed");
  window.df.interactive(false);
  window.df.cmd("desktop");
});
$("big").addEventListener("click", () => window.df.cmd("big"));
$("gear").addEventListener("click", () => setView("look"));
$("back").addEventListener("click", () => setView("open"));
window.df.onTestOpen(() => setView(q.get("look") ? "look" : "open"));

// ---------- Ko'rinish sozlamalari (shakl, rang, kayfiyatlar)
const ns = "http://www.w3.org/2000/svg";
function shapeIcon(sh: Shape) {
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "-30 -30 60 60");
  const f = new BlobFace({ svg, size: 22, body: true, bodyColor: "#fff", eyeColor: "#1C1C1E", shape: sh });
  f.frame(0);
  return { svg, f };
}
const shapeBtns: Record<string, HTMLButtonElement> = {};
for (const sh of SHAPE_LIST) {
  const b = document.createElement("button");
  b.setAttribute("aria-label", SHAPE_NAME[sh]);
  b.title = SHAPE_NAME[sh];
  const { svg, f } = shapeIcon(sh);
  // shakl darhol to'liq ko'rinsin
  for (let i = 0; i < 60; i++) f.frame(i * 16);
  b.appendChild(svg);
  b.addEventListener("click", () => window.df.cmd("blob", { shape: sh }));
  $("shapes").appendChild(b);
  shapeBtns[sh] = b;
}
const colorBtns: Record<string, HTMLButtonElement> = {};
for (const c of COLORS) {
  const b = document.createElement("button");
  b.style.background = c;
  b.setAttribute("aria-label", c);
  b.addEventListener("click", () => window.df.cmd("blob", { color: c }));
  $("colors").appendChild(b);
  colorBtns[c] = b;
}
let forced: { e: Expression; until: number; then?: Expression; thenUntil?: number } | null = null;
function pokeExpr(e: Expression, ms: number, then?: Expression, thenMs = 0) {
  const now = performance.now();
  forced = { e, until: now + ms, then, thenUntil: now + ms + thenMs };
}
for (const e of Object.keys(EXPRESSIONS) as Expression[]) {
  const b = document.createElement("button");
  b.className = "chip";
  b.textContent = EXPR_NAME[e];
  b.addEventListener("click", () => pokeExpr(e, 2600));
  $("exprs").appendChild(b);
}

// ---------- Ovozlar
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

// ---------- Jonli faoliyat: muhim voqea bo'lsa orol qisqa kengayadi
let actTimer = 0;
function showActivity(text: string, ms = 3600) {
  if (view === "open" || view === "look") return;
  $("act").textContent = text;
  setView("activity");
  clearTimeout(actTimer);
  actTimer = window.setTimeout(() => {
    if (view === "activity") setView(inside ? "peek" : "collapsed");
  }, ms);
}
window.df.onActivity((a) => {
  if (a.kind === "done") pokeExpr("excited", 1400, "happy", 3000);
  showActivity(a.text);
});
let lastBubble = "";

// ---------- Kursor: yuz va avatar kursorga qaraydi
const faceCenter = () => {
  const r = faceSvg.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};
window.df.onCursor((c) => {
  const f = faceCenter();
  face.lookAt((c.x - f.x) / 260, (c.y - f.y) / 140);
  const a = avSvg.getBoundingClientRect();
  avatar.lookAt((c.x - (a.left + a.width / 2)) / 320, (c.y - (a.top + a.height / 2)) / 220);
});

// ---------- Holat → ifoda
let S0: State | null = null;
function exprOf(s: State): Expression {
  const now = performance.now();
  if (forced) {
    if (now < forced.until) return forced.e;
    if (forced.then && now < (forced.thenUntil ?? 0)) return forced.then;
    forced = null;
  }
  if (s.celebrate) return s.goalHit ? "proud" : "excited";
  if (s.away) return "sad";
  if (s.running && s.mode === "focus") return view === "peek" ? "curious" : "attentive";
  if (s.running) return "happy";
  if (s.hour >= 23 || s.hour < 6) return "sleepy";
  if (s.lastAt && Date.now() - s.lastAt > 2 * 86_400_000) return "sad";
  if (view === "peek") return "curious";
  if (s.today === 0) return "shy";
  return "neutral";
}

let chipsKey = "";
function render(s: State) {
  // o'ng qanot: vaqt
  const showTime = s.started || s.running;
  $("wtext").textContent = showTime ? s.time : "";
  const dot = $("wdot");
  dot.hidden = !showTime;
  dot.className = !s.running ? "pause" : s.mode === "focus" ? "" : "brk";

  // panel
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

  // ko'rinish
  avatar.setShape(s.blobShape);
  const light = ["#EEEDE8", "#E8B33A"].includes(s.blobColor);
  avatar.setColors(s.blobColor, light ? "#1C1C1E" : "#fff");
  face.setColors("#000", s.blobColor === "#111111" ? "#fff" : s.blobColor);
  for (const [k, b] of Object.entries(shapeBtns)) b.classList.toggle("on", k === s.blobShape);
  for (const [k, b] of Object.entries(colorBtns)) b.classList.toggle("on", k === s.blobColor);

  // gap — notch'da qisqa faoliyat ko'rinishida
  if (s.bubble !== lastBubble) {
    lastBubble = s.bubble;
    if (s.bubble) showActivity(s.bubble, 4200);
  }
}

window.df.onState((s) => {
  S0 = s;
  render(s);
});

function loop(now: number) {
  if (S0) {
    const e = exprOf(S0);
    face.setExpression(e);
    avatar.setExpression(e);
  }
  face.scale = view === "peek" || view === "activity" ? 1.08 : 1;
  face.frame(now);
  if (view === "open") avatar.frame(now);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
