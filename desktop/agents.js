// Momiq agentlar: Claude Code, Gemini CLI, Codex, Cursor va boshqa agentlarning sessiyalari —
// hook'lar orqali Unix soketga keladi; har bir agent notch'da o'z kichkina Mochi'si (pill) bilan turadi.
// Yondashuv Coucou'dan (MIT, © 2026 Louis Raillé): soket + relay skript + ~/.claude/settings.json'ga zaxira bilan qo'shish.
const { app, net: _net, Notification } = require("electron");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFile } = require("node:child_process");

// ---------- Pill katalogi (id'lar barqaror)
const CATALOG = [
  { id: "claude", name: "Claude Code", color: "#D97757", kind: "agent" },
  { id: "claude-desktop", name: "Claude", color: "#F0A080", kind: "agent", open: "/Applications/Claude.app" },
  { id: "vscode", name: "VS Code", color: "#3B9EFF", kind: "agent", open: "/Applications/Visual Studio Code.app" },
  { id: "cursor", name: "Cursor", color: "#C0C4CC", kind: "agent", open: "/Applications/Cursor.app" },
  { id: "codex", name: "Codex", color: "#2DD4BF", kind: "agent" },
  { id: "gemini", name: "Gemini CLI", color: "#8AB4F8", kind: "agent" },
  { id: "copilot", name: "Copilot CLI", color: "#818CF8", kind: "agent" },
  { id: "mail", name: "Pochta (Gmail)", color: "#2F8CFF", kind: "mail" },
  { id: "nasiya", name: "Nasiya", color: "#5E5CE6", kind: "url", url: "", path: "", label: "" },
];
const byId = (id) => CATALOG.find((c) => c.id === id);

const STEP_LABEL = {
  Read: "O'qiyapti", Glob: "Qidiryapti", Grep: "Qidiryapti", LS: "Ko'ryapti", Edit: "Tahrirlayapti", MultiEdit: "Tahrirlayapti",
  Write: "Yozyapti", NotebookEdit: "Tahrirlayapti", Bash: "Buyruq", WebSearch: "Internetda", WebFetch: "Internetda",
  Task: "Yordamchi agent", TodoWrite: "Reja", AskUserQuestion: "Savol", ExitPlanMode: "Reja tayyor",
};

function stepOf(tool, input = {}) {
  const base = STEP_LABEL[tool] || tool || "";
  const f = input.file_path || input.path || input.notebook_path;
  if (f) return `${base} · ${path.basename(String(f))}`;
  if (tool === "Bash" && input.command) return `${base} · ${String(input.command).slice(0, 48)}`;
  if (tool === "Grep" && input.pattern) return `${base} · ${String(input.pattern).slice(0, 30)}`;
  if ((tool === "WebSearch" || tool === "WebFetch") && (input.query || input.url)) return `${base} · ${String(input.query || input.url).slice(0, 40)}`;
  return base;
}

function diffOf(tool, input = {}) {
  const count = (a, b) => {
    const A = a.split("\n");
    const B = b.split("\n");
    const sa = new Set(A);
    const sb = new Set(B);
    return { added: B.filter((l) => !sa.has(l)).length, removed: A.filter((l) => !sb.has(l)).length };
  };
  if (tool === "Edit" && (input.old_string || input.new_string)) {
    const d = count(String(input.old_string || ""), String(input.new_string || ""));
    return { file: path.basename(String(input.file_path || "")), ...d, old: String(input.old_string || "").slice(0, 1500), new: String(input.new_string || "").slice(0, 1500) };
  }
  if (tool === "MultiEdit" && Array.isArray(input.edits)) {
    let added = 0;
    let removed = 0;
    for (const e of input.edits) {
      const d = count(String(e.old_string || ""), String(e.new_string || ""));
      added += d.added;
      removed += d.removed;
    }
    return { file: path.basename(String(input.file_path || "")), added, removed };
  }
  if (tool === "Write" && input.content) return { file: path.basename(String(input.file_path || "")), added: String(input.content).split("\n").length, removed: 0, isNew: true };
  return null;
}

