const { app, BrowserWindow, screen, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

let mainWindow = null;
let nextProcess = null;

const PORT = 3180;
const HOST = "127.0.0.1";

function getAppRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app")
    : path.join(__dirname, "..");
}

function loadCloudEnv() {
  const fs = require("fs");
  const envFile = path.join(getAppRoot(), ".env.local");
  if (!fs.existsSync(envFile)) return;
  for (const raw of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }

  // Electron production is Cloud-only. Never allow legacy local Supabase
  // environment variables to change the runtime data source.
  const localKeys = [
    "NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY",
    "ANAIRA_LOCAL_PRIMARY",
    "NEXT_PUBLIC_LOCAL_SUPABASE_URL",
    "ANAIRA_LOCAL_SUPABASE_URL",
    "NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY",
    "ANAIRA_LOCAL_SUPABASE_ANON_KEY",
    "SUPABASE_LOCAL_SERVICE_ROLE_KEY",
    "ANAIRA_LOCAL_SUPABASE_SERVICE_ROLE_KEY",
    "ANAIRA_LOCAL_SERVER_ENABLED",
    "LOCAL_DATABASE_URL",
    "LOCAL_DB_PASSWORD",
    "LOCAL_DB_CONTAINER",
    "LOCAL_DB_USER",
    "LOCAL_DB_NAME",
    "ANAIRA_SYNC_NODE",
    "ANAIRA_RESTAURANT_ID",
  ];
  for (const key of localKeys) delete process.env[key];

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    !process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    throw new Error(
      "Cloud Supabase configuration is missing in the packaged Electron app. " +
      "The build must include .env.local with NEXT_PUBLIC_SUPABASE_URL, " +
      "NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
}

function getStandaloneDir() {
  return path.join(getAppRoot(), ".next", "standalone");
}

function getServerFile() {
  return path.join(getStandaloneDir(), "server.js");
}

function forceCloudOnlyEnvironment() {
  const legacyKeys = [
    "ANAIRA_LOCAL_PRIMARY","NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY",
    "NEXT_PUBLIC_LOCAL_SUPABASE_URL","NEXT_PUBLIC_LOCAL_SUPABASE_ANON_KEY",
    "LOCAL_DATABASE_URL","DATABASE_URL","LOCAL_SUPABASE_URL","LOCAL_SUPABASE_ANON_KEY"
  ];
  for (const key of legacyKeys) delete process.env[key];
  process.env.ANAIRA_LOCAL_PRIMARY = "false";
  process.env.NEXT_PUBLIC_ANAIRA_LOCAL_PRIMARY = "false";
}

function validateCloudEnvironment() {
  for (const key of ["NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY"]) {
    if (!String(process.env[key] || "").trim()) throw new Error(`Required Cloud Supabase environment variable is missing: ${key}`);
  }
  if (!/^https:\/\/[A-Za-z0-9._-]+\.supabase\.co\/?$/.test(String(process.env.NEXT_PUBLIC_SUPABASE_URL).trim())) {
    throw new Error("Packaged Electron requires a Cloud Supabase URL (.supabase.co).");
  }
  process.env.NEXT_PUBLIC_SUPABASE_URL=String(process.env.NEXT_PUBLIC_SUPABASE_URL).trim().replace(/\/+$/,"");
}

ipcMain.on("window-minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window-toggle-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on("window-close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

function startNextServer() {

  return new Promise((resolve, reject) => {
    const standaloneDir = getStandaloneDir();
    const serverFile = getServerFile();

    if (!require("fs").existsSync(serverFile)) {
      reject(new Error(`Next.js server.js not found: ${serverFile}`));
      return;
    }

    // Use the Electron executable itself as a Node runtime.
    // This avoids depending on a separate node.exe in the installed app.
    nextProcess = spawn(
      process.execPath,
      [serverFile],
      {
        cwd: standaloneDir,
        env: {
          ...process.env,
          ELECTRON_RUN_AS_NODE: "1",
          NODE_ENV: "production",
          PORT: String(PORT),
          HOSTNAME: HOST
        },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      }
    );

    nextProcess.stdout.on("data", data => {
      console.log(`[Next] ${data.toString().trim()}`);
    });

    nextProcess.stderr.on("data", data => {
      console.error(`[Next] ${data.toString().trim()}`);
    });

    nextProcess.once("error", reject);

    nextProcess.once("exit", (code, signal) => {
      if (code !== 0 && code !== null) {
        console.error(`Next.js exited before startup. code=${code} signal=${signal}`);
      }
    });

    const startedAt = Date.now();

    const check = () => {
      if (!nextProcess || nextProcess.exitCode !== null) {
        reject(new Error("Next.js process exited before the app became available."));
        return;
      }

      const req = http.get(`http://${HOST}:${PORT}`, res => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - startedAt >= 30000) {
          reject(new Error("Next.js server did not start within 30 seconds."));
        } else {
          setTimeout(check, 250);
        }
      });

      req.setTimeout(1000, () => req.destroy());
    };

    check();
  });
}

