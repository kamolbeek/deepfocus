// Momiq suhbat oynasi: savol-javob Claude obunasi orqali (asosiy jarayon Claude Code'ni chaqiradi)
type Msg = { role: "user" | "momiq"; text: string; files?: string[]; error?: boolean; voice?: boolean };
type VoiceSettings = { hasKey: boolean; voices: { id: string; name: string; labels: Record<string, string> }[]; account: { ok: boolean; tier?: string; used?: number; limit?: number; error?: string } | null; voiceId: string; voiceReply: boolean; voiceLang: string };
declare global {
  interface Window {
    df: {
      onChat: (cb: (c: { log: Msg[]; busy: boolean }) => void) => void;
      pathsFor: (files: FileList | File[]) => string[];
      fileIcon: (p: string) => Promise<string>;
      chatSend: (m: { text: string; files: string[] }) => void;
      chatNew: () => void;
      chatClose: () => void;
      onVoice: (cb: (v: { status: string; message?: string }) => void) => void;
      onVoiceAudio: (cb: (b64: string) => void) => void;
      onVoiceStart: (cb: () => void) => void;
      voiceStt: (m: { data: string; mime: string }) => Promise<{ ok: boolean; text?: string; error?: string }>;
      voiceDone: () => void;
      voiceListening?: () => void;
      voiceSay: (t: string) => void;
      voiceSettings: () => Promise<VoiceSettings>;
      voiceConfig: (c: Partial<{ key: string; voiceId: string; voiceReply: boolean; voiceLang: string }>) => void;
    };
  }
}
import { BotEngine } from "./buddy/engine";
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
// Momiq (Mochi) — sarlavhada va bo'sh holatda jonli
function liveBot(c: HTMLCanvasElement, size: number) {
  c.width = size * 2;
  c.height = size * 2;
  const e = new BotEngine();
  e.particleOverhang = 10;
  const g = c.getContext("2d")!;
  let last = performance.now();
  const loop = (t: number) => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (c.isConnected) {
      e.update(dt);
      g.setTransform(2, 0, 0, 2, 0, 0);
      g.clearRect(0, 0, size, size);
      e.draw(g, size, size);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return e;
}
const headBot = liveBot($<HTMLCanvasElement>("av"), 30);
const log = $("log");
const q = $<HTMLTextAreaElement>("q");
const send = $<HTMLButtonElement>("send");
let busy = false;
let pending: string[] = [];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
function fmt(t: string) {
  const parts = t.split(/```[a-zA-Z0-9]*\n?/);
  return parts
    .map((p, i) =>
      i % 2
        ? `<pre><code>${esc(p.replace(/\n$/, ""))}</code></pre>`
        : esc(p)
            .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
            .replace(/`([^`\n]+)`/g, "<code>$1</code>"),
    )
    .join("");
}

function render(list: Msg[]) {
  if (!list.length && !busy) {
    log.innerHTML = `<div class="empty"><canvas id="avbig"></canvas>Salom! Men Momiqman.<br>Savol bering, fayl tashlang yoki 🎙 bosib gapiring —<br>o'zbekcha ham, boshqa tillarda ham.</div>`;
    const big = liveBot($<HTMLCanvasElement>("avbig"), 90);
    setTimeout(() => big.triggerEmote("happy", 1.5), 400);
    return;
  }
  log.innerHTML = list
    .map((m) => {
      const chips = m.files?.length ? `<div class="fchips">${m.files.map((f) => `<span class="fchip">📄 ${esc(f)}</span>`).join("")}</div>` : "";
      return `<div class="msg ${m.role}${m.error ? " error" : ""}${m.voice && m.role === "user" ? " voice" : ""}">${chips}${fmt(m.text || "")}</div>`;
    })
    .join("") + (busy ? `<div class="typing"><i></i><i></i><i></i></div>` : "");
  log.scrollTop = log.scrollHeight;
}

async function renderFiles() {
  const box = $("files");
  box.hidden = !pending.length;
  box.innerHTML = "";
  for (const f of pending) {
    const s = document.createElement("span");
    const icon = await window.df.fileIcon(f);
    s.innerHTML = `${icon ? `<img src="${icon}" alt="">` : ""}${esc(f.split("/").pop() || f)}<button aria-label="Olib tashlash">✕</button>`;
    s.querySelector("button")!.addEventListener("click", () => {
      pending = pending.filter((x) => x !== f);
      renderFiles();
    });
    box.appendChild(s);
  }
}

function submit() {
  const text = q.value.trim();
  if (busy || (!text && !pending.length)) return;
  window.df.chatSend({ text, files: pending });
  q.value = "";
  pending = [];
  renderFiles();
  grow();
}
function grow() {
  q.style.height = "auto";
  q.style.height = `${Math.min(110, q.scrollHeight)}px`;
}
$("form").addEventListener("submit", (e) => {
  e.preventDefault();
  submit();
});
q.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
});
q.addEventListener("input", grow);
$("new").addEventListener("click", () => window.df.chatNew());
$("close").addEventListener("click", () => window.df.chatClose());
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") window.df.chatClose();
});

