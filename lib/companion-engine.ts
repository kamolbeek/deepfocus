// Kompanyon animatsiya dvigateli (WebGL).
// Butun personaj bitta qattiq massa: oyoq nuqtasi atrofida nafas oladi, qisiladi-cho'ziladi va og'adi.
// Ko'z qisish — ko'z ostidagi yuz teksturasi bilan; boshi aylanganda yulduzchalar alohida qatlamda aylanadi.

export type Mood = "idle" | "focus" | "happy" | "surprised" | "wait" | "tired" | "sleep" | "dizzy";

type Eye = [number, number, number, number];
type StateDef = {
  id: Mood;
  eyes: Eye[];
  stars?: [number, number][];
  orbit?: [number, number, number, number];
};

export const MOODS: StateDef[] = [
  { id: "idle", eyes: [[0.3818, 0.5178, 0.0955, 0.092], [0.7349, 0.4227, 0.0881, 0.0878]] },
  { id: "focus", eyes: [[0.2448, 0.4362, 0.0644, 0.0809], [0.5459, 0.4516, 0.0768, 0.0815]] },
  { id: "happy", eyes: [] },
  { id: "surprised", eyes: [] },
  { id: "wait", eyes: [[0.3806, 0.5261, 0.096, 0.0928], [0.6605, 0.3803, 0.086, 0.0824]] },
  { id: "tired", eyes: [] },
  { id: "sleep", eyes: [] },
  {
    id: "dizzy",
    eyes: [],
    stars: [[0.083, 0.08], [0.118, 0.1], [0.076, 0.072], [0.118, 0.102]],
    orbit: [0.27, 0.035, 0.3, 0.045],
  },
];

const D = Math.PI / 180;
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const easeOutBack = (k: number) => {
  const c = 1.6;
  return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
};
const breath = (t: number, T: number) => {
  const k = (((t % T) + T) % T) / T;
  return k < 0.4 ? easeInOut(k / 0.4) : 1 - easeInOut((k - 0.4) / 0.6);
};
function holdPoses(t: number, poses: number[], hold: number, move: number) {
  const per = hold + move;
  const n = poses.length;
  const i = Math.floor(t / per) % n;
  const k = t % per;
  const a = poses[i];
  const b = poses[(i + 1) % n];
  return k < hold ? a : a + (b - a) * easeInOut((k - hold) / move);
}
const spring = (dt: number, amp: number, freq: number, damp: number) =>
  dt < 0 ? 0 : amp * Math.exp(-dt * damp) * Math.cos(dt * freq);

type Pose = { sx: number; sy: number; rot: number; blink: boolean };

function pose(id: Mood, t: number, pokeDt: number, lookX: number): Pose {
  const P: Pose = { sx: 1, sy: 1, rot: 0, blink: true };
  switch (id) {
    case "idle": {
      P.sy = 1 + 0.016 * breath(t, 3.6);
      P.rot = holdPoses(t, [0, -1.4 * D, 0, 1.2 * D], 1.6, 0.7);
      break;
    }
    case "focus": {
      const beat = 0.6;
      const k = (t % beat) / beat;
      const n = Math.floor(t / beat);
      const dip = k < 0.18 ? easeInOut(k / 0.18) : 1 - easeInOut((k - 0.18) / 0.82);
      P.sy = 1 - 0.016 * dip;
      P.rot = (n % 2 ? 1 : -1) * 1.3 * D * easeInOut(Math.min(1, k / 0.35));
      break;
    }
    case "happy": {
      const k = (t % 0.8) / 0.8;
      P.sy =
        k < 0.2
          ? 1 - 0.05 * easeInOut(k / 0.2)
          : k < 0.45
            ? 0.95 + 0.1 * easeInOut((k - 0.2) / 0.25)
            : 1.05 - 0.05 * easeInOut((k - 0.45) / 0.55);
      P.rot = 1.6 * D * Math.sin((TAU * t) / 1.6);
      P.blink = false;
      break;
    }
    case "surprised": {
      const k = t % 2.8;
      if (k < 0.14) P.sy = 1 - 0.07 * easeInOut(k / 0.14);
      else if (k < 0.3) P.sy = 0.93 + 0.16 * easeOutBack((k - 0.14) / 0.16) * 0.9;
      else P.sy = 1 + spring(k - 0.3, 0.07, 15, 4.5);
      P.blink = false;
      break;
    }
    case "wait": {
      P.sy = 1 + 0.014 * breath(t, 3.8);
      P.rot = holdPoses(t, [0, 3 * D, 3 * D, 0, -2 * D], 1.4, 0.6);
      break;
    }
    case "tired": {
      const k = (t % 5.2) / 5.2;
      const s =
        k < 0.45
          ? easeInOut(k / 0.45)
          : k < 0.6
            ? 1 - easeInOut((k - 0.45) / 0.15) * 1.25
            : -0.25 + 0.25 * easeInOut((k - 0.6) / 0.4);
      P.sy = 1 + 0.02 * s;
      P.rot = -1.2 * D * Math.max(0, -s * 4) + 0.4 * D;
      P.blink = false;
      break;
    }
    case "sleep": {
      P.sy = 1 + 0.024 * breath(t, 5.2);
      P.blink = false;
      break;
    }
    case "dizzy": {
      const w = (TAU * t) / 1.4;
      P.rot = 5.5 * D * Math.sin(w) + 1.5 * D * Math.sin(2 * w + 0.5);
      P.sy = 1 - (0.015 * (1 - Math.cos(2 * w))) / 2;
      P.blink = false;
      break;
    }
  }
  P.rot += lookX * 1.6 * D;
  P.sy *= 1 - spring(pokeDt, 0.12, 22, 7);
  P.sx = 1 / Math.sqrt(P.sy); // hajmni saqlash
  return P;
}

