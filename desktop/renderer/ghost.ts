// Notch'dagi arvohcha: Kamoliddin bergan asl rasm (4 ta holat) — o'zimiz hech narsa chizmaymiz.
// Rasmlar faqat siljiydi, egiladi, suzadi, aylanadi va kerak bo'lsa rangi almashtiriladi.
import { drawOutfitBehind, drawOutfitFront, makeHead } from "./buddy/outfits";
import type { Outfit } from "./buddy/engine";

type Pose = "main" | "wave" | "smile" | "sleep";
// Har bir rasm: o'lchami, gumbaz tepasi va markazi, ko'zlar markazi (rasm pikselida, gumbaz eni = 240)
const META: Record<Pose, { w: number; h: number; top: number; cx: number; eyeX: number; eyeY: number }> = {
  main: { w: 325, h: 345, top: 3.2, cx: 156.8, eyeX: 176.3, eyeY: 118.6 },
  wave: { w: 374, h: 369, top: 24.0, cx: 173.2, eyeX: 200.0, eyeY: 151.0 },
  smile: { w: 327, h: 353, top: 2.1, cx: 154.9, eyeX: 177.8, eyeY: 123.4 },
  sleep: { w: 340, h: 333, top: 20.8, cx: 187.4, eyeX: 159.7, eyeY: 163.7 },
};
const DOME = 240;
/** Asl rasmdagi tana rangi (o'rtacha). */
export const GHOST_ORIGINAL = "#C1AFF0";

export type GhostState = "idle" | "working" | "sleeping" | "dizzy" | "finished";
export type GhostEmote = "love" | "happy" | "proud" | "wink" | "surprised" | "yawn";

// ---------- Rasmlar va rang almashtirish
const imgs = {} as Record<Pose, HTMLImageElement>;
for (const p of Object.keys(META) as Pose[]) {
  const im = new Image();
  im.src = `ghost/${p}.png`;
  imgs[p] = im;
}
export const ghostReady = Promise.all(Object.values(imgs).map((i) => i.decode().catch(() => {})));

function hexHls(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return rgbHls(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function rgbHls(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, l, 0];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, l, s];
}
function hlsRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

