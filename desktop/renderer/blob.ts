// Bloub uslubidagi yuz: oq ko'zlar ifoda bo'yicha shaklini o'zgartiradi, kursorga qaraydi va ko'z qisadi.
// Tana shakllari bir-biriga silliq aylanadi (qutb koordinatalarida nuqtalar interpolyatsiyasi).

export type Expression =
  | "neutral"
  | "attentive"
  | "surprised"
  | "excited"
  | "happy"
  | "laughing"
  | "angry"
  | "sad"
  | "scared"
  | "suspicious"
  | "confused"
  | "curious"
  | "proud"
  | "shy"
  | "unimpressed"
  | "sleepy";

export type Shape = "circle" | "pebble" | "squircle" | "capsule" | "triangle" | "hexagon" | "cloud" | "droplet";

// Bitta ko'z: kenglik, balandlik (tana radiusiga nisbatan), burilish (gradus), vertikal siqilish, siljish
type Eye = { w: number; h: number; rot: number; sy: number; dx: number; dy: number };
type Expr = { l: Eye; r: Eye; gap: number; lookX?: number; lookY?: number; jitter?: number };

const eye = (w: number, h: number, rot = 0, sy = 1, dx = 0, dy = 0): Eye => ({ w, h, rot, sy, dx, dy });
// Ikkala ko'z bir xil, burilishi ko'zgudagidek
const pair = (e: Eye, gap = 0.27, extra: Partial<Expr> = {}): Expr => ({
  l: e,
  r: { ...e, rot: -e.rot, dx: -e.dx },
  gap,
  ...extra,
});

export const EXPRESSIONS: Record<Expression, Expr> = {
  neutral: pair(eye(0.18, 0.4)),
  attentive: pair(eye(0.2, 0.43)),
  surprised: pair(eye(0.42, 0.45), 0.31),
  excited: pair(eye(0.36, 0.5, 6), 0.3, { jitter: 1 }),
  happy: pair(eye(0.17, 0.2, -14, 1, 0, -0.03)),
  laughing: pair(eye(0.13, 0.13, -20, 1, 0, -0.12), 0.27, { jitter: 1.5 }),
  angry: pair(eye(0.16, 0.26, 30, 0.75, 0, 0.02)),
  sad: pair(eye(0.21, 0.32, -16, 0.6, 0, 0.05)),
  scared: pair(eye(0.38, 0.58, -6), 0.3, { jitter: 0.6 }),
  suspicious: { l: eye(0.2, 0.38), r: eye(0.14, 0.14), gap: 0.27 },
  confused: { l: eye(0.19, 0.42, 6, 1, 0, -0.04), r: eye(0.16, 0.16, -22, 1, 0, 0.03), gap: 0.28 },
  curious: { l: eye(0.23, 0.44, 18), r: eye(0.19, 0.37, 22), gap: 0.27, lookX: 0.35 },
  proud: pair(eye(0.14, 0.14, -12, 1, 0, -0.14), 0.25, { lookY: -0.6 }),
  shy: pair(eye(0.16, 0.29, 0, 1, 0, 0.11), 0.24, { lookX: -0.5, lookY: 0.6 }),
  unimpressed: pair(eye(0.12, 0.12), 0.27, { lookX: -0.8 }),
  sleepy: pair(eye(0.2, 0.42, 0, 0.42, 0, 0.07)),
};

// ---------- Tana shakllari: r(θ), markaz atrofida (yuqori = -y)
const N = 96;
const ray = (th: number) => [Math.cos(th), Math.sin(th)] as const;

function stadium(th: number, hw: number, hh: number) {
  // kenglik 2hw, balandlik 2hh bo'lgan kapsulaga nur kesishishi
  const [c, s] = ray(th);
  const r = Math.min(hw, hh);
  let lo = 0;
  let hi = 4;
  for (let i = 0; i < 30; i++) {
    const m = (lo + hi) / 2;
    const x = Math.abs(c * m);
    const y = Math.abs(s * m);
    const dx = Math.max(0, x - (hw - r));
    const dy = Math.max(0, y - (hh - r));
    if (dx * dx + dy * dy <= r * r) lo = m;
    else hi = m;
  }
  return lo;
}
function polygon(th: number, n: number, rot: number, round: number) {
  const a = (((th - rot) % ((2 * Math.PI) / n)) + (2 * Math.PI) / n) % ((2 * Math.PI) / n);
  const sharp = Math.cos(Math.PI / n) / Math.cos(a - Math.PI / n);
  return sharp * (1 - round) + round * 0.93;
}

