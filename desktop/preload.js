const { contextBridge, ipcRenderer } = require("electron");

const on = (ch) => (cb) => ipcRenderer.on(ch, (_e, v) => cb(v));
contextBridge.exposeInMainWorld("df", {
  onState: on("state"),
  onCursor: on("cursor"),
  onActivity: on("activity"),
  onSound: on("sound"),
  onWalk: on("walk"),
  onArrive: on("arrive"),
  onTestOpen: on("test-open"),
  cmd: (c, arg) => ipcRenderer.send("cmd", c, arg),
  poke: () => ipcRenderer.send("poke"),
  interactive: (v) => ipcRenderer.send("interactive", v),
  dragStart: (off) => ipcRenderer.send("drag-start", off),
  dragEnd: () => ipcRenderer.send("drag-end"),
  resizeStart: () => ipcRenderer.send("resize-start"),
  resizeEnd: () => ipcRenderer.send("resize-end"),
});