// fayl tashlash
const drop = $("drop");
let depth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  depth++;
  drop.hidden = false;
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", () => {
  if (--depth <= 0) {
    depth = 0;
    drop.hidden = true;
  }
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  depth = 0;
  drop.hidden = true;
  const paths = window.df.pathsFor(e.dataTransfer?.files ?? []);
  pending = [...new Set([...pending, ...paths])];
  renderFiles();
  q.focus();
});

// ---------- Ovoz: yozib olish (gapirib bo'lsangiz o'zi to'xtaydi), Scribe → Claude → Eleven v3
const mic = $<HTMLButtonElement>("mic");
const vstat = $("vstat");
const vtext = $("vtext");
let rec: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let vad = { raf: 0, silentSince: 0, spoke: false, ctx: null as AudioContext | null };
let player: HTMLAudioElement | null = null;
let listening = false;

function setStatus(st: string, text?: string) {
  vstat.hidden = st === "idle";
  vstat.className = `vstat ${st}`;
  vtext.textContent = text ?? (st === "listening" ? "Tinglayapman… gapirib bo'lsangiz o'zi to'xtaydi" : st === "thinking" ? "O'ylayapti…" : st === "speaking" ? "Gapiryapti…" : "");
  mic.classList.toggle("on", st === "listening");
  mic.classList.toggle("busy", st === "thinking");
}
async function startListening() {
  if (listening) return stopListening();
  stopAudio();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    setStatus("error", "Mikrofonga ruxsat berilmagan: Tizim sozlamalari → Maxfiylik → Mikrofon → DeepFokus");
    return;
  }
  listening = true;
  chunks = [];
  const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
  rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    const blob = new Blob(chunks, { type: mime });
    cleanupMic();
    if (!vad.spoke || blob.size < 2000) return setStatus("idle");
    setStatus("thinking");
    const b64 = btoa(String.fromCharCode(...new Uint8Array(await blob.arrayBuffer())));
    const r = await window.df.voiceStt({ data: b64, mime });
    if (!r.ok) setStatus("error", r.error);
    else if (!r.text) setStatus("error", "Hech narsa eshitilmadi, yana urinib ko'ring");
  };
  rec.start(250);
  setStatus("listening");
  window.df.voiceListening?.();
  // VAD: ovoz darajasi bo'yicha — 1.4 s jimlikdan keyin to'xtaydi (gapirmasa 8 s)
  const actx = new AudioContext();
  vad = { raf: 0, silentSince: performance.now(), spoke: false, ctx: actx };
  const src = actx.createMediaStreamSource(stream);
  const an = actx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const t0 = performance.now();
  const tick = () => {
    if (!listening) return;
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    const now = performance.now();
    if (rms > 0.02) {
      vad.spoke = true;
      vad.silentSince = now;
    }
    if ((vad.spoke && now - vad.silentSince > 1400) || (!vad.spoke && now - t0 > 8000) || now - t0 > 60000) return stopListening();
    vad.raf = requestAnimationFrame(tick);
  };
  vad.raf = requestAnimationFrame(tick);
}
function stopListening() {
  if (!listening) return;
  listening = false;
  cancelAnimationFrame(vad.raf);
  try {
    rec?.state !== "inactive" && rec?.stop();
  } catch {}
}
function cleanupMic() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  vad.ctx?.close().catch(() => {});
  vad.ctx = null;
}
function stopAudio() {
  if (player) {
    player.pause();
    player.src = "";
    player = null;
    window.df.voiceDone();
  }
}
mic.addEventListener("click", startListening);
$("vstop").addEventListener("click", () => {
  if (listening) stopListening();
  else {
    stopAudio();
    setStatus("idle");
  }
});
window.df.onVoiceStart(() => startListening());
window.df.onVoice((v) => {
  headBot.setState(v.status === "thinking" ? "thinking" : v.status === "listening" ? "searching" : "idle");
  if (v.status === "error") setStatus("error", v.message || "Xato");
  else if (v.status === "speaking") setStatus("speaking");
  else if (v.status === "thinking") setStatus("thinking");
  else setStatus("idle");
});
window.df.onVoiceAudio((b64) => {
  stopAudio();
  player = new Audio(`data:audio/mpeg;base64,${b64}`);
  player.onended = () => {
    player = null;
    window.df.voiceDone();
    setStatus("idle");
  };
  player.play().catch(() => setStatus("idle"));
});
window.addEventListener("keydown", (e) => {
  if (e.key === " " && document.activeElement !== q && !busy) {
    e.preventDefault();
    startListening();
  }
});