type Tex = { tx: WebGLTexture; w: number; h: number; lid?: WebGLTexture };

export type CompanionOptions = {
  gl: HTMLCanvasElement;
  lids: HTMLCanvasElement;
  back: HTMLCanvasElement;
  base?: string;
  heightFrac?: number; // personaj balandligi kanvasga nisbatan
  onLayout?: (shadowWidthFrac: number) => void;
};

export function createCompanion(opts: CompanionOptions) {
  const base = opts.base ?? "/companion/";
  const glc = opts.gl;
  const gl = glc.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: true });
  const lctx = opts.lids.getContext("2d")!;
  const kctx = opts.back.getContext("2d")!;
  if (!gl) return null;

  const NX = 24;
  const NY = 28;
  let mood: Mood = "idle";
  let pokeAt = -1e9;
  let lookX = 0;
  let lookTarget = 0;
  let raf = 0;
  let alive = true;
  const tex: Partial<Record<Mood, Tex>> = {};
  let layout = { scale: 1, ox: 0, oy: 0 };
  let nextBlink = performance.now() + 1800;
  let blinkStart = -1;
  let doubleBlink = false;

  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; attribute vec2 uv; varying vec2 v; void main(){ v = uv; gl_Position = vec4(p, 0.0, 1.0); }"));
  gl.attachShader(
    prog,
    sh(
      gl.FRAGMENT_SHADER,
      "precision mediump float; varying vec2 v; uniform sampler2D t; uniform sampler2D t2; uniform vec4 e1; uniform vec4 e2; uniform float bl; uniform float hl;" +
        "float lid(vec4 e){ vec2 d=(v-e.xy)/e.zw; float inside=1.0-smoothstep(0.92,1.0,length(d)); float edge=e.y-e.w+bl*2.0*e.w; return inside*(1.0-smoothstep(edge-0.003,edge+0.003,v.y)); }" +
        "void main(){ vec4 c=texture2D(t,v); if(hl>0.5 && bl>0.001){ float m=max(lid(e1),lid(e2)); c=mix(c,texture2D(t2,v),m); } gl_FragColor=c; }",
    ),
  );
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const posBuf = gl.createBuffer();
  const uvBuf = gl.createBuffer();
  const idxBuf = gl.createBuffer();
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) uv.push(i / NX, j / NY);
  for (let j = 0; j < NY; j++)
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + NX + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  const loc = {
    p: gl.getAttribLocation(prog, "p"),
    uv: gl.getAttribLocation(prog, "uv"),
    t: gl.getUniformLocation(prog, "t"),
    t2: gl.getUniformLocation(prog, "t2"),
    e1: gl.getUniformLocation(prog, "e1"),
    e2: gl.getUniformLocation(prog, "e2"),
    bl: gl.getUniformLocation(prog, "bl"),
    hl: gl.getUniformLocation(prog, "hl"),
  };
  const rest = new Float32Array((NX + 1) * (NY + 1) * 2);
  const out = new Float32Array(rest.length);

  const makeTex = (im: HTMLImageElement) => {
    const tx = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tx);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tx;
  };
  const loadImg = (src: string) =>
    new Promise<HTMLImageElement>((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = rej;
      im.src = src;
    });
  const starImgs = [0, 1, 2, 3].map((k) => {
    const im = new Image();
    im.src = `${base}star${k}.png`;
    return im;
  });

  async function ensure(id: Mood) {
    if (tex[id]) return;
    const def = MOODS.find((m) => m.id === id)!;
    const im = await loadImg(`${base}${id}.png`);
    if (!alive) return;
    const t: Tex = { tx: makeTex(im), w: im.naturalWidth, h: im.naturalHeight };
    if (def.eyes.length) {
      const li = await loadImg(`${base}${id}_lid.png`);
      if (!alive) return;
      t.lid = makeTex(li);
    }
    tex[id] = t;
  }

  function fit() {
    const t = tex[mood];
    if (!t) return;
    const cw = glc.width;
    const ch = glc.height;
    const hf = opts.heightFrac ?? 0.82;
    const maxH = (mood === "sleep" ? hf * 0.64 : hf) * ch;
    const sc = Math.min(maxH / t.h, (0.74 * cw) / t.w);
    layout = { scale: sc, ox: (cw - t.w * sc) / 2, oy: ch * 0.955 - t.h * sc };
    opts.onLayout?.(((t.w * sc) / cw) * (mood === "sleep" ? 0.92 : 0.7));
  }

  function resize() {
    const r = glc.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [glc, opts.lids, opts.back]) {
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    }
    gl!.viewport(0, 0, glc.width, glc.height);
    fit();
  }

  function blinkAmount(now: number) {
    if (blinkStart < 0 && now > nextBlink) {
      blinkStart = now;
      doubleBlink = Math.random() < 0.2;
    }
    if (blinkStart < 0) return 0;
    const dt = now - blinkStart;
    const close = 75;
    const hold = 45;
    const open = 120;
    const total = close + hold + open;
    if (dt < 0) return 0;
    const v = dt < close ? easeInOut(dt / close) : dt < close + hold ? 1 : dt < total ? 1 - easeInOut((dt - close - hold) / open) : 0;
    if (dt >= total) {
      if (doubleBlink) {
        doubleBlink = false;
        blinkStart = now + 60;
        return 0;
      }
      blinkStart = -1;
      nextBlink = now + 2200 + Math.random() * 3200;
    }
    return v;
  }

  function frame(now: number) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    const t = tex[mood];
    if (!t) return;
    const def = MOODS.find((m) => m.id === mood)!;
    lookX += (lookTarget - lookX) * 0.06;
    const P = pose(mood, now / 1000, (now - pokeAt) / 1000, lookX);
    const W = t.w;
    const H = t.h;
    const F = [W * 0.5, H];
    const c = Math.cos(P.rot);
    const n = Math.sin(P.rot);
    const X = (x: number, y: number): [number, number] => {
      const dx = (x - F[0]) * P.sx;
      const dy = (y - F[1]) * P.sy;
      return [F[0] + c * dx - n * dy, F[1] + n * dx + c * dy];
    };
    const { scale, ox, oy } = layout;
    const cw = glc.width;
    const ch = glc.height;
    for (let j = 0, k = 0; j <= NY; j++)
      for (let i = 0; i <= NX; i++, k += 2) {
        const q = X((i / NX) * W, (j / NY) * H);
        out[k] = ((ox + q[0] * scale) / cw) * 2 - 1;
        out[k + 1] = 1 - ((oy + q[1] * scale) / ch) * 2;
      }
    const g = gl!;
    g.clearColor(0, 0, 0, 0);
    g.clear(g.COLOR_BUFFER_BIT);
    g.bindBuffer(g.ARRAY_BUFFER, posBuf);
    g.bufferData(g.ARRAY_BUFFER, out, g.DYNAMIC_DRAW);
    g.enableVertexAttribArray(loc.p);
    g.vertexAttribPointer(loc.p, 2, g.FLOAT, false, 0, 0);
    g.bindBuffer(g.ARRAY_BUFFER, uvBuf);
    g.enableVertexAttribArray(loc.uv);
    g.vertexAttribPointer(loc.uv, 2, g.FLOAT, false, 0, 0);
    const bl = P.blink && t.lid ? blinkAmount(now) : 0;
    g.activeTexture(g.TEXTURE0);
    g.bindTexture(g.TEXTURE_2D, t.tx);
    g.uniform1i(loc.t, 0);
    g.uniform1f(loc.hl, t.lid ? 1 : 0);
    g.uniform1f(loc.bl, bl);
    if (t.lid) {
      g.activeTexture(g.TEXTURE1);
      g.bindTexture(g.TEXTURE_2D, t.lid);
      g.uniform1i(loc.t2, 1);
      g.uniform4fv(loc.e1, def.eyes[0]);
      g.uniform4fv(loc.e2, def.eyes[1]);
      g.activeTexture(g.TEXTURE0);
    }
    g.bindBuffer(g.ELEMENT_ARRAY_BUFFER, idxBuf);
    g.drawElements(g.TRIANGLES, idx.length, g.UNSIGNED_SHORT, 0);

    lctx.clearRect(0, 0, opts.lids.width, opts.lids.height);
    kctx.clearRect(0, 0, opts.back.width, opts.back.height);
    if (bl > 0.01) for (const e of def.eyes) drawLash(X, P, W * e[0], H * e[1], W * e[2], H * e[3], bl);
    if (def.stars && def.orbit) drawStars(def, X, W, H, now / 1000);
  }

  function drawLash(X: (x: number, y: number) => [number, number], P: Pose, cx: number, cy: number, rx: number, ry: number, b: number) {
    const { scale, ox, oy } = layout;
    const p = X(cx, cy);
    lctx.save();
    lctx.translate(ox + p[0] * scale, oy + p[1] * scale);
    lctx.rotate(P.rot);
    lctx.scale(P.sx * scale, P.sy * scale);
    lctx.lineCap = "round";
    lctx.strokeStyle = "#2A2140";
    const er = rx / 1.16;
    const eh = ry / 1.16;
    if (b > 0.8) {
      lctx.globalAlpha = Math.min(1, (b - 0.8) / 0.15);
      lctx.lineWidth = Math.max(1.4 / scale, eh * 0.2);
      lctx.beginPath();
      lctx.moveTo(-er * 0.82, eh * 0.05);
      lctx.quadraticCurveTo(0, eh * 0.5, er * 0.82, eh * 0.05);
      lctx.stroke();
    } else if (b > 0.12) {
      const edge = -ry + b * 2 * ry;
      const half = rx * Math.sqrt(Math.max(0, 1 - (edge / ry) * (edge / ry)));
      lctx.globalAlpha = 0.35;
      lctx.lineWidth = Math.max(1 / scale, eh * 0.08);
      lctx.beginPath();
      lctx.moveTo(-half * 0.85, edge);
      lctx.lineTo(half * 0.85, edge);
      lctx.stroke();
    }
    lctx.restore();
  }

  function drawStars(def: StateDef, X: (x: number, y: number) => [number, number], W: number, H: number, t: number) {
    const { scale, ox, oy } = layout;
    const [ocx, ocy, orx, ory] = def.orbit!;
    const w = (TAU * t) / 1.6;
    def.stars!.forEach(([sw, shh], k) => {
      const ph = w + (k * TAU) / def.stars!.length;
      const depth = Math.sin(ph);
      const p = X(W * (ocx + orx * Math.cos(ph)), H * (ocy + ory * depth));
      const sc = (0.82 + 0.22 * depth) * scale;
      const ctx = depth < 0 ? kctx : lctx;
      const im = starImgs[k];
      if (!im.complete) return;
      ctx.save();
      ctx.globalAlpha = 0.75 + (0.25 * (depth + 1)) / 2;
      ctx.translate(ox + p[0] * scale, oy + p[1] * scale);
      ctx.rotate(ph * 0.6);
      const dw = W * sw * sc;
      const dh = H * shh * sc;
      ctx.drawImage(im, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
    });
  }

  const ro = new ResizeObserver(resize);
  ro.observe(glc);
  resize();
  raf = requestAnimationFrame(frame);
  // birinchi navbatda asosiy holat, keyin qolganlari fonda
  ensure("idle").then(() => {
    fit();
    MOODS.forEach((m) => ensure(m.id));
  });

  return {
    async setMood(m: Mood) {
      mood = m;
      await ensure(m);
      if (mood === m) fit();
    },
    poke() {
      pokeAt = performance.now();
    },
    look(x: number) {
      lookTarget = clamp(x, -1, 1);
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    },
  };
}
