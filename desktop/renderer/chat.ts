// Momiq suhbat oynasi: savol-javob Claude obunasi orqali (asosiy jarayon Claude Code'ni chaqiradi)
type Msg = { role: "user" | "momiq"; text: string; files?: string[]; error?: boolean };
declare global {
  interface Window {
    df: {
      onChat: (cb: (c: { log: Msg[]; busy: boolean }) => void) => void;
      pathsFor: (files: FileList | File[]) => string[];
      fileIcon: (p: string) => Promise<string>;
      chatSend: (m: { text: string; files: string[] }) => void;
      chatNew: () => void;
      chatClose: () => void;
    };
  }
}
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
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
    log.innerHTML = `<div class="empty"><img src="ghost/smile.png" alt="">Salom! Men Momiqman 👻<br>Savol bering yoki menga fayl tashlang —<br>ko'rib chiqib javob beraman.</div>`;
    return;
  }
  log.innerHTML = list
    .map((m) => {
      const chips = m.files?.length ? `<div class="fchips">${m.files.map((f) => `<span class="fchip">📄 ${esc(f)}</span>`).join("")}</div>` : "";
      return `<div class="msg ${m.role}${m.error ? " error" : ""}">${chips}${fmt(m.text || (m.files?.length ? "" : ""))}</div>`;
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

window.df.onChat((c) => {
  busy = c.busy;
  send.disabled = busy;
  render(c.log);
});
render([]);
q.focus();
export {};
