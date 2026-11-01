// Ish stolidagi kompanyon oynasi: veb-ilovadagi o'sha WebGL dvigatel
import { createCompanion, type Mood } from "../../lib/companion-engine";

type State = {
  mode: "focus" | "short" | "long";
  running: boolean;
  flowing: boolean;
  time: string;
  pct: number;
  label: string;
  round: string;
  method: string;
  canFinish: boolean;
  started: boolean;
  celebrate: boolean;
  goalHit: boolean;
  away: boolean;
  today: number;
  hour: number;
  lastAt: number;
  bubble: string;
};

declare global {
  interface Window {
    df: {
      onState: (cb: (s: State) => void) => void;
      onSound: (cb: (k: string) => void) => void;
      onCursor: (cb: (c: { x: number; y: number }) => void) => void;
      onWalk: (cb: (w: { on: boolean; dir?: number }) => void) => void;
      onArrive: (cb: () => void) => void;
      resizeStart: () => void;
      resizeEnd: () => void;
      pathsFor: (files: FileList | File[]) => string[];
      fileIcon: (p: string) => Promise<string>;
      chatFiles: (paths: string[]) => void;
      cmd: (c: string, arg?: unknown) => void;
      poke: () => void;
      interactive: (on: boolean) => void;
      dragStart: (off: { x: number; y: number }) => void;
      dragEnd: () => void;
    };
  }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const stage = $("stage");
const pill = $("pill");
const bubbleEl = $("bubble");
const shadow = $("shadow");

const engine = createCompanion({
  gl: $<HTMLCanvasElement>("gl"),
  lids: $<HTMLCanvasElement>("lids"),
  back: $<HTMLCanvasElement>("back"),
  base: "./companion/",
  heightFrac: 0.86,
  onLayout: (w) => (shadow.style.width = `${Math.round(w * 100)}%`),
});

// GPU WebGL kontekstini yo'qotsa (masalan videokarta almashganda), oynani qayta chizamiz
$<HTMLCanvasElement>("gl").addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  setTimeout(() => location.reload(), 400);
});

// ---------- Sichqoncha: shaffof joylar orqali bosish o'tadi, kompanyon va tugmalar ushlanadi
let hovering = false;
for (const el of document.querySelectorAll<HTMLElement>(".hit")) {
  el.addEventListener("mouseenter", () => {
    hovering = true;
    window.df.interactive(true);
    render();
  });
  el.addEventListener("mouseleave", () => {
    hovering = false;
    if (!dragging && !resizingNow) window.df.interactive(false);
    render();
  });
}

// ---------- Sudrash, bosish va ikki marta bosish
let down: { x: number; y: number; cx: number; cy: number } | null = null;
let dragging = false;
let pokes: number[] = [];
let dizzyUntil = 0;
let lastClick = 0;

stage.addEventListener("pointerdown", (e) => {
  stage.setPointerCapture(e.pointerId);
  down = { x: e.screenX, y: e.screenY, cx: e.clientX, cy: e.clientY };
});
stage.addEventListener("pointermove", (e) => {
  if (!down || dragging) return;
  if (Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
    dragging = true;
    stage.classList.add("dragging");
    window.df.dragStart({ x: down.cx, y: down.cy });
  }
});
// sichqoncha qo'yib yuborilmasa ham (oynadan tashqarida, boshqa ilovaga o'tganda) sudrash albatta to'xtaydi
function endDrag() {
  if (dragging) {
    window.df.dragEnd();
    dragging = false;
    stage.classList.remove("dragging");
  }
  down = null;
}
stage.addEventListener("pointercancel", endDrag);
stage.addEventListener("lostpointercapture", endDrag);
stage.addEventListener("pointerup", () => {
  if (dragging) {
    window.df.dragEnd();
    dragging = false;
    stage.classList.remove("dragging");
  } else if (down) {
    const t = Date.now();
    if (t - lastClick < 320) {
      window.df.cmd("toggle"); // ikki marta bosish — boshlash / pauza
      lastClick = 0;
    } else {
      lastClick = t;
      engine?.poke();
      window.df.poke();
      pokes = pokes.filter((p) => t - p < 2000).concat(t);
      if (pokes.length >= 5) {
        pokes = [];
        dizzyUntil = t + 3000;
      }
    }
  }
  down = null;
});

$("toggle").addEventListener("click", () => window.df.cmd("toggle"));
$("reset").addEventListener("click", () => window.df.cmd("reset"));
$("skip").addEventListener("click", () => window.df.cmd("skip"));
$("menu").addEventListener("click", () => window.df.cmd("menu"));

// ---------- Kursor: ko'zlar ekrandagi kursor ortidan qaraydi (gorizontal va vertikal)
window.df.onCursor((c) => {
  // kattalik (zoom) bo'lsa, ekran pikselini sahifa pikseliga o'tkazamiz
  const zoom = window.outerWidth / window.innerWidth || 1;
  const r = stage.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height * 0.42;
  engine?.look((c.x / zoom - cx) / 420, (c.y / zoom - cy) / 300);
});

// ---------- Yurish: kompanyon ekran bo'ylab yurganda tebranadi va yo'nalishga buriladi
window.df.onWalk((w) => {
  stage.classList.toggle("walking", w.on);
  if (w.on && w.dir) stage.style.setProperty("--dir", String(w.dir));
});
// Notch'dan tushib kelganda
window.df.onArrive(() => {
  stage.classList.remove("arrive");
  void stage.offsetWidth;
  stage.classList.add("arrive");
  engine?.poke();
});

