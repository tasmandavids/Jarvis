const { app, BrowserWindow, shell, Menu, Tray, nativeImage } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

// Electron strips PATH — restore it so npm/node are findable
process.env.PATH = [
  '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin',
  '/usr/sbin', '/sbin', process.env.PATH,
].filter(Boolean).join(':');

const NEXT_PORT = 3005;
const DEV_MODE  = process.env.NODE_ENV === 'development';

// In dev: Next.js lives at apps/dashboard (sibling of apps/desktop)
// In production (packaged): extraResources copies .next/standalone → Resources/dashboard
const NEXT_DIR = DEV_MODE
  ? path.join(__dirname, '..', 'dashboard')
  : path.join(process.resourcesPath, 'dashboard');

// Expose repo root to @jarvis/config so it can find config/*.json
// In dev: two levels up from apps/desktop = repo root
// In production: config/ is bundled as Resources/config
process.env.JARVIS_REPO_ROOT = DEV_MODE
  ? path.join(__dirname, '..', '..')
  : path.join(process.resourcesPath, 'config-root');

let mainWindow = null;
let tray       = null;
let nextServer = null;
let serverReady = false;
let initialized = false;

// ── Start Next.js server ─────────────────────────────────────────────────────
function startNextServer() {
  let script, cwd;

  if (DEV_MODE) {
    script = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    cwd = NEXT_DIR;
    const args = ['run', 'dev'];
    nextServer = spawn(script, args, {
      cwd,
      env: { ...process.env, PORT: String(NEXT_PORT) },
      stdio: 'pipe',
    });
  } else {
    // Standalone build puts server.js at the root of the output directory
    script = process.execPath;
    const serverPath = path.join(NEXT_DIR, 'server.js');
    cwd = NEXT_DIR;
    nextServer = spawn(script, [serverPath], {
      cwd,
      env: { ...process.env, PORT: String(NEXT_PORT), NODE_ENV: 'production' },
      stdio: 'pipe',
    });
  }

  nextServer.stdout.on('data', (d) => console.log('[next]', d.toString().trim()));
  nextServer.stderr.on('data', (d) => console.error('[next]', d.toString().trim()));
  nextServer.on('exit', (code) => console.log('[next] exited with', code));
  nextServer.on('error', (err) => console.error('[next] spawn error:', err.message));
}

// ── Poll until Next.js is ready ──────────────────────────────────────────────
function waitForServer(url, retries = 60, interval = 1000) {
  return new Promise((resolve, reject) => {
    const check = (n) => {
      http.get(url, (res) => {
        if (res.statusCode < 500) resolve();
        else setTimeout(() => check(n - 1), interval);
      }).on('error', () => {
        if (n <= 0) reject(new Error('Next.js did not start'));
        else setTimeout(() => check(n - 1), interval);
      });
    };
    check(retries);
  });
}

// ── Create the main window (guarded: no duplicates) ─────────────────────────
function createWindow() {
  if (mainWindow) {
    mainWindow.focus();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu bar tray (guarded: created once) ───────────────────────────────────
function createTray() {
  if (tray) return;

  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  const trayIcon = icon.isEmpty() ? nativeImage.createEmpty() : icon;

  tray = new Tray(trayIcon);
  tray.setToolTip('CYPHER');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CYPHER', click: () => { mainWindow ? mainWindow.show() : createWindow(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ── One-time bootstrap ───────────────────────────────────────────────────────
async function bootstrap() {
  if (initialized) return;
  initialized = true;

  startNextServer();

  // Loading window while server boots
  const loadingWindow = new BrowserWindow({
    width: 480, height: 300,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    resizable: false,
    webPreferences: { contextIsolation: true },
  });
  loadingWindow.loadURL(`data:text/html,<html style="background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui"><p style="color:#6aa8ff;font-size:18px;letter-spacing:.1em">CYPHER starting…</p></html>`);

  try {
    await waitForServer(`http://localhost:${NEXT_PORT}/api/health`);
    serverReady = true;
  } catch {
    try {
      await waitForServer(`http://localhost:${NEXT_PORT}`);
      serverReady = true;
    } catch (err) {
      console.error('[cypher] Server failed to start:', err.message);
    }
  }

  loadingWindow.close();

  if (serverReady) {
    createTray();
    createWindow();
  } else {
    new BrowserWindow({
      width: 520, height: 320,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#0a0a0a',
      resizable: false,
      webPreferences: { contextIsolation: true },
    }).loadURL(`data:text/html,<html style="background:#0a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui"><div style="color:#ff6b6b;text-align:center"><p style="font-size:18px;font-weight:bold">CYPHER failed to start</p><p style="color:#aaa;margin-top:8px">The dashboard server could not be reached.<br>Check the terminal output for details.</p></div></html>`);
  }
}

app.whenReady().then(bootstrap);

app.on('activate', () => {
  // Only open a window if server is up and no window exists
  if (serverReady && !mainWindow) createWindow();
});

app.on('window-all-closed', () => {
  // Keep running in tray on macOS
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (nextServer) nextServer.kill();
});

process.on('uncaughtException', (err) => {
  console.error('[cypher] Uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[cypher] Unhandled rejection:', reason);
});
