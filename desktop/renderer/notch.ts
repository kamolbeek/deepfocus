// Momiq — notch'dagi kompanyon (Coucou'ning Mochi dizayni va animatsiyalari, muallif ruxsati bilan).
// Ixcham orol, mini holat, kursorga qaraydigan ko'zlar, uxlash/uyg'onish, silash, fayl yutish,
// Claude Code va boshqa agentlarning sessiyalari, ruxsat va savol kartalari, pill'lar.
import { BotEngine, type BotEmoteName, type BotStateName, type Outfit, hexToRGB } from "./buddy/engine";

type Step = { t: number; text: string; state: string };
type Pending =
  | { kind: "approval"; id: string; tool: string; text: string; command: string; suggestions: unknown[]; at: number }
  | { kind: "question"; id: string; questions: { question: string; header?: string; options?: { label: string; description?: string }[]; multiSelect?: boolean }[]; at: number };
type Session = {
  key: string; agent: string; agentName: string; color: string; project: string; title: string; state: BotStateName; step: string;
  steps: Step[]; prompt: string; answer: string; diff: { file: string; added: number; removed: number; old?: string; new?: string; isNew?: boolean } | null;
  pending: Pending | null; startedAt: number; updatedAt: number;
};
type Pill = { id: string; name: string; color: string; kind: string; state: BotStateName; count: number; text: string; open: string; value?: string | number };
type Agents = {
  pills: Pill[]; sessions: Session[]; hooks: Record<string, boolean>;
  catalog: { id: string; name: string; color: string; kind: string }[]; active: string[];
  nasiya: { url: string; path: string; label: string }; notify: boolean;
};
type State = {
  mode: "focus" | "short" | "long"; running: boolean; flowing: boolean; time: string; label: string; round: string;
  method: string; methodId: string; methods: { id: string; name: string; badge: string }[]; canFinish: boolean; started: boolean;
  celebrate: boolean; goalHit: boolean; away: boolean; today: number; todayMin: number; goal: number; streak: number; hour: number;
  lastAt: number; bubble: string; idleSec: number; outfit: Outfit; bodyColor: string; agents: Agents | null; sound: boolean;
};

