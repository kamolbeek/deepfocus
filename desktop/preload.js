const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("df", {
  onState: (cb) => ipcRenderer.on("state", (_e, s) => cb(s)),
  onSound: (cb) => ipcRenderer.on("sound", (_e, k) => cb(k)),
  cmd: (c) => ipcRenderer.send("cmd", c),
  poke: () => ipcRenderer.send("poke"),
  interactive: (on) => ipcRenderer.send("interactive", on),
  dragStart: (off) => ipcRenderer.send("drag-start", off),
  dragEnd: () => ipcRenderer.send("drag-end"),
});