// ---------- Fayl yutish: faylni kompanyon ustiga olib kelsa og'zi ochiladi, tashlasa yutib yuboradi
let dragDepth = 0;
let feedTimer = 0;
function setFeed(m: Mood | null) {
  feedMood = m;
  render();
}
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragDepth++;
  clearTimeout(feedTimer);
  stage.classList.add("hungry");
  setFeed("surprised");
});
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("dragleave", () => {
  if (--dragDepth > 0) return;
  dragDepth = 0;
  stage.classList.remove("hungry");
  setFeed(null);
});
window.addEventListener("drop", async (e) => {
  e.preventDefault();
  dragDepth = 0;
  const files = Array.from(e.dataTransfer?.files ?? []);
  const paths = window.df.pathsFor(files);
  if (!paths.length) {
    stage.classList.remove("hungry");
    setFeed(null);
    return;
  }
  // og'iz qayerda: kompanyon kanvasining o'rtasidan sal pastroq
  const r = stage.getBoundingClientRect();
  const mx = r.left + r.width * 0.5;
  const my = r.top + r.height * 0.56;
  const shown = paths.slice(0, 4);
  await Promise.all(
    shown.map(async (p, i) => {
      const f = files[i];
      const el = document.createElement("img");
      el.className = "food";
      el.src = f && f.type.startsWith("image/") ? URL.createObjectURL(f) : await window.df.fileIcon(p);
      const x0 = e.clientX + i * 10;
      const y0 = e.clientY + i * 6;
      el.style.left = `${x0}px`;
      el.style.top = `${y0}px`;
      document.body.appendChild(el);
      const a = el.animate(
        [
          { transform: "translate(-50%,-50%) scale(1)", opacity: 1 },
          { transform: `translate(calc(-50% + ${(mx - x0) * 0.6}px), calc(-50% + ${(my - y0) * 0.6}px)) scale(.55)`, opacity: 1, offset: 0.55 },
          { transform: `translate(calc(-50% + ${mx - x0}px), calc(-50% + ${my - y0}px)) scale(.06)`, opacity: 0 },
        ],
        { duration: 650 + i * 90, easing: "cubic-bezier(.5,0,.7,1)", fill: "forwards" },
      );
      await a.finished.catch(() => {});
      el.remove();
    }),
  );
  stage.classList.remove("hungry");
  stage.classList.remove("gulp");
  void stage.offsetWidth;
  stage.classList.add("gulp");
  engine?.poke();
  setFeed("happy");
  feedTimer = window.setTimeout(() => setFeed(null), 2200);
  window.df.chatFiles(paths);
});

// ---------- Kattalashtirish dastagi
let resizingNow = false;
const grip = $("grip");
function endResize() {
  if (!resizingNow) return;
  resizingNow = false;
  window.df.resizeEnd();
  if (!hovering) window.df.interactive(false);
}
grip.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  if (e.button !== 0) return;
  grip.setPointerCapture(e.pointerId);
  resizingNow = true;
  window.df.interactive(true);
  window.df.resizeStart();
});
grip.addEventListener("pointerup", endResize);
grip.addEventListener("pointercancel", endResize);
grip.addEventListener("lostpointercapture", endResize);
// tugma qo'yib yuborilgani sezilmay qolsa ham: sichqoncha tugmasi bosilmagan holda harakat — to'xtatamiz
window.addEventListener("pointermove", (e) => {
  if (resizingNow && e.buttons === 0) endResize();
  if (dragging && e.buttons === 0) endDrag();
});
window.addEventListener("blur", () => {
  endResize();
  endDrag();
});

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

// ---------- Holat
let S: State | null = null;
let mood: Mood = "idle";

function moodOf(s: State): Mood {
  const now = Date.now();
  if (now < dizzyUntil) return "dizzy";
  if (s.celebrate) return s.goalHit ? "surprised" : "happy";
  if (s.away) return "wait";
  if (s.running) return s.mode === "focus" ? "focus" : "idle";
  if (s.hour >= 23 || s.hour < 6) return "sleep";
  if (s.lastAt && now - s.lastAt > 2 * 86_400_000) return "tired";
  if (s.today === 0) return "wait";
  return "idle";
}

let lastBubble = "";
// fayl tashlanayotganda: og'zini ochadi (surprised), yutgandan keyin xursand
let feedMood: Mood | null = null;
function render() {
  if (!S) return;
  const m = feedMood ?? moodOf(S);
  if (m !== mood) {
    mood = m;
    engine?.setMood(m);
  }
  $("zzz").hidden = mood !== "sleep";

  // Gap pufakchasi
  if (S.bubble !== lastBubble) {
    lastBubble = S.bubble;
    if (S.bubble) bubbleEl.textContent = S.bubble;
    bubbleEl.classList.toggle("show", !!S.bubble);
  }

  // Taymer: ishlayotganda doim ko'rinadi, ustiga kelinganda tugmalar ochiladi
  $("time").textContent = S.time;
  $("label").textContent = S.round ? `${S.label} · ${S.round}` : S.label;
  pill.classList.toggle("visible", hovering || S.running || S.started);
  pill.classList.toggle("open", hovering);
  const tg = $("toggle");
  tg.classList.toggle("running", S.running);
  tg.setAttribute("aria-label", S.running ? "Pauza" : "Boshlash");
  $("ic-play").toggleAttribute("hidden", S.running);
  $("ic-pause").toggleAttribute("hidden", !S.running);
  const sk = $<HTMLButtonElement>("skip");
  if (S.flowing) {
    sk.classList.add("text");
    sk.textContent = "Tanaffus";
    sk.disabled = !S.canFinish;
  } else if (sk.classList.contains("text")) {
    sk.classList.remove("text");
    sk.disabled = false;
    sk.innerHTML = '<svg viewBox="0 0 24 24"><path d="m6 5 9 7-9 7z"/><path d="M18 5v14"/></svg>';
  }
}

window.df.onState((s) => {
  S = s;
  render();
});