declare global {
  interface Window {
    df: {
      onState: (cb: (s: State) => void) => void;
      onCursor: (cb: (c: { x: number; y: number }) => void) => void;
      onActivity: (cb: (a: { kind: string; text: string }) => void) => void;
      onSound: (cb: (k: string) => void) => void;
      onTestOpen: (cb: () => void) => void;
      onGeom: (cb: (g: { mb: number; notch: number }) => void) => void;
      onVoice: (cb: (v: { status: string; message?: string }) => void) => void;
      cmd: (c: string, arg?: unknown) => void;
      agent: (c: string, arg?: unknown) => void;
      poke: () => void;
      interactive: (on: boolean) => void;
      pathsFor: (files: FileList | File[]) => string[];
      fileIcon: (p: string) => Promise<string>;
      chatFiles: (paths: string[]) => void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const q = new URLSearchParams(location.search);
let MB = Math.max(24, Number(q.get("mb")) || 37);
let NOTCH = Number(q.get("notch")) || 0;
const WIN_W = 620;
const island = $("island");
const root = document.documentElement.style;
root.setProperty("--mb", `${MB}px`);
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// ---------- Ranglar, kiyimlar, harakatlar
const COLORS: { name: string; hex: string }[] = [
  { name: "Asl (Mochi)", hex: "" },
  { name: "Lavanda", hex: "#C8A5E7" },
  { name: "Anor", hex: "#F08A8A" },
  { name: "Limon", hex: "#F3D27A" },
  { name: "Kivi", hex: "#8CCB7E" },
  { name: "Yalpiz", hex: "#8FD4B0" },
  { name: "Osmon", hex: "#8AB4F8" },
  { name: "Ko'mir", hex: "#3A3A42" },
];
const OUTFITS: { id: Outfit; name: string }[] = [
  { id: "none", name: "Kiyimsiz" }, { id: "crown", name: "Toj" }, { id: "santaHat", name: "Qorbobo qalpog'i" }, { id: "beanie", name: "Shapka" },
  { id: "partyHat", name: "Bayram qalpog'i" }, { id: "bow", name: "Bantik" }, { id: "sunglasses", name: "Quyosh ko'zoynagi" }, { id: "roundGlasses", name: "Dumaloq ko'zoynak" },
  { id: "scarf", name: "Sharf" }, { id: "bunnyEars", name: "Quyon quloqlari" }, { id: "witchHat", name: "Sehrgar shlyapasi" }, { id: "pumpkin", name: "Qovoq" },
];
const EMOTES: { id: BotEmoteName | "dizzy" | "roll"; name: string }[] = [
  { id: "love", name: "❤️ Yurak" }, { id: "happy", name: "Xursand" }, { id: "wink", name: "Ko'z qisish" }, { id: "surprised", name: "Hayron" },
  { id: "proud", name: "⭐ Mag'rur" }, { id: "yawn", name: "Esnash" }, { id: "roll", name: "Aylanish" }, { id: "dizzy", name: "Boshi aylanish" },
];
const STATE_UZ: Record<string, string> = {
  idle: "Kutyapti", working: "Ishlayapti", thinking: "O'ylayapti", searching: "Qidiryapti", approval: "Ruxsat so'rayapti",
  question: "Savol berdi", error: "Xato", finished: "Tugatdi", ratelimit: "Limit tugadi", sleeping: "Uxlayapti", dizzy: "Boshi aylangan",
};
const HOT = new Set(["approval", "question", "error", "ratelimit"]);

// ---------- Orol o'lchamlari
const wingCompact = () => (NOTCH ? 50 : 66);
const wingMini = () => (NOTCH ? 34 : 50);
type View = "mini" | "compact" | "peek" | "activity" | "open";
type Tab = "timer" | "agents" | "look";
let view: View = "compact";
let tab: Tab = "timer";
let pillsInWing = 0;
const openH = () => MB + (tab === "look" ? 330 : tab === "agents" ? 286 : 236);
const width = (v: View) =>
  v === "open" ? 600 : v === "activity" ? Math.max(NOTCH + 2 * 120, 320) : NOTCH + 2 * (v === "mini" ? wingMini() : v === "peek" ? wingCompact() + 8 : wingCompact()) + (v === "mini" ? 0 : pillsInWing * 24);
const height = (v: View) => (v === "open" ? openH() : v === "activity" ? MB + 32 : v === "peek" ? MB + 8 : MB);
const radius = (v: View) => (v === "open" ? 30 : v === "activity" ? 20 : v === "peek" ? 16 : 12);

const OVER = 0.32; // tepada yuraklar va z'lar uchun joy
function botBox(v: View) {
  const W = width(v);
  if (v === "open") return { x: (WIN_W - W) / 2 + 12 + 14 + 64, y: MB + 12 + 59, d: 136 };
  const wing = (W - NOTCH - pillsInWing * 24) / 2;
  const head = Math.min(MB - 7, wing - 12) + (v === "peek" ? 4 : 0);
  const d = head / 0.66;
  const left = (WIN_W - W) / 2;
  return { x: left + wing / 2 + (NOTCH ? 3 : 0), y: MB / 2 + (v === "peek" ? 3 : 1), d };
}
function setView(v: View) {
  view = v;
  root.setProperty("--w", `${width(v)}px`);
  root.setProperty("--h", `${height(v)}px`);
  root.setProperty("--r", `${radius(v)}px`);
  root.setProperty("--wright", `${NOTCH ? 12 : 14}px`);
  const b = botBox(v);
  root.setProperty("--bx", `${b.x - (WIN_W - width(v)) / 2}px`);
  root.setProperty("--by", `${b.y - (b.d * OVER) / 2}px`);
  root.setProperty("--bd", `${b.d}px`);
  root.setProperty("--bo", `${b.d * OVER}px`);
  island.className = `island ${v}${v === "open" && tab !== "timer" ? ` ${tab}` : ""}`;
  if (v !== "mini") lastActiveAt = performance.now();
}
function setTab(t: Tab) {
  tab = t;
  for (const b of document.querySelectorAll<HTMLButtonElement>(".tab[data-v]")) b.classList.toggle("on", b.dataset.v === t);
  $("v-timer").hidden = t !== "timer";
  $("v-agents").hidden = t !== "agents";
  $("v-look").hidden = t !== "look";
  if (view === "open") setView("open");
  if (t === "agents") renderAgents();
}
for (const b of document.querySelectorAll<HTMLButtonElement>(".tab[data-v]")) b.addEventListener("click", () => setTab(b.dataset.v as Tab));
$("tabChat").addEventListener("click", () => window.df.cmd("chat"));
$("tabVoice").addEventListener("click", () => window.df.cmd("voice"));
// ovozli suhbat: Momiq tinglaganda qidiryapti, o'ylaganda o'ylayapti, gapirganda sakrab-sakrab turadi
let voiceSt = "idle";
window.df.onVoice((v) => {
  voiceSt = v.status;
  if (v.status === "listening" || v.status === "thinking" || v.status === "speaking") wake();
  if (v.status === "speaking") talk();
});
let talkT = 0;
function talk() {
  clearInterval(talkT);
  talkT = window.setInterval(() => {
    if (voiceSt !== "speaking") return clearInterval(talkT);
    engine.anim("oy", [[-0.08 - Math.random() * 0.08, 110, (t) => 1 - Math.pow(1 - t, 2)], [0, 160, (t) => t]]);
  }, 320);
}
$("snd").addEventListener("click", () => window.df.agent("sound", !(S0?.sound ?? true)));

// ---------- Momiq
const engine = new BotEngine();
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
function baseState(): BotStateName {
  if (asleep) return "sleeping";
  if (S0?.running && S0.mode === "focus") return "working";
  return "idle";
}

// ---------- Sichqoncha
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
  closeTimer = window.setTimeout(() => {
    if (inside) return;
    setView("compact");
    window.df.interactive(false);
  }, view === "open" ? 900 : 150);
});
island.addEventListener("click", (e) => {
  if (view === "open") return;
  e.stopPropagation();
  // ruxsat kutilayotgan bo'lsa to'g'ri agentlar tabiga
  if (S0?.agents?.sessions.some((s) => s.pending)) setTab("agents");
  setView("open");
});
canvas.addEventListener("click", (e) => {
  if (view !== "open") return;
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
window.df.onTestOpen(() => {
  setTab((q.get("tab") as Tab) || (q.get("look") ? "look" : "timer"));
  setView("open");
});
window.df.onGeom((g) => {
  MB = Math.max(24, g.mb || 24);
  NOTCH = g.notch || 0;
  root.setProperty("--mb", `${MB}px`);
  setView(view);
});

// ---------- Kichkina Mochi'lar (pill'lar, ro'yxatlar, kiyim tugmalari)
type Mini = { c: HTMLCanvasElement; e: BotEngine; draw(): void };
function mini(size: number, setup: (e: BotEngine) => void, animated = false): Mini {
  const c = document.createElement("canvas");
  const dpr = 2;
  c.width = size * dpr;
  c.height = size * dpr;
  const e = new BotEngine();
  setup(e);
  const g = c.getContext("2d")!;
  const m: Mini = {
    c, e,
    draw() {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, size, size);
      e.update(1 / 60);
      e.draw(g, size, size * 1.1);
    },
  };
  if (animated) liveMinis.add(m);
  return m;
}
const liveMinis = new Set<Mini>();
const staticIcons: Mini[] = [];
const pillBot = (p: Pill, size: number) =>
  mini(size, (e) => {
    e.isMini = true;
    e.bodyColor = hexToRGB(p.color);
    e.setState(p.state);
  }, true);

// kiyim / rang / harakat tugmalari
const outfitBtns: Record<string, HTMLButtonElement> = {};
for (const o of OUTFITS) {
  const b = document.createElement("button");
  b.title = o.name;
  b.setAttribute("aria-label", o.name);
  const ic = mini(40, (e) => e.setOutfit(o.id, false));
  staticIcons.push(ic);
  b.appendChild(ic.c);
  b.addEventListener("click", () => window.df.cmd("look", { outfit: o.id }));
  $("outfits").appendChild(b);
  outfitBtns[o.id] = b;
}
const colorBtns: Record<string, HTMLButtonElement> = {};
for (const c of COLORS) {
  const b = document.createElement("button");
  if (c.hex) b.style.background = c.hex;
  else b.className = "orig";
  b.title = c.name;
  b.setAttribute("aria-label", c.name);
  b.addEventListener("click", () => window.df.cmd("look", { color: c.hex || "none" }));
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
    else if (em.id === "roll") engine.doRoll(950, 1);
    else engine.triggerEmote(em.id, 2.2);
  });
  $("emotes").appendChild(b);
}
const redrawIcons = () => staticIcons.forEach((i) => i.draw());

