// Momiq ovozi: eshitish — ElevenLabs Scribe v2 (99 til, o'zbekcha ham), gapirish — Eleven v3 (74 til).
// Miya — Claude (kompyuterdagi Claude Code, obuna orqali). Kalit Keychain'da (safeStorage) saqlanadi.
const { app, safeStorage } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const API = process.env.MOMIQ_ELEVEN_API || "https://api.elevenlabs.io/v1";
const keyFile = () => path.join(app.getPath("userData"), "keys.bin");

let cache = null;
function readKeys() {
  if (cache) return cache;
  try {
    const raw = fs.readFileSync(keyFile());
    cache = JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString("utf8"));
  } catch {
    cache = {};
  }
  return cache;
}
function writeKeys(obj) {
  cache = obj;
  const s = JSON.stringify(obj);
  fs.writeFileSync(keyFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(s) : Buffer.from(s, "utf8"), { mode: 0o600 });
}
const key = () => readKeys().elevenlabs || "";
const hasKey = () => !!key();
function setKey(k) {
  writeKeys({ ...readKeys(), elevenlabs: String(k || "").trim() });
}

async function call(url, init = {}) {
  const r = await fetch(url, { ...init, headers: { "xi-api-key": key(), ...(init.headers || {}) } });
  if (!r.ok) {
    let msg = `${r.status}`;
    try {
      const j = await r.json();
      msg = j?.detail?.message || j?.detail?.status || j?.detail || JSON.stringify(j).slice(0, 200);
    } catch {}
    if (r.status === 401) throw new Error("ElevenLabs kaliti noto'g'ri yoki muddati tugagan");
    throw new Error(`ElevenLabs: ${msg}`);
  }
  return r;
}

/** Ovozni matnga: Scribe v2, tilni o'zi aniqlaydi. */
async function transcribe(buf, mime = "audio/webm", lang = "") {
  if (!hasKey()) throw new Error("ElevenLabs kaliti kiritilmagan");
  const fd = new FormData();
  fd.append("model_id", "scribe_v2");
  fd.append("tag_audio_events", "false");
  fd.append("diarize", "false");
  if (lang) fd.append("language_code", lang);
  fd.append("file", new Blob([buf], { type: mime }), "momiq.webm");
  let r;
  try {
    r = await call(`${API}/speech-to-text`, { method: "POST", body: fd });
  } catch (e) {
    if (!/model/i.test(e.message)) throw e;
    fd.set("model_id", "scribe_v1");
    r = await call(`${API}/speech-to-text`, { method: "POST", body: fd });
  }
  const j = await r.json();
  return { text: String(j.text || "").trim(), lang: String(j.language_code || "") };
}

/** Matnni ovozga: Eleven v3 (bo'lmasa multilingual v2). mp3 buffer qaytaradi. */
async function speak(text, voiceId, lang = "") {
  if (!hasKey()) throw new Error("ElevenLabs kaliti kiritilmagan");
  const vid = voiceId || (await defaultVoice());
  const url = `${API}/text-to-speech/${vid}?output_format=mp3_44100_96`;
  const body = (model) => ({ text: text.slice(0, 2500), model_id: model, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } });
  let r;
  try {
    r = await call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body("eleven_v3")) });
  } catch (e) {
    r = await call(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body("eleven_multilingual_v2") }) });
  }
  return Buffer.from(await r.arrayBuffer());
}

let voicesCache = null;
async function voices() {
  if (!hasKey()) return [];
  if (voicesCache) return voicesCache;
  const r = await call(`${API}/voices?show_legacy=false`);
  const j = await r.json();
  voicesCache = (j.voices || []).map((v) => ({ id: v.voice_id, name: v.name, labels: v.labels || {} })).slice(0, 60);
  return voicesCache;
}
async function defaultVoice() {
  const v = await voices();
  const pick = v.find((x) => /multilingual|george|aria|sarah|liam/i.test(`${x.name} ${JSON.stringify(x.labels)}`)) || v[0];
  return pick?.id || "JBFqnCBsd6RMkjVDRZzb";
}
async function check() {
  const r = await call(`${API}/user/subscription`);
  const j = await r.json();
  return { ok: true, tier: j.tier, used: j.character_count, limit: j.character_limit };
}

module.exports = { hasKey, setKey, transcribe, speak, voices, check };