const SHAPES: Record<Shape, (th: number) => number> = {
  circle: () => 1,
  pebble: (th) => 1 + 0.07 * Math.sin(2 * th + 0.6) + 0.04 * Math.sin(3 * th + 1.7) - 0.05 * Math.sin(th) ** 2,
  squircle: (th) => Math.pow(Math.pow(Math.abs(Math.cos(th)), 4) + Math.pow(Math.abs(Math.sin(th)), 4), -0.25) * 0.92,
  capsule: (th) => stadium(th, 1.28, 0.78),
  triangle: (th) => polygon(th, 3, -Math.PI / 2, 0.22) * 1.12,
  hexagon: (th) => polygon(th, 6, 0, 0.18),
  cloud: (th) => {
    const up = Math.max(0, -Math.sin(th));
    return 0.9 + 0.13 * Math.pow(Math.abs(Math.sin(2.5 * th + 0.3)), 0.7) * (0.4 + up) - 0.06 * Math.max(0, Math.sin(th));
  },
  droplet: (th) => {
    const up = Math.max(0, -Math.sin(th)); // tepasi uchli
    return 0.95 + 0.42 * Math.pow(up, 6) - 0.08 * up;
  },
};
export const SHAPE_LIST = Object.keys(SHAPES) as Shape[];
const sample = (sh: Shape) => Array.from({ length: N }, (_, i) => SHAPES[sh]((i / N) * Math.PI * 2));

// ---------- Yuz
type Opts = {
  svg: SVGSVGElement; // viewBox markazi (0,0)
  size: number; // tana radiusi (px, viewBox birligida)
  body?: boolean; // tanani ham chizish (panel) yoki faqat ko'zlar (notch)
  bodyColor?: string;
  eyeColor?: string;
  shape?: Shape;
  eyeScale?: number; // ko'zlarni tanaga nisbatan kattalashtirish
};

export class BlobFace {
  private o: Required<Opts>;
  private bodyPath: SVGPathElement | null = null;
  private eyesG: SVGGElement;
  private eyeEls: SVGRectElement[] = [];
  private r: number[]; // joriy tana radiuslari
  private rTarget: number[];
  private cur: Expr;
  private target: Expr;
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  private blinkAt = performance.now() + 1500;
  private blinkK = 0;
  private pokeAt = -1e9;
  private lastLookMove = 0;
  private glance = { x: 0, y: 0, until: 0 };
  scale = 1; // tashqaridan kattalashtirish (notch "mo'ralash" uchun)

  constructor(opts: Opts) {
    this.o = { body: true, bodyColor: "#111", eyeColor: "#fff", shape: "circle", eyeScale: 1, ...opts };
    const ns = "http://www.w3.org/2000/svg";
    if (this.o.body) {
      this.bodyPath = document.createElementNS(ns, "path");
      this.o.svg.appendChild(this.bodyPath);
    }
    this.eyesG = document.createElementNS(ns, "g");
    this.o.svg.appendChild(this.eyesG);
    for (let i = 0; i < 2; i++) {
      const e = document.createElementNS(ns, "rect");
      this.eyesG.appendChild(e);
      this.eyeEls.push(e);
    }
    this.r = sample(this.o.shape);
    this.rTarget = this.r.slice();
    this.cur = structuredClone(EXPRESSIONS.neutral);
    this.target = EXPRESSIONS.neutral;
    this.setColors(this.o.bodyColor, this.o.eyeColor);
  }

  setExpression(e: Expression) {
    this.target = EXPRESSIONS[e];
  }
  setShape(s: Shape) {
    this.rTarget = sample(s);
  }
  setColors(body: string, eyes: string) {
    this.o.bodyColor = body;
    this.o.eyeColor = eyes;
    this.bodyPath?.setAttribute("fill", body);
    for (const e of this.eyeEls) e.setAttribute("fill", eyes);
  }
  // x, y: -1..1
  lookAt(x: number, y: number) {
    const nx = Math.max(-1, Math.min(1, x));
    const ny = Math.max(-1, Math.min(1, y));
    if (Math.abs(nx - this.look.tx) > 0.02 || Math.abs(ny - this.look.ty) > 0.02) this.lastLookMove = performance.now();
    this.look.tx = nx;
    this.look.ty = ny;
  }
  poke() {
    this.pokeAt = performance.now();
    this.blinkAt = performance.now();
  }