// ---------- Uyqu
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

// ---------- Silash → yurakcha
let pet = { active: false, since: 0, travel: 0, last: { x: 0, y: 0 } };
let lastLove = 0;
window.df.onCursor((c) => {
  const prev = mouse;
  mouse = c;
  const b = botCenter();
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
      engine.tgEs = 1.08;
    } else pet.travel += Math.hypot(c.x - prev.x, c.y - prev.y);
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

// ---------- Fayl yutish
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragDepth++;
  wake();
  engine.animateMorph(1); // Coucou: Mochi pochta qutisiga aylanadi
  if (view === "mini" || view === "compact" || view === "activity") setView("peek");
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("dragleave", () => {
  if (--dragDepth > 0) return;
  dragDepth = 0;
  engine.animateMorph(0);
  if (view === "peek" && !inside) setView("compact");
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  const files = Array.from(e.dataTransfer?.files ?? []);
  const paths = window.df.pathsFor(files);
  if (!paths.length) return engine.animateMorph(0);
  const b = botCenter();
  await Promise.all(
    paths.slice(0, 4).map(async (p, i) => {
      const f = files[i];
      const el = document.createElement("img");
      el.className = "food";
      el.src = f && f.type.startsWith("image/") ? URL.createObjectURL(f) : await window.df.fileIcon(p);
      const x0 = e.clientX + i * 8;
      const y0 = e.clientY + 24 + i * 5;
      el.style.left = `${x0}px`;
      el.style.top = `${y0}px`;
      document.body.appendChild(el);
      await el
        .animate(
          [
            { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
            { transform: `translate(calc(-50% + ${b.x - x0}px), calc(-50% + ${b.y - y0}px)) scale(.08)`, opacity: 0 },
          ],
          { duration: 600 + i * 80, easing: "cubic-bezier(.5,0,.7,1)", fill: "forwards" },
        )
        .finished.catch(() => {});
      el.remove();
    }),
  );
  engine.gulp();
  setTimeout(() => {
    engine.animateMorph(0);
    engine.triggerEmote("happy", 1.6);
  }, 1300);
  window.df.chatFiles(paths);
  setTimeout(() => {
    if (view === "peek" && !inside) setView("compact");
  }, 900);
});

// ---------- Jonli faoliyat
let actTimer = 0;
function showActivity(text: string, ms = 3600) {
  if (view === "open") return;
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

// ---------- Ovozlar (o'zimizniki)
let audio: AudioContext | null = null;
window.df.onSound((kind) => {
  try {
    audio ??= new AudioContext();
    const notes = kind === "tick" ? [880] : kind === "approval" || kind === "question" ? [659.25, 880] : kind === "error" ? [440, 330] : [523.25, 659.25, 783.99];
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
  } catch {}
});

// ---------- Agentlar: pill'lar va sessiyalar
let selected = "";
let pillMinis = new Map<string, Mini>(); // header
let wingMinis = new Map<string, Mini>(); // yig'ilgan holatdagi o'ng qanot
let sessMinis = new Map<string, Mini>();
let lastSig = "";
let lastHot = "";

function syncMinis(map: Map<string, Mini>, items: { key: string; color: string; state: BotStateName }[], size: number, container: HTMLElement, wrap: (m: Mini, it: { key: string }) => HTMLElement) {
  const keep = new Set(items.map((i) => i.key));
  for (const [k, m] of map) if (!keep.has(k)) {
    liveMinis.delete(m);
    map.delete(k);
  }
  container.innerHTML = "";
  for (const it of items) {
    let m = map.get(it.key);
    if (!m) {
      m = pillBot({ color: it.color, state: it.state } as Pill, size);
      map.set(it.key, m);
    } else {
      m.e.bodyColor = hexToRGB(it.color);
      if (m.e.state !== it.state) m.e.setState(it.state);
    }
    container.appendChild(wrap(m, it));
  }
}

function renderPills(A: Agents) {
  // header: barcha pill'lar; yig'ilganda: faqat sessiyasi borlar yoki e'tibor talab qilganlar (3 tagacha)
  const hdr = $("hpills");
  syncMinis(pillMinis, A.pills.map((p) => ({ key: p.id, color: p.color, state: p.state })), 22, hdr, (m, it) => {
    const p = A.pills.find((x) => x.id === it.key)!;
    const b = document.createElement("button");
    b.title = `${p.name}${p.text ? ` · ${p.text}` : ""}`;
    b.appendChild(m.c);
    const label = document.createElement("span");
    label.textContent = p.name.split(" ")[0];
    b.appendChild(label);
    if (p.kind === "agent" && p.count) b.insertAdjacentHTML("beforeend", `<small>${p.count}</small>`);
    else if (p.value !== undefined && p.value !== "") b.insertAdjacentHTML("beforeend", `<small>${esc(String(p.value))}</small>`);
    b.classList.toggle("on", tab === "agents" && A.sessions.find((s) => s.key === selected)?.agent === p.id);
    b.addEventListener("click", () => {
      if (p.kind === "agent") {
        const s = A.sessions.find((x) => x.agent === p.id);
        if (s) selected = s.key;
        setTab("agents");
      } else if (p.open) window.df.agent("open", p.open);
    });
    return b;
  });
  const wingItems = A.pills.filter((p) => (p.kind === "agent" && p.count) || HOT.has(p.state)).slice(0, 3);
  const wing = $("wpills");
  syncMinis(wingMinis, wingItems.map((p) => ({ key: p.id, color: p.color, state: p.state })), 22, wing, (m) => m.c);
  const n = wingItems.length;
  if (n !== pillsInWing) {
    pillsInWing = n;
    setView(view);
  }
}

function renderAgents() {
  const A = S0?.agents;
  if (!A) return;
  const list = A.sessions;
  const sess = $("sess");
  const det = $("detail");
  if (!list.length) {
    sess.innerHTML = "";
    sess.hidden = true;
    const h = A.hooks || {};
    det.innerHTML = `<div class="empty"><b>Hali sessiya yo'q</b>${
      h.claude
        ? "Claude Code'da yangi suhbat boshlang — Momiq uni shu yerda ko'rsatadi: nimani o'qiyapti, nimani o'zgartiryapti, qachon ruxsat so'rayapti."
        : "Avval ⚙ bo'limida <b>Claude Code hook'larini o'rnating</b>, keyin har bir sessiya shu yerda ko'rinadi."
    }</div>`;
    return;
  }
  sess.hidden = list.length < 2;
  if (!list.find((s) => s.key === selected)) selected = (list.find((s) => s.pending) ?? list[0]).key;
  syncMinis(sessMinis, list.map((s) => ({ key: s.key, color: s.color, state: s.state })), 34, sess, (m, it) => {
    const s = list.find((x) => x.key === it.key)!;
    const b = document.createElement("button");
    b.classList.toggle("on", s.key === selected);
    b.appendChild(m.c);
    b.insertAdjacentHTML("beforeend", `<div style="min-width:0"><div class="nm">${esc(s.title || s.project || s.agentName)}</div><div class="st${HOT.has(s.state) ? " hot" : ""}">${esc(STATE_UZ[s.state] || s.state)}</div></div>`);
    b.addEventListener("click", () => {
      selected = s.key;
      renderAgents();
      renderPills(A);
    });
    return b;
  });
  const s = list.find((x) => x.key === selected)!;
  let html = `<div class="who"><i style="--c:${s.color}"></i><b>${esc(s.project || s.agentName)}</b>${s.title ? ` · ${esc(s.title)}` : ""} · ${esc(s.agentName)}</div>`;
  if (s.pending?.kind === "approval") {
    const p = s.pending;
    html += `<div class="big">Ruxsat so'rayapti: ${esc(p.text)}</div>`;
    if (p.command) html += `<div class="cmd">${esc(p.command)}</div>`;
    html += `<div class="btns"><button class="btn primary" data-dec="allow">Ruxsat</button><button class="btn" data-dec="always">Har doim</button><button class="btn danger" data-dec="deny">Rad etish</button><button class="btn" data-dec="">Terminalda</button></div>`;
  } else if (s.pending?.kind === "question") {
    const p = s.pending;
    html += `<div class="big">${esc(p.questions[0]?.question || "Savol")}</div>`;
    p.questions.forEach((qq, qi) => {
      if (qi) html += `<div class="sub" style="color:#F5F6F8;font-weight:600">${esc(qq.question)}</div>`;
      html += `<div class="qopt" data-qi="${qi}" data-multi="${qq.multiSelect ? 1 : 0}">${(qq.options || [])
        .map((o) => `<button data-opt="${esc(o.label)}">${esc(o.label)}${o.description ? `<small>${esc(o.description)}</small>` : ""}</button>`)
        .join("")}</div>`;
    });
    html += `<div class="btns"><button class="btn primary" id="qsend">Javobni yuborish</button><button class="btn" data-dec="">Terminalda</button></div>`;
  } else {
    html += `<div class="big">${esc(STATE_UZ[s.state] || s.state)}${s.step && s.state !== "finished" ? ` · ${esc(s.step)}` : ""}</div>`;
    if (s.prompt) html += `<div class="sub">“${esc(s.prompt.slice(0, 160))}”</div>`;
  }
  const steps = s.steps.slice(-6);
  if (steps.length)
    html += `<div class="steps">${steps
      .map((st, i) => `<div class="ln ${i === steps.length - 1 && s.state !== "finished" && s.state !== "idle" ? "cur" : "done"}"><i></i><span>${esc(st.text)}</span></div>`)
      .join("")}</div>`;
  if (s.diff) {
    const d = s.diff;
    html += `<div class="diff"><div class="fn"><b>${esc(d.file)}</b><span class="pl">+${d.added}</span><span class="mn">−${d.removed}</span>${d.isNew ? "<span>yangi fayl</span>" : ""}</div>`;
    if (d.old || d.new)
      html += `<pre>${(d.old || "").split("\n").map((l) => `<span class="d">- ${esc(l)}</span>`).join("")}${(d.new || "").split("\n").map((l) => `<span class="a">+ ${esc(l)}</span>`).join("")}</pre>`;
    html += `</div>`;
  }
  if (s.answer && s.state !== "approval" && s.state !== "question") html += `<div class="ans">${esc(s.answer)}</div>`;
  det.innerHTML = html;
  det.querySelectorAll<HTMLButtonElement>("[data-dec]").forEach((b) =>
    b.addEventListener("click", () => {
      const id = s.pending?.id;
      if (!id) return;
      window.df.agent("approve", { id, decision: b.dataset.dec || null });
    }),
  );
  det.querySelectorAll<HTMLButtonElement>(".qopt button").forEach((b) =>
    b.addEventListener("click", () => {
      const box = b.parentElement!;
      if (box.dataset.multi !== "1") box.querySelectorAll("button").forEach((x) => x.classList.remove("on"));
      b.classList.toggle("on");
    }),
  );
  det.querySelector<HTMLButtonElement>("#qsend")?.addEventListener("click", () => {
    if (s.pending?.kind !== "question") return;
    const answers: Record<string, string> = {};
    det.querySelectorAll<HTMLElement>(".qopt").forEach((box) => {
      const qi = Number(box.dataset.qi);
      const qq = (s.pending as Extract<Pending, { kind: "question" }>).questions[qi];
      const picked = [...box.querySelectorAll<HTMLButtonElement>("button.on")].map((x) => x.dataset.opt!);
      if (picked.length) answers[qq.header || qq.question] = picked.join(", ");
    });
    if (!Object.keys(answers).length) return;
    window.df.agent("approve", { id: s.pending.id, decision: answers });
  });
}

function renderSettings(A: Agents) {
  const hooks = $("hooks");
  const H = A.hooks || {};
  const rows = [
    ["claude", "Claude Code", "~/.claude/settings.json"],
    ["gemini", "Gemini CLI", "~/.gemini/settings.json"],
    ["cursor", "Cursor", "~/.cursor/hooks.json"],
  ];
  hooks.innerHTML = rows
    .map(([id, name, file]) => `<div class="row"><span>${name} <small>${file}</small></span><button class="lb${H[id] ? " ok" : ""}" data-hook="${id}">${H[id] ? "O'rnatilgan · olib tashlash" : "O'rnatish"}</button></div>`)
    .join("");
  hooks.querySelectorAll<HTMLButtonElement>("[data-hook]").forEach((b) => b.addEventListener("click", () => window.df.agent(H[b.dataset.hook!] ? "uninstall" : "install", b.dataset.hook)));
  const cfg = $("pillsCfg");
  cfg.innerHTML = "";
  for (const c of A.catalog) {
    const on = A.active.includes(c.id);
    const row = document.createElement("label");
    row.className = "row";
    const ic = mini(22, (e) => {
      e.isMini = true;
      e.bodyColor = hexToRGB(c.color);
    });
    ic.draw();
    row.appendChild(ic.c);
    row.insertAdjacentHTML("beforeend", `<span>${esc(c.id === "nasiya" ? A.nasiya.label || c.name : c.name)}${c.kind === "mail" ? " <small>Mail.app orqali</small>" : c.kind === "url" ? " <small>JSON manzil</small>" : ""}</span><input type="checkbox" ${on ? "checked" : ""}>`);
    row.querySelector("input")!.addEventListener("change", (e) => window.df.agent("active", { id: c.id, on: (e.target as HTMLInputElement).checked }));
    cfg.appendChild(row);
  }
  $("nasiyaCfg").hidden = !A.active.includes("nasiya");
  const nz = A.nasiya;
  if (document.activeElement?.tagName !== "INPUT") {
    $<HTMLInputElement>("nzLabel").value = nz.label || "";
    $<HTMLInputElement>("nzUrl").value = nz.url || "";
    $<HTMLInputElement>("nzPath").value = nz.path || "";
  }
  $<HTMLInputElement>("notify").checked = A.notify;
}
$("nzSave").addEventListener("click", () => window.df.agent("nasiya", { label: $<HTMLInputElement>("nzLabel").value, url: $<HTMLInputElement>("nzUrl").value, path: $<HTMLInputElement>("nzPath").value }));
$("notify").addEventListener("change", (e) => window.df.agent("notify", (e.target as HTMLInputElement).checked));

// ---------- Holat
let lastBubble = "";
let chipsKey = "";
let lookKey = "";
let wasRunning = false;
let lastGoalHit = false;
let settingsKey = "";

function render(s: State) {
  const showTime = s.started || s.running;
  $("wtext").textContent = showTime ? s.time : "";
  $("wtime").hidden = !showTime;
  $("wdot").className = !s.running ? "pause" : s.mode === "focus" ? "" : "brk";
  const dots = $("wdots");
  const hasWingPills = pillsInWing > 0;
  dots.hidden = showTime || hasWingPills;
  $("wpills").hidden = showTime;
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
  $("sndw").toggleAttribute("hidden", !s.sound);
  $("snd").style.opacity = s.sound ? "1" : ".45";

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
  const lk = `${s.outfit}|${s.bodyColor}`;
  if (lk !== lookKey) {
    const first = !lookKey;
    lookKey = lk;
    engine.setOutfit(s.outfit || "none", !first);
    engine.setColor(s.bodyColor || null);
    root.setProperty("--acc", s.bodyColor || "#7B79FF");
    for (const ic of staticIcons) ic.e.setColor(s.bodyColor || null);
    for (const o of OUTFITS) outfitBtns[o.id]?.classList.toggle("on", o.id === (s.outfit || "none"));
    for (const c of COLORS) colorBtns[c.hex]?.classList.toggle("on", c.hex === (s.bodyColor || ""));
    redrawIcons();
  }

  // agentlar
  if (s.agents) {
    const A = s.agents;
    const sig = JSON.stringify([A.pills, A.sessions.map((x) => [x.key, x.state, x.step, x.pending?.id, x.steps.length, x.answer.length, x.diff?.added])]);
    if (sig !== lastSig) {
      lastSig = sig;
      renderPills(A);
      if (tab === "agents" && view === "open") renderAgents();
    }
    const sk2 = JSON.stringify([A.hooks, A.active, A.nasiya, A.notify, A.catalog.length]);
    if (sk2 !== settingsKey) {
      settingsKey = sk2;
      renderSettings(A);
    }
    const cnt = $("agentCount");
    const hotN = A.sessions.filter((x) => HOT.has(x.state)).length;
    cnt.hidden = !A.sessions.length;
    cnt.textContent = String(hotN || A.sessions.length);
    cnt.classList.toggle("hot", hotN > 0);
    // ruxsat kutilsa: Momiq ham ogohlantiradi
    const hot = A.sessions.find((x) => x.pending)?.pending?.id ?? "";
    if (hot && hot !== lastHot) {
      lastHot = hot;
      wake();
      engine.setState(A.sessions.find((x) => x.pending)!.state);
      showActivity(`${A.sessions.find((x) => x.pending)!.project || "Agent"}: ${A.sessions.find((x) => x.pending)!.pending!.kind === "approval" ? "ruxsat kerak" : "savol bor"}`, 5000);
      engine.anim("oy", [[-0.3, 140, (t) => 1 - Math.pow(1 - t, 3)], [0, 300, (t) => t]]);
    } else if (!hot) lastHot = "";
  }

  if (s.running && !wasRunning && s.mode === "focus") wake();
  wasRunning = s.running;
  if (s.goalHit && !lastGoalHit) setTimeout(() => engine.triggerEmote("proud", 2.4), 2700);
  lastGoalHit = s.goalHit;
  if (s.idleSec >= 300 && !s.running) sleep();
  else if ((s.hour >= 23 || s.hour < 6) && !s.running && s.idleSec > 60) sleep();
  const pendingState = s.agents?.sessions.find((x) => x.pending)?.state;
  const want: BotStateName = voiceSt === "listening" ? "searching" : voiceSt === "thinking" ? "thinking" : pendingState && !asleep ? pendingState : baseState();
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

// ---------- Tasodifiy jonli harakatlar
let nextAmbient = performance.now() + 6000;
function ambient(now: number) {
  if (now < nextAmbient) return;
  nextAmbient = now + 7000 + Math.random() * 9000;
  if (asleep || engine.state !== "idle") return;
  const r = Math.random();
  if (r < 0.22) engine.triggerEmote("wink", 0.9);
  else if (r < 0.42) engine.triggerEmote("happy", 1.1);
  else if (r < 0.56) {
    engine.anim("oy", [[-0.22, 130, (t) => 1 - Math.pow(1 - t, 3)], [0, 260, (t) => t]]);
    engine.squash();
  } else if (r < 0.66) engine.doRoll(900, 1);
  else if (r < 0.8) {
    engine.blink();
    setTimeout(() => engine.blink(), 220);
  } else if (r < 0.9) engine.triggerEmote("surprised", 0.6);
  else engine.triggerEmote("love", 1.4);
}

// ---------- Chizish sikli
let last = performance.now();
function loop(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (view === "compact" && !inside && !(S0?.running || S0?.started) && !pillsInWing && now - lastActiveAt > 6000) setView("mini");
  if (view === "mini" && (S0?.running || S0?.started || pillsInWing)) setView("compact");
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
  // kichkina Mochi'lar (faqat ko'rinib turganlari)
  for (const m of liveMinis) if (m.c.isConnected && m.c.offsetParent) m.draw();
  requestAnimationFrame(loop);
}
setView("compact");
requestAnimationFrame(loop);
