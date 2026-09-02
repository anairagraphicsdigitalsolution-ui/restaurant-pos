const { contextBridge, ipcRenderer } = require("electron");

// Kept for compatibility with the Electron shell. Window controls are native
// Window Controls Overlay buttons, so they do not depend on renderer clicks.
contextBridge.exposeInMainWorld("anairaElectron", {
  minimize: () => ipcRenderer.send("window-minimize"),
  toggleMaximize: () => ipcRenderer.send("window-toggle-maximize"),
  close: () => ipcRenderer.send("window-close"),
  onMaximizeState: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("anaira-window-maximized", (_event, value) => callback(!!value));
  }
});
