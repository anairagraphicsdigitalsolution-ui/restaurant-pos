const { app, BrowserWindow } = require("electron");
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
  for (const raw of fs.readFileSync(envFile, "utf8").split(/\\r?\\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\\1$/, "$2");
    if (!process.env[key]) process.env[key] = value;
  }
}

function getStandaloneDir() {
  return path.join(getAppRoot(), ".next", "standalone");
}

function getServerFile() {
  return path.join(getStandaloneDir(), "server.js");
}

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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#ffffff",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
    console.error(`Electron failed to load app: ${code} - ${description}`);
  });

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