const cache = new Map<string, HTMLCanvasElement | HTMLImageElement>();
/** Tana rangini almashtiradi; ko'zlar, og'iz va yaltiroq joylar o'zgarmaydi. */
function sprite(p: Pose, hex: string): HTMLCanvasElement | HTMLImageElement {
  const src = imgs[p];
  if (!src.complete || !src.naturalWidth || hex.toUpperCase() === GHOST_ORIGINAL) return src;
  const key = `${p}|${hex}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = src.naturalWidth;
  c.height = src.naturalHeight;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const a = d.data;
  const [bh, bl, bs] = hexHls(GHOST_ORIGINAL);
  const [th, tl, ts] = hexHls(hex);
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] === 0) continue;
    const [h, l, s] = rgbHls(a[i] / 255, a[i + 1] / 255, a[i + 2] / 255);
    // faqat tana (binafsha, to'yingan, yorug') — ko'z, og'iz, yaltiroq nuqta tashqarida
    const hue = h > 0.58 && h < 0.9 ? 1 : 0;
    const w = hue * clamp01((s - 0.12) / 0.12) * clamp01((l - 0.28) / 0.12);
    if (w <= 0) continue;
    const nh = h + (th - bh);
    const ns = clamp01(s * (bs > 0 ? ts / bs : 0));
    const nl = tl <= bl ? l * (tl / bl) : 1 - (1 - l) * ((1 - tl) / (1 - bl));
    const [r, gg, b] = hlsRgb(nh, clamp01(nl), ns);
    a[i] = a[i] * (1 - w) + r * 255 * w;
    a[i + 1] = a[i + 1] * (1 - w) + gg * 255 * w;
    a[i + 2] = a[i + 2] * (1 - w) + b * 255 * w;
  }
  g.putImageData(d, 0, 0);
  cache.set(key, c);
  return c;
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export class GhostSprite {
  lookX = 0;
  lookY = 0;
  state: GhostState = "idle";
  particleOverhang = 0;
  /** Kursor ustida turganda ozgina kattalashadi. */
  tgEs = 1;
  onDizzy: (() => void) | null = null;
  color = "#C8A5E7";

  private t = Math.random() * 10;
  private es = 1;
  private lx = 0;
  private ly = 0;
  private face = 1; // 1 = o'ngga, -1 = ko'zgudagidek chapga
  private faceS = 1;
  private hop = 0; // sakrash (0…1 egri)
  private hopT = -1;
  private hopDur = 0.45;
  private squashT = -1;
  private spinT = -1;
  private spinDur = 0.9;
  private wobbleT = -1;
  private emote: GhostEmote | null = null;
  private emoteUntil = 0;
  private slaps: number[] = [];
  outfit: Outfit = "none";
  private outfitTarget: Outfit = "none";
  private outfitPresence = 0;
  private physDx = 0;

  setColor(hex: string) {
    this.color = hex;
  }
  setState(s: GhostState) {
    if (s === this.state) return;
    this.state = s;
    if (s === "finished") {
      this.doRoll(900);
      this.jump();
    }
    if (s === "dizzy") this.wobbleT = 0;
  }
  setOutfit(o: Outfit, animate = true) {
    this.outfitTarget = o;
    if (!animate) {
      this.outfit = o;
      this.outfitPresence = o === "none" ? 0 : 1;
    }
  }
  triggerEmote(e: GhostEmote, seconds = 1.5) {
    this.emote = e;
    this.emoteUntil = this.t + seconds;
    if (e === "love" || e === "happy" || e === "proud" || e === "surprised") this.jump();
    if (e === "wink") this.squash();
  }
  jump(dur = 0.45) {
    this.hopT = 0;
    this.hopDur = dur;
  }
  squash() {
    this.squashT = 0;
  }
  doRoll(ms = 900) {
    this.spinT = 0;
    this.spinDur = ms / 1000;
  }
  blink() {
    this.squash();
  }
  /** Chertish: 3 marta tez bosilsa boshi aylanadi. */
  slap() {
    this.squash();
    this.wobbleT = 0;
    const n = this.t;
    this.slaps = this.slaps.filter((s) => n - s < 1.2);
    this.slaps.push(n);
    if (this.slaps.length >= 3) {
      this.slaps = [];
      this.onDizzy?.();
    }
  }

  private pose(): Pose {
    if (this.state === "sleeping") return "sleep";
    const e = this.t < this.emoteUntil ? this.emote : null;
    if (e === "yawn") return "sleep";
    if (e === "love" || e === "happy" || e === "proud" || this.state === "finished") return "wave";
    if (e === "wink" || e === "surprised") return "smile";
    return "main";
  }

  update(dt: number) {
    this.t += dt;
    const k = 1 - Math.exp(-dt * 7);
    const asleep = this.state === "sleeping";
    this.lx += ((asleep ? 0 : this.lookX) - this.lx) * k;
    this.ly += ((asleep ? 0 : this.lookY) - this.ly) * k;
    this.es += (this.tgEs - this.es) * k;
    // kursor ancha chapda bo'lsa — o'sha tomonga o'giriladi (rasm ko'zguda aylanadi)
    if (!asleep) {
      if (this.lookX < -0.35) this.face = -1;
      else if (this.lookX > 0.35) this.face = 1;
    }
    this.faceS += (this.face - this.faceS) * (1 - Math.exp(-dt * 10));
    const dx = -this.lx * 0.4 - this.physDx;
    this.physDx += dx * (1 - Math.exp(-dt * 6));
    if (this.hopT >= 0) {
      this.hopT += dt;
      if (this.hopT > this.hopDur) this.hopT = -1;
    }
    if (this.squashT >= 0 && (this.squashT += dt) > 0.35) this.squashT = -1;
    if (this.spinT >= 0 && (this.spinT += dt) > this.spinDur) this.spinT = -1;
    if (this.wobbleT >= 0 && (this.wobbleT += dt) > (this.state === "dizzy" ? 2.6 : 0.6)) this.wobbleT = -1;
    // kiyim almashishi: avvalgisi ketadi, keyin yangisi keladi
    if (this.outfit !== this.outfitTarget) {
      this.outfitPresence = Math.max(0, this.outfitPresence - dt * 5);
      if (this.outfitPresence === 0) this.outfit = this.outfitTarget;
    } else if (this.outfit !== "none") this.outfitPresence = Math.min(1, this.outfitPresence + dt * 4);
  }

  draw(x: CanvasRenderingContext2D, W: number, H: number) {
    const p = this.pose();
    const m = META[p];
    const im = sprite(p, this.color);
    if (!(im as HTMLImageElement).width) return;
    const t = this.t;
    const asleep = this.state === "sleeping";

    // o'lcham: gumbaz eni kanvas enining ~52% i
    const s = ((W * 0.52) / DOME) * this.es;
    const baseY = H - W * 0.06; // pastki chekka
    const tall = META.main.h - META.main.top;
    // suzish va nafas
    const bob = Math.sin(t * (asleep ? 1.2 : 2.1)) * W * (asleep ? 0.012 : 0.025);
    let sx = 1 + Math.sin(t * (asleep ? 1.2 : 2.1) + 1.2) * (asleep ? 0.02 : 0.012);
    let sy = 1 - (sx - 1);
    if (this.squashT >= 0) {
      const q = Math.sin((this.squashT / 0.35) * Math.PI);
      sx += 0.1 * q;
      sy -= 0.1 * q;
    }
    let hopY = 0;
    if (this.hopT >= 0) hopY = -Math.sin((this.hopT / this.hopDur) * Math.PI) * W * 0.1;
    let rot = this.lx * 0.1;
    if (this.wobbleT >= 0) rot += Math.sin(this.wobbleT * 18) * 0.16 * (1 - this.wobbleT / (this.state === "dizzy" ? 2.6 : 0.6));
    if (this.spinT >= 0) rot += ease(this.spinT / this.spinDur) * Math.PI * 2;
    const tx = this.lx * W * 0.05;
    const ty = -this.ly * W * 0.03;

    // tayanch nuqta: tananing pastki o'rtasi
    const ax = W / 2 + tx;
    const ay = baseY - W * 0.02 + bob + hopY + ty;
    x.save();
    x.translate(ax, ay);
    x.rotate(rot);
    x.scale(sx * this.faceS, sy);
    x.scale(s, s);
    // rasmni gumbaz markazi va tepasi bo'yicha joylash (hamma holat bir joyda turadi)
    const ox = -m.cx;
    const oy = -tall - m.top;
    const head = this.outfit !== "none" && this.outfitPresence > 0.01 ? this.headFor(m, ox, oy) : null;
    if (head) {
      x.save();
      x.translate(head.x, head.y);
      x.rotate(head.rot);
      drawOutfitBehind(x, this.outfit, head.h, { presence: this.outfitPresence, morph: 0 });
      x.restore();
    }
    x.drawImage(im, ox, oy, m.w, m.h);
    if (head) {
      x.save();
      x.translate(head.x, head.y);
      x.rotate(head.rot);
      drawOutfitFront(x, this.outfit, head.h, { presence: this.outfitPresence, morph: 0 });
      x.restore();
    }
    x.restore();
  }

  /** Kiyim uchun bosh: gumbaz eniga moslab (kattaroq chiqmasin), ko'zlar tomonga ozgina surilgan. */
  private headFor(m: (typeof META)[Pose], ox: number, oy: number) {
    // ko'zoynak ko'zlar ustiga tushsin, qalpoqlar gumbaz tepasiga
    const face = this.outfit === "sunglasses" || this.outfit === "roundGlasses";
    const rx = (DOME / 2) * (face ? 1.2 : 0.9);
    const R = rx / 1.14;
    const ry = R * 0.88;
    const cx = ox + m.cx + (m.eyeX - m.cx) * (face ? 1.25 : 0.45);
    const cy = face ? oy + m.eyeY - ry * 0.06 : oy + m.top + ry * 1.02;
    return { x: cx, y: cy, rot: face ? -0.14 : 0, h: makeHead(R, 0, 0, this.physDx, 0) };
  }
}