function createAgents(opts) {
  const { store, saveStore, onChange, say, sound } = opts;
  store.pills ??= { active: ["claude", "mail"], nasiya: { url: "", path: "", label: "Nasiya" } };
  const sessions = new Map(); // key: agent|session_id
  const pending = new Map(); // id → { socket, session, tool, input, suggestions, at, kind, questions }
  const pillState = new Map(); // pill id → { state, text, until }
  const finishTimers = new Map();
  let server = null;

  const sockPath = () => path.join(app.getPath("userData"), "momiq.sock");
  const hookPath = () => path.join(app.getPath("userData"), "momiq-hook");

  // ---------- Relay skriptni joylash
  function installRelay() {
    const dir = app.getPath("userData");
    fs.mkdirSync(dir, { recursive: true });
    const py = fs.readFileSync(path.join(__dirname, "hooks", "momiq-hook.py"), "utf8");
    fs.writeFileSync(path.join(dir, "momiq-hook.py"), py);
    fs.writeFileSync(hookPath(), `#!/bin/sh\nexec /usr/bin/env python3 "${path.join(dir, "momiq-hook.py")}" "$@"\n`);
    fs.chmodSync(hookPath(), 0o755);
  }

  // ---------- Soket serveri
  function start() {
    installRelay();
    try {
      fs.unlinkSync(sockPath());
    } catch {}
    server = net.createServer((sock) => {
      let buf = "";
      let done = false;
      sock.setEncoding("utf8");
      sock.on("data", (d) => {
        buf += d;
        const nl = buf.indexOf("\n");
        if (nl < 0 || done) return;
        done = true;
        let payload = null;
        try {
          payload = JSON.parse(buf.slice(0, nl));
        } catch {}
        if (!payload || typeof payload !== "object") return sock.end();
        handle(payload, sock);
      });
      sock.on("error", () => {});
      setTimeout(() => {
        if (!done) sock.destroy();
      }, 5000);
    });
    server.on("error", (e) => console.error("[momiq hooks]", e.message));
    server.listen(sockPath(), () => {
      try {
        fs.chmodSync(sockPath(), 0o600);
      } catch {}
    });
  }

  const agentOf = (p) => {
    const a = String(p.momiq_agent || "");
    if (/^[a-z0-9-]{1,24}$/.test(a)) return a;
    if (/vscode/i.test(String(p.term_program || ""))) return "vscode";
    return "claude";
  };

  function session(p) {
    const agent = agentOf(p);
    const id = String(p.session_id || "unknown");
    const key = `${agent}|${id}`;
    let s = sessions.get(key);
    if (!s) {
      s = { key, agent, id, project: "", title: "", state: "idle", step: "", steps: [], prompt: "", answer: "", diff: null, startedAt: Date.now(), updatedAt: Date.now(), cwd: "", pending: null };
      sessions.set(key, s);
    }
    const cwd = p.session_root || p.cwd || s.cwd;
    if (cwd) {
      s.cwd = cwd;
      s.project = path.basename(cwd);
    }
    if (p.session_title) s.title = String(p.session_title);
    s.updatedAt = Date.now();
    return s;
  }

  function setState(s, state, step) {
    s.state = state;
    if (step) {
      s.step = step;
      s.steps.push({ t: Date.now(), text: step, state });
      if (s.steps.length > 40) s.steps.shift();
    }
    clearTimeout(finishTimers.get(s.key));
  }

  function handle(p, sock) {
    const ev = String(p.hook_event_name || "");
    const s = session(p);
    const tool = String(p.tool_name || "");
    const input = p.tool_input && typeof p.tool_input === "object" ? p.tool_input : {};
    let reply = null;
    switch (ev) {
      case "SessionStart":
        setState(s, "idle", "Sessiya boshlandi");
        break;
      case "UserPromptSubmit":
        s.prompt = String(p.prompt || "").slice(0, 300);
        s.answer = "";
        s.pending = null;
        setState(s, "thinking", s.prompt ? `“${s.prompt.slice(0, 60)}”` : "O'ylayapti");
        break;
      case "PreToolUse":
        if (tool === "AskUserQuestion" && Array.isArray(input.questions)) {
          // savol kartasi — javobni notch'dan beramiz; relay 118 s kutadi, bo'lmasa terminalda so'raydi
          const id = `${s.key}|q|${Date.now()}`;
          setState(s, "question", "Savol berdi");
          s.pending = { kind: "question", id, questions: input.questions.slice(0, 4), at: Date.now() };
          pending.set(id, { sock, s, timer: setTimeout(() => answer(id, null), 115_000) });
          sound?.("question");
          notify(`${s.project || s.agent}: savol`, String(input.questions[0]?.question || "").slice(0, 120));
          onChange();
          return;
        }
        setState(s, tool === "WebSearch" || tool === "WebFetch" || tool === "Grep" || tool === "Glob" ? "searching" : "working", stepOf(tool, input));
        {
          const d = diffOf(tool, input);
          if (d) s.diff = d;
        }
        break;
      case "PostToolUse":
      case "PostToolUseFailure":
        if (s.state !== "approval" && s.state !== "question") setState(s, "working");
        break;
      case "PermissionRequest": {
        const id = `${s.key}|${Date.now()}`;
        s.pending = { kind: "approval", id, tool, input, text: stepOf(tool, input), command: tool === "Bash" ? String(input.command || "") : "", suggestions: p.permission_suggestions || [], at: Date.now() };
        setState(s, "approval", `Ruxsat so'rayapti · ${stepOf(tool, input)}`);
        pending.set(id, { sock, s, timer: setTimeout(() => answer(id, null), 115_000) });
        sound?.("approval");
        notify(`${s.project || s.agent}: ruxsat kerak`, s.pending.text);
        onChange();
        return; // soket javobgacha ochiq qoladi
      }
      case "Notification": {
        const t = String(p.notification_type || p.message || "").toLowerCase();
        if (/rate.?limit|usage limit/.test(t)) setState(s, "ratelimit", "Limit tugadi");
        else if (/permission|approval/.test(t) && s.state !== "approval") setState(s, "approval", String(p.message || "Ruxsat kerak").slice(0, 80));
        else if (/idle|waiting/.test(t)) setState(s, "idle", "Kutyapti");
        break;
      }
      case "Stop":
        s.answer = String(p.last_assistant_message || "").slice(0, 4000);
        s.pending = null;
        setState(s, "finished", "Tugatdi");
        sound?.("finish");
        notify(`${s.project || s.agent} tugatdi`, s.answer.slice(0, 120) || "Momiq: ish tugadi ✅");
        finishTimers.set(s.key, setTimeout(() => {
          if (s.state === "finished") {
            s.state = "idle";
            onChange();
          }
        }, 6000));
        break;
      case "StopFailure":
        setState(s, "error", "Xato");
        sound?.("error");
        break;
      case "SessionEnd":
        sessions.delete(s.key);
        break;
      case "SubagentStart":
        setState(s, s.state, "Yordamchi agent ishga tushdi");
        break;
      case "SubagentStop":
        setState(s, s.state, "Yordamchi agent tugatdi");
        break;
      default:
        break;
    }
    try {
      sock.end((reply ? JSON.stringify(reply) : '{"ok":true}') + "\n");
    } catch {}
    onChange();
  }

  function notify(title, body) {
    if (!store.agentNotify) return;
    try {
      new Notification({ title, body, silent: true }).show();
    } catch {}
  }

  /** Ruxsat javobi: allow | always | deny | null (terminalda so'rasin). Savol uchun: { answers: {header: text} } */
  function answer(id, decision) {
    const e = pending.get(id);
    if (!e) return;
    pending.delete(id);
    clearTimeout(e.timer);
    const s = e.s;
    const isQ = s.pending?.kind === "question" && s.pending.id === id;
    try {
      e.sock.end(JSON.stringify(isQ ? { answers: decision && typeof decision === "object" ? decision : null } : { decision: typeof decision === "string" ? decision : "ask" }) + "\n");
    } catch {}
    if (s.pending?.id === id) s.pending = null;
    if (isQ) setState(s, "working", decision ? "Javob berildi" : "Terminalda javob berasiz");
    else setState(s, decision === "deny" ? "idle" : "working", decision === "deny" ? "Rad etildi" : decision ? "Ruxsat berildi" : "Terminalda so'raydi");
    onChange();
  }

  // ---------- Integratsiyalar: Pochta (Mail.app orqali Gmail), URL pill (Nasiya)
  const integ = { mail: { unread: null, err: "" }, nasiya: { value: "", err: "" } };
  function pollMail() {
    if (!store.pills.active.includes("mail") || process.platform !== "darwin") return;
    execFile("/usr/bin/osascript", ["-e", 'tell application "Mail" to if it is running then get unread count of inbox'], { timeout: 8000 }, (err, out) => {
      if (err) {
        integ.mail = { unread: null, err: "Mail.app ochiq emas" };
      } else {
        const n = parseInt(String(out).trim(), 10);
        integ.mail = { unread: Number.isFinite(n) ? n : null, err: Number.isFinite(n) ? "" : "Mail.app ochiq emas" };
      }
      onChange();
    });
  }
  function pollUrl() {
    const cfg = store.pills.nasiya;
    if (!store.pills.active.includes("nasiya") || !cfg?.url) return;
    try {
      const req = _net.request(cfg.url);
      let body = "";
      req.on("response", (res) => {
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          try {
            let v = JSON.parse(body);
            for (const k of String(cfg.path || "").split(".").filter(Boolean)) v = v?.[k];
            integ.nasiya = { value: typeof v === "object" ? JSON.stringify(v).slice(0, 40) : String(v ?? ""), err: "" };
          } catch {
            integ.nasiya = { value: body.trim().slice(0, 40), err: "" };
          }
          onChange();
        });
      });
      req.on("error", (e) => {
        integ.nasiya = { value: "", err: e.message };
        onChange();
      });
      req.end();
    } catch (e) {
      integ.nasiya = { value: "", err: e.message };
    }
  }
  setInterval(pollMail, 60_000);
  setInterval(pollUrl, 120_000);
  setTimeout(() => {
    pollMail();
    pollUrl();
  }, 4000);

  // ---------- Holat (renderer uchun)
  const RANK = { approval: 6, question: 5, error: 4, ratelimit: 3, working: 2, searching: 2, thinking: 2, finished: 1, idle: 0 };
  function snapshot() {
    const list = [...sessions.values()].sort((a, b) => (RANK[b.state] ?? 0) - (RANK[a.state] ?? 0) || b.updatedAt - a.updatedAt);
    const pills = [];
    const seen = new Set();
    const add = (id, extra = {}) => {
      if (seen.has(id)) return;
      seen.add(id);
      const c = byId(id) || { id, name: id, color: "#9AA0A6", kind: "agent" };
      const ss = list.filter((s) => s.agent === id);
      const top = ss[0];
      pills.push({ id, name: c.name, color: c.color, kind: c.kind, state: top?.state ?? "idle", count: ss.length, text: top?.step ?? "", open: c.open || "", ...extra });
    };
    for (const s of list) add(s.agent);
    for (const id of store.pills.active) {
      if (id === "mail") add("mail", { state: integ.mail.unread ? "working" : "idle", text: integ.mail.err || (integ.mail.unread == null ? "" : `${integ.mail.unread} o'qilmagan`), value: integ.mail.unread ?? "" });
      else if (id === "nasiya") add("nasiya", { name: store.pills.nasiya.label || "Nasiya", state: "idle", text: integ.nasiya.err || integ.nasiya.value, value: integ.nasiya.value });
      else add(id);
    }
    return {
      pills,
      sessions: list.map((s) => ({ key: s.key, agent: s.agent, agentName: byId(s.agent)?.name || s.agent, color: byId(s.agent)?.color || "#9AA0A6", project: s.project, title: s.title, state: s.state, step: s.step, steps: s.steps.slice(-8), prompt: s.prompt, answer: s.answer, diff: s.diff, pending: s.pending, startedAt: s.startedAt, updatedAt: s.updatedAt })),
      hooks: hookStatus(),
      catalog: CATALOG.map((c) => ({ id: c.id, name: c.name, color: c.color, kind: c.kind })),
      active: store.pills.active,
      nasiya: store.pills.nasiya,
      notify: !!store.agentNotify,
    };
  }

  // ---------- Hook o'rnatish: ~/.claude/settings.json, ~/.gemini/settings.json, ~/.cursor/hooks.json
  const HOME = os.homedir();
  const files = {
    claude: path.join(HOME, ".claude", "settings.json"),
    gemini: path.join(HOME, ".gemini", "settings.json"),
    cursor: path.join(HOME, ".cursor", "hooks.json"),
  };
  function readJson(file) {
    if (!fs.existsSync(file)) return { obj: {}, raw: null };
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return { obj: {}, raw };
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("JSON obyekt emas");
    return { obj, raw };
  }
  function writeJson(file, obj, raw) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (raw != null) fs.writeFileSync(`${file}.momiq-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`, raw);
    fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
  }
  const isOurs = (h) => typeof h?.command === "string" && h.command.includes("momiq-hook");
  const cmd = () => `"${hookPath()}"`;

  function installClaude() {
    const { obj, raw } = readJson(files.claude);
    const hooks = obj.hooks && typeof obj.hooks === "object" ? obj.hooks : {};
    const events = [["SessionStart", 10], ["SessionEnd", 10], ["UserPromptSubmit", 10], ["PreToolUse", 10], ["PostToolUse", 10], ["PostToolUseFailure", 10], ["PermissionRequest", 120], ["Notification", 10], ["Stop", 10], ["StopFailure", 10], ["SubagentStart", 10], ["SubagentStop", 10]];
    for (const [ev, timeout] of events) {
      let groups = Array.isArray(hooks[ev]) ? hooks[ev] : [];
      groups = groups.map((g) => ({ ...g, hooks: Array.isArray(g.hooks) ? g.hooks.filter((h) => !isOurs(h)) : g.hooks })).filter((g) => !Array.isArray(g.hooks) || g.hooks.length);
      groups.push({ hooks: [{ type: "command", command: cmd(), timeout }] });
      hooks[ev] = groups;
    }
    // AskUserQuestion: javobni notch'dan berish uchun alohida, uzoqroq kutadigan hook
    hooks.PreToolUse.push({ matcher: "AskUserQuestion", hooks: [{ type: "command", command: cmd(), timeout: 130 }] });
    obj.hooks = hooks;
    writeJson(files.claude, obj, raw);
  }
  function installGemini() {
    const { obj, raw } = readJson(files.gemini);
    const hooks = obj.hooks && typeof obj.hooks === "object" ? obj.hooks : {};
    for (const [ev, timeout] of [["BeforeAgent", 10000], ["BeforeTool", 10000], ["AfterTool", 10000], ["AfterAgent", 10000]]) {
      let groups = Array.isArray(hooks[ev]) ? hooks[ev] : [];
      groups = groups.map((g) => ({ ...g, hooks: Array.isArray(g.hooks) ? g.hooks.filter((h) => !isOurs(h)) : g.hooks })).filter((g) => !Array.isArray(g.hooks) || g.hooks.length);
      groups.push({ hooks: [{ type: "command", command: `${cmd()} --agent gemini ${ev}`, timeout }] });
      hooks[ev] = groups;
    }
    obj.hooks = hooks;
    writeJson(files.gemini, obj, raw);
  }
  function installCursor() {
    const { obj, raw } = readJson(files.cursor);
    obj.version ??= 1;
    const hooks = obj.hooks && typeof obj.hooks === "object" ? obj.hooks : {};
    for (const ev of ["beforeSubmitPrompt", "beforeShellExecution", "beforeMCPExecution", "afterFileEdit", "stop"]) {
      let list = Array.isArray(hooks[ev]) ? hooks[ev].filter((h) => !isOurs(h)) : [];
      list.push({ command: `${cmd()} --agent cursor ${ev}` });
      hooks[ev] = list;
    }
    obj.hooks = hooks;
    writeJson(files.cursor, obj, raw);
  }
  function uninstall(which) {
    const file = files[which];
    if (!fs.existsSync(file)) return;
    const { obj, raw } = readJson(file);
    if (!obj.hooks) return;
    for (const ev of Object.keys(obj.hooks)) {
      const v = obj.hooks[ev];
      if (!Array.isArray(v)) continue;
      obj.hooks[ev] = which === "cursor" ? v.filter((h) => !isOurs(h)) : v.map((g) => ({ ...g, hooks: Array.isArray(g.hooks) ? g.hooks.filter((h) => !isOurs(h)) : g.hooks })).filter((g) => !Array.isArray(g.hooks) || g.hooks.length);
      if (!obj.hooks[ev].length) delete obj.hooks[ev];
    }
    writeJson(file, obj, raw);
  }
  function hookStatus() {
    const st = {};
    for (const k of Object.keys(files)) {
      try {
        st[k] = fs.existsSync(files[k]) && fs.readFileSync(files[k], "utf8").includes("momiq-hook");
      } catch {
        st[k] = false;
      }
    }
    return st;
  }
  function install(which) {
    try {
      installRelay();
      if (which === "claude") installClaude();
      else if (which === "gemini") installGemini();
      else if (which === "cursor") installCursor();
      say?.(`${byId(which)?.name || which} hook'lari o'rnatildi ✅ Yangi sessiya ochilganda ko'raman.`, 5000);
    } catch (e) {
      say?.(`Hook o'rnatilmadi: ${e.message}`, 6000);
    }
    onChange();
  }

  function setActive(id, on) {
    const a = new Set(store.pills.active);
    on ? a.add(id) : a.delete(id);
    store.pills.active = [...a];
    saveStore();
    if (id === "mail" && on) pollMail();
    if (id === "nasiya" && on) pollUrl();
    onChange();
  }
  function setNasiya(cfg) {
    store.pills.nasiya = { url: String(cfg.url || ""), path: String(cfg.path || ""), label: String(cfg.label || "Nasiya") };
    saveStore();
    pollUrl();
    onChange();
  }

  // Sinov uchun: soxta sessiya
  function demo() {
    const base = { session_id: "demo-1", cwd: "/Users/ilevel/deepfokus", transcript_path: "" };
    const fake = (p) => handle({ ...base, ...p }, { end() {} });
    fake({ hook_event_name: "SessionStart" });
    fake({ hook_event_name: "UserPromptSubmit", prompt: "Taymer bugini tuzat" });
    setTimeout(() => fake({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "lib/store.ts" } }), 800);
    setTimeout(() => fake({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: "components/App.tsx", old_string: "const a = 1;\nconst b = 2;", new_string: "const a = 1;\nconst b = 3;\nconst c = 4;" } }), 1600);
    setTimeout(() => handle({ ...base, hook_event_name: "PermissionRequest", tool_name: "Bash", tool_input: { command: "npm run build" }, permission_suggestions: [] }, { end() {} }), 2600);
    setTimeout(() => fake({ ...base, session_id: "demo-2", cwd: "/Users/ilevel/nasiya", momiq_agent: "gemini", hook_event_name: "UserPromptSubmit", prompt: "Hisobot" }), 1200);
  }

  return { start, snapshot, answer, install, uninstall: (w) => { uninstall(w); onChange(); }, setActive, setNasiya, demo, pollMail, pollUrl };
}

module.exports = { createAgents, CATALOG };