// ---------- Ovoz sozlamalari
const vpanel = $("vpanel");
async function openVoicePanel() {
  vpanel.hidden = false;
  const s = await window.df.voiceSettings();
  const sel = $<HTMLSelectElement>("vvoice");
  sel.innerHTML = s.voices.length ? s.voices.map((v) => `<option value="${v.id}" ${v.id === s.voiceId ? "selected" : ""}>${esc(v.name)}${v.labels?.gender ? ` · ${esc(v.labels.gender)}` : ""}${v.labels?.accent ? ` · ${esc(v.labels.accent)}` : ""}</option>`).join("") : `<option value="">Kalit kiritilgach ro'yxat chiqadi</option>`;
  $<HTMLSelectElement>("vlang").value = s.voiceLang || "";
  $<HTMLInputElement>("vreply").checked = s.voiceReply;
  $<HTMLInputElement>("vkey").value = "";
  $<HTMLInputElement>("vkey").placeholder = s.hasKey ? "Kalit saqlangan — almashtirish uchun yangisini yozing" : "sk_…";
  $("vinfo").textContent = s.account ? (s.account.ok ? `Ulangan · ${s.account.tier} · ${s.account.used}/${s.account.limit} belgi` : s.account.error || "") : "";
}
$("vset").addEventListener("click", openVoicePanel);
$("vclose").addEventListener("click", () => (vpanel.hidden = true));
$("vlink").addEventListener("click", () => window.open("https://elevenlabs.io/app/settings/api-keys"));
$("vsave").addEventListener("click", async () => {
  const key = $<HTMLInputElement>("vkey").value.trim();
  window.df.voiceConfig({ ...(key ? { key } : {}), voiceId: $<HTMLSelectElement>("vvoice").value, voiceReply: $<HTMLInputElement>("vreply").checked, voiceLang: $<HTMLSelectElement>("vlang").value });
  $("vinfo").textContent = "Saqlandi";
  setTimeout(openVoicePanel, 400);
});
$("vtest").addEventListener("click", () => {
  vpanel.hidden = true;
  window.df.voiceSay("Salom! Men Momiqman. Endi siz bilan gaplasha olaman: o'zbekcha ham, boshqa tillarda ham.");
});

window.df.onChat((c) => {
  busy = c.busy;
  send.disabled = busy;
  render(c.log);
});
render([]);
q.focus();
export {};