function getAdaptiveZoomFactor(display) {
  const workArea = display?.workAreaSize || { width: 1440, height: 900 };
  const width = Number(workArea.width) || 1440;
  const height = Number(workArea.height) || 900;

  // The POS layout is designed around a 1440x900 desktop viewport.
  // On older 1366x768 / 1280x720 panels, 100% Chromium CSS makes the
  // fixed desktop layout feel like Windows 125%. Reduce only inside Electron.
  if (width <= 1280 || height <= 720) return 0.78;
  if (width <= 1366 || height <= 768) return 0.80;
  if (width <= 1440 || height <= 900) return 0.92;
  return 1;
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const workArea = display.workAreaSize;
  const zoomFactor = getAdaptiveZoomFactor(display);

  const width = Math.min(1440, Math.max(900, workArea.width - 12));
  const height = Math.min(900, Math.max(620, workArea.height - 12));

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth: Math.min(1100, width),
    minHeight: Math.min(700, height),
    show: false,
    // Use Electron's native Window Controls Overlay on Windows.
    // This gives us real OS-level Minimize / Maximize / Close buttons
    // while allowing the Anaira branding to occupy the custom title area.
    titleBarStyle: process.platform === "win32" ? "hidden" : "default",
    ...(process.platform === "win32" ? {
      titleBarOverlay: {
        color: "#101526",
        symbolColor: "#f8fafc",
        height: 46
      }
    } : {}),
    title: "Anaira Graphics",
    autoHideMenuBar: true,
    backgroundColor: "#0b1220",
    webPreferences: {
      preload: process.platform === "win32" ? path.join(__dirname, "preload.cjs") : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (process.platform === "win32") {
    const installAnairaBrandBar = async () => {
      try {
        await mainWindow.webContents.executeJavaScript(`(() => {
          const existing = document.getElementById("__anaira_electron_brandbar");
          if (existing) return "already-installed";
          if (!document.documentElement) return "document-not-ready";

          const style = document.createElement("style");
          style.id = "__anaira_electron_brandbar_style";
          style.textContent = \`
            :root { --anaira-electron-titlebar-height: 46px; }
            html, body { margin: 0 !important; padding-top: 46px !important; }
            #__anaira_electron_brandbar {
              position: fixed !important;
              top: 0 !important;
              left: env(titlebar-area-x, 0px) !important;
              width: env(titlebar-area-width, calc(100% - 140px)) !important;
              height: 46px !important;
              z-index: 2147483000 !important;
              box-sizing: border-box !important;
              display: flex !important;
              align-items: center !important;
              padding: 0 16px !important;
              overflow: hidden !important;
              pointer-events: none !important;
              color: #f8fafc !important;
              font-family: "Segoe UI", Inter, sans-serif !important;
              background: linear-gradient(180deg, rgba(23,27,43,.98) 0%, rgba(16,21,38,.98) 100%) !important;
              border-bottom: 1px solid rgba(245,181,52,.38) !important;
              box-shadow: 0 5px 18px rgba(0,0,0,.22) !important;
              -webkit-app-region: drag !important;
            }
            #__anaira_electron_brandbar .anaira-brand {
              height: 100%; display: flex; align-items: center; gap: 10px;
              min-width: 230px; box-sizing: border-box;
            }
            #__anaira_electron_brandbar .anaira-logo {
              width: 30px !important; height: 30px !important; object-fit: contain !important;
              border-radius: 8px !important; display: block !important;
              filter: drop-shadow(0 0 7px rgba(245,181,52,.22));
            }
            #__anaira_electron_brandbar .anaira-copy {
              display: flex; flex-direction: column; justify-content: center;
              line-height: 1.05; min-width: 0;
            }
            #__anaira_electron_brandbar .anaira-name {
              font-size: 13px; font-weight: 750; letter-spacing: .15px; white-space: nowrap;
            }
            #__anaira_electron_brandbar .anaira-sub {
              margin-top: 4px; font-size: 9px; font-weight: 650;
              letter-spacing: 1px; text-transform: uppercase;
              color: rgba(248,250,252,.55); white-space: nowrap;
            }
            #__anaira_electron_brandbar .anaira-accent {
              width: 1px; height: 22px; margin-left: 3px;
              background: rgba(245,181,52,.42);
            }
          \`;
          document.documentElement.appendChild(style);

          const bar = document.createElement("div");
          bar.id = "__anaira_electron_brandbar";
          bar.innerHTML = '<div class="anaira-brand"><img class="anaira-logo" src="/Logo.png" alt="Anaira"><div class="anaira-copy"><div class="anaira-name">Anaira Graphics</div><div class="anaira-sub">Restaurant POS</div></div><div class="anaira-accent"></div></div>';
          document.documentElement.appendChild(bar);
          return "installed";
        })()`);
      } catch (error) {
        console.error("Anaira brand title bar injection failed:", error);
      }
    };

    const applyElectronZoom = () => {
      mainWindow.webContents.setZoomFactor(zoomFactor);
    };

    applyElectronZoom();
    mainWindow.webContents.on("did-finish-load", async () => {
      await installAnairaBrandBar();
      applyElectronZoom();
    });
  }

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Electron failed to load app: ${code} - ${description}`);
  });

  mainWindow.on("maximize", () => mainWindow.webContents.send("anaira-window-maximized", true));
  mainWindow.on("unmaximize", () => mainWindow.webContents.send("anaira-window-maximized", false));

  return mainWindow.loadURL(`http://${HOST}:${PORT}`);
}

async function shutdownNext() {
  if (!nextProcess) return;

  const child = nextProcess;
  nextProcess = null;

  try {
    child.kill();
  } catch (_) {}

  await new Promise(resolve => setTimeout(resolve, 300));
}

app.whenReady().then(async () => {
  loadCloudEnv();
  forceCloudOnlyEnvironment();
  validateCloudEnvironment();
  try {
    await startNextServer();
    await createWindow();
  } catch (error) {
    console.error("Anaira Restaurant POS startup failed:", error);
    await shutdownNext();
    app.quit();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", async () => {
  await shutdownNext();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (nextProcess) {
    try { nextProcess.kill(); } catch (_) {}
    nextProcess = null;
  }
});

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});