  frame(now: number) {
    const S = this.o.size * this.scale;
    const k = 0.16;
    const lerpEye = (a: Eye, b: Eye) => {
      a.w += (b.w - a.w) * k;
      a.h += (b.h - a.h) * k;
      a.rot += (b.rot - a.rot) * k;
      a.sy += (b.sy - a.sy) * k;
      a.dx += (b.dx - a.dx) * k;
      a.dy += (b.dy - a.dy) * k;
    };
    lerpEye(this.cur.l, this.target.l);
    lerpEye(this.cur.r, this.target.r);
    this.cur.gap += (this.target.gap - this.cur.gap) * k;

    // Kursor bir joyda tursa, vaqti-vaqti bilan o'zi atrofga ko'z tashlaydi
    if (now - this.lastLookMove > 3500 && now > this.glance.until) {
      const busy = Math.random() < 0.5;
      this.glance = {
        x: busy ? (Math.random() * 2 - 1) * 0.7 : 0,
        y: busy ? (Math.random() * 2 - 1) * 0.4 : 0,
        until: now + 1200 + Math.random() * 2600,
      };
    }
    const idle = now - this.lastLookMove > 3500;
    const tx = (idle ? this.glance.x : this.look.tx) + (this.target.lookX ?? 0);
    const ty = (idle ? this.glance.y : this.look.ty) + (this.target.lookY ?? 0);
    this.look.x += (Math.max(-1, Math.min(1, tx)) - this.look.x) * 0.14;
    this.look.y += (Math.max(-1, Math.min(1, ty)) - this.look.y) * 0.14;

    // Ko'z qisish: 2–6 soniyada bir, ba'zan ikki marta
    if (now >= this.blinkAt) {
      const t = now - this.blinkAt;
      this.blinkK = t < 70 ? t / 70 : t < 150 ? 1 - (t - 70) / 80 : 0;
      if (t >= 150) {
        this.blinkAt = now + (Math.random() < 0.18 ? 180 : 2000 + Math.random() * 4000);
        this.blinkK = 0;
      }
    }
    const blink = 1 - 0.9 * this.blinkK;

    // Tana: shaklga silliq o'tish va ozgina "jelе" tebranishi
    const pokeDt = (now - this.pokeAt) / 1000;
    const squish = pokeDt < 1.2 ? Math.exp(-pokeDt * 6) * Math.cos(pokeDt * 26) * 0.08 : 0;
    if (this.bodyPath) {
      let d = "";
      for (let i = 0; i < N; i++) {
        this.r[i] += (this.rTarget[i] - this.r[i]) * 0.12;
        const th = (i / N) * Math.PI * 2;
        const wob = 1 + 0.012 * Math.sin(3 * th + now / 650) + 0.008 * Math.sin(5 * th - now / 900);
        const rr = this.r[i] * S * wob;
        const x = Math.cos(th) * rr * (1 + squish);
        const y = Math.sin(th) * rr * (1 - squish) - squish * S * 0.3;
        d += (i ? "L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
      }
      this.bodyPath.setAttribute("d", d + "Z");
    }

    // Ko'zlar: kursor tomon siljiydi va burchakdan qaragandek ozgina qiyshayadi
    const jit = (this.target.jitter ?? 0) * Math.sin(now / 55) * 0.006 * S;
    const lx = this.look.x * 0.13 * S;
    const ly = this.look.y * 0.09 * S - squish * S * 0.25;
    const skew = this.look.x * 10;
    [this.cur.l, this.cur.r].forEach((e, i) => {
      const side = i === 0 ? -1 : 1;
      const es = this.o.eyeScale;
      const w = e.w * S * es;
      const h = Math.max(e.h * S * es, w);
      // kursor tarafidagi ko'z biroz kattaroq (perspektiva)
      const persp = 1 + side * this.look.x * 0.08;
      const el = this.eyeEls[i];
      el.setAttribute("x", (-w / 2).toFixed(2));
      el.setAttribute("y", (-h / 2).toFixed(2));
      el.setAttribute("width", w.toFixed(2));
      el.setAttribute("height", h.toFixed(2));
      el.setAttribute("rx", (w / 2).toFixed(2));
      const cx = side * this.cur.gap * S * (0.6 + 0.4 * es) + e.dx * S + lx + jit;
      const cy = -0.02 * S + e.dy * S + ly;
      el.setAttribute(
        "transform",
        `translate(${cx.toFixed(2)} ${cy.toFixed(2)}) skewX(${skew.toFixed(2)}) rotate(${e.rot.toFixed(2)}) scale(${persp.toFixed(3)} ${(e.sy * blink * persp).toFixed(3)})`,
      );
    });
  }
}
