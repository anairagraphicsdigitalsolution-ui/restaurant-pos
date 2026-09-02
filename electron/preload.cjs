const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("anairaElectron", {
  minimize: () => ipcRenderer.send("window-minimize"),
  toggleMaximize: () => ipcRenderer.send("window-toggle-maximize"),
  close: () => ipcRenderer.send("window-close"),
  onMaximizeState: (callback) => {
    if (typeof callback !== "function") return;
    ipcRenderer.on("anaira-window-maximized", (_event, value) => callback(!!value));
  }
});

function installAnairaTitleBar() {
  if (!document.documentElement || document.getElementById("__anaira_electron_titlebar")) return;

  const style = document.createElement("style");
  style.id = "__anaira_electron_titlebar_style";
  style.textContent = `
    :root { --anaira-electron-titlebar-height: 46px; }
    html, body { margin: 0 !important; padding-top: var(--anaira-electron-titlebar-height) !important; }
    #__anaira_electron_titlebar {
      position: fixed !important;
      top: 0 !important; left: 0 !important; right: 0 !important;
      height: 46px !important;
      z-index: 2147483647 !important;
      display: flex !important;
      align-items: center !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      background: linear-gradient(180deg, #171b2b 0%, #101526 100%) !important;
      border-bottom: 1px solid rgba(245,181,52,.32) !important;
      box-shadow: 0 5px 18px rgba(0,0,0,.30) !important;
      color: #f8fafc !important;
      font-family: "Segoe UI", Inter, sans-serif !important;
      -webkit-app-region: drag !important;
      user-select: none !important;
    }
    #__anaira_electron_titlebar .anaira-brand {
      height: 100%; display: flex; align-items: center; gap: 10px;
      padding: 0 16px; min-width: 230px; box-sizing: border-box;
      -webkit-app-region: drag;
    }
    #__anaira_electron_titlebar .anaira-logo {
      width: 30px !important; height: 30px !important; object-fit: contain !important;
      border-radius: 8px !important; flex: 0 0 auto !important;
      display: block !important;
      filter: drop-shadow(0 0 7px rgba(245,181,52,.22));
    }
    #__anaira_electron_titlebar .anaira-copy {
      display: flex; flex-direction: column; justify-content: center;
      line-height: 1.05; min-width: 0;
    }
    #__anaira_electron_titlebar .anaira-name {
      font-size: 13px; font-weight: 750; letter-spacing: .15px;
      white-space: nowrap;
    }
    #__anaira_electron_titlebar .anaira-sub {
      margin-top: 4px; font-size: 9px; font-weight: 650;
      letter-spacing: 1px; text-transform: uppercase;
      color: rgba(248,250,252,.55); white-space: nowrap;
    }
    #__anaira_electron_titlebar .anaira-accent {
      width: 1px; height: 22px; margin-left: 3px;
      background: rgba(245,181,52,.42);
    }
    #__anaira_electron_titlebar .anaira-spacer { flex: 1 1 auto; height: 100%; }
    #__anaira_electron_titlebar .anaira-controls {
      display: flex !important; height: 100% !important;
      -webkit-app-region: no-drag !important;
    }
    #__anaira_electron_titlebar button {
      width: 52px !important; height: 46px !important;
      border: 0 !important; margin: 0 !important; padding: 0 !important;
      display: grid !important; place-items: center !important;
      background: transparent !important;
      color: rgba(248,250,252,.78) !important;
      cursor: pointer !important;
      -webkit-app-region: no-drag !important;
      outline: none !important;
    }
    #__anaira_electron_titlebar button:hover {
      background: rgba(255,255,255,.075) !important; color: #fff !important;
    }
    #__anaira_electron_titlebar button[data-action="close"]:hover {
      background: #c83246 !important; color: #fff !important;
    }
    #__anaira_electron_titlebar .ico-min {
      width: 11px; height: 1px; background: currentColor;
    }
    #__anaira_electron_titlebar .ico-max {
      width: 11px; height: 11px; border: 1px solid currentColor; box-sizing: border-box;
    }
    #__anaira_electron_titlebar .ico-close {
      width: 12px; height: 12px; position: relative;
    }
    #__anaira_electron_titlebar .ico-close::before,
    #__anaira_electron_titlebar .ico-close::after {
      content: ""; position: absolute; left: 5px; top: 0;
      width: 1px; height: 12px; background: currentColor;
    }
    #__anaira_electron_titlebar .ico-close::before { transform: rotate(45deg); }
    #__anaira_electron_titlebar .ico-close::after { transform: rotate(-45deg); }
  `;

  document.head.appendChild(style);

  const bar = document.createElement("div");
  bar.id = "__anaira_electron_titlebar";
  bar.innerHTML = `
    <div class="anaira-brand">
      <img class="anaira-logo" src="/Logo.png" alt="Anaira">
      <div class="anaira-copy">
        <div class="anaira-name">Anaira Graphics</div>
        <div class="anaira-sub">Restaurant POS</div>
      </div>
      <div class="anaira-accent"></div>
    </div>
    <div class="anaira-spacer"></div>
    <div class="anaira-controls">
      <button type="button" data-action="minimize" aria-label="Minimize"><span class="ico-min"></span></button>
      <button type="button" data-action="maximize" aria-label="Maximize"><span class="ico-max"></span></button>
      <button type="button" data-action="close" aria-label="Close"><span class="ico-close"></span></button>
    </div>
  `;

  document.body.insertBefore(bar, document.body.firstChild);

  bar.querySelector('[data-action="minimize"]').onclick = () => window.anairaElectron.minimize();
  bar.querySelector('[data-action="maximize"]').onclick = () => window.anairaElectron.toggleMaximize();
  bar.querySelector('[data-action="close"]').onclick = () => window.anairaElectron.close();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", installAnairaTitleBar, { once: true });
} else {
  installAnairaTitleBar();
}
