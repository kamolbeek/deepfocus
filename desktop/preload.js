const { contextBridge, ipcRenderer, webUtils } = require("electron");

const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, v) => cb(v));
contextBridge.exposeInMainWorld("df", {
  onState: on("state"),
  onCursor: on("cursor"),
  onActivity: on("activity"),
  onSound: on("sound"),
  onWalk: on("walk"),
  onArrive: on("arrive"),
  onTestOpen: on("test-open"),
  onGeom: on("geom"),
  onChat: on("chat"),
  // tashlangan fayllarning diskdagi yo'li
  pathsFor: (files) => Array.from(files || []).map((f) => { try { return webUtils.getPathForFile(f); } catch { return ""; } }).filter(Boolean),
  fileIcon: (p) => ipcRenderer.invoke("file-icon", p),
  chatSend: (m) => ipcRenderer.send("chat-send", m),
  chatNew: () => ipcRenderer.send("chat-new"),
  chatClose: () => ipcRenderer.send("chat-close"),
  chatFiles: (paths) => ipcRenderer.send("chat-files", paths),
  cmd: (c, arg) => ipcRenderer.send("cmd", c, arg),
  agent: (c, arg) => ipcRenderer.send("agent", c, arg),
  poke: () => ipcRenderer.send("poke"),
  interactive: (v) => ipcRenderer.send("interactive", v),
  dragStart: (off) => ipcRenderer.send("drag-start", off),
  dragEnd: () => ipcRenderer.send("drag-end"),
  resizeStart: () => ipcRenderer.send("resize-start"),
  resizeEnd: () => ipcRenderer.send("resize-end"),
});
