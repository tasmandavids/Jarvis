const { app, BrowserWindow, shell, Menu, Tray, nativeImage, globalShortcut, ipcMain } = require('electron');
const { spawn, exec } = require('child_process');
const path = require('path');
const http = require('http');
const net  = require('net');

// Enforce single instance — focus existing window if already running
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// Electron strips PATH — restore it so npm/node are findable
process.env.PATH = [
  '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin',
  '/usr/sbin', '/sbin', process.env.PATH,
].filter(Boolean).join(':');

const NEXT_PORT = 3005;
const DEV_MODE  = process.env.NODE_ENV === 'development';

// Dev:  apps/web (sibling of apps/desktop)
// Prod: extraResources copies .next/standalone → Resources/app
//       turbopack.root traces from monorepo root so server.js lands at app/apps/web/server.js
const NEXT_DIR = DEV_MODE
  ? path.join(__dirname, '..', 'web')
  : path.join(process.resourcesPath, 'app', 'apps', 'web');

// Turbopack's standalone build can't resolve __dirname for the config package,
// so point it at the real bundled data dir.
//   Dev:  packages/config/data (monorepo sibling)
//   Prod: Resources/app/packages/config/data
const DATA_ROOT = DEV_MODE
  ? path.join(__dirname, '..', '..', 'packages', 'config', 'data')
  : path.join(process.resourcesPath, 'app', 'packages', 'config', 'data');

let mainWindow   = null;
let loadingWin   = null;
let tray         = null;
let nextServer   = null;
let serverReady  = false;
let initialized  = false;

// ── Kill whatever is holding a port ─────────────────────────────────────────
// Prevents EADDRINUSE when a previous server process wasn't cleaned up.
function freePort(port) {
  return new Promise((resolve) => {
    // Quick TCP probe — if port is already free, skip exec overhead.
    const probe = net.createServer();
    probe.once('listening', () => { probe.close(); resolve(); });
    probe.once('error', () => {
      // Port is occupied — find and kill the owner.
      exec(`lsof -ti :${port}`, (_, stdout) => {
        const pids = (stdout || '').trim().split('\n').filter(Boolean);
        if (!pids.length) return resolve();
        console.log(`[cypher] freeing port ${port} — killing PIDs:`, pids.join(', '));
        pids.forEach(pid => { try { process.kill(Number(pid), 'SIGTERM'); } catch {} });
        // Give them 800 ms to exit gracefully, then SIGKILL.
        setTimeout(() => {
          pids.forEach(pid => { try { process.kill(Number(pid), 'SIGKILL'); } catch {} });
          setTimeout(resolve, 300);
        }, 800);
      });
    });
    probe.listen(port);
  });
}

// ── Start Next.js server ─────────────────────────────────────────────────────
function startNextServer() {
  if (DEV_MODE) {
    const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    nextServer = spawn(npm, ['run', 'dev'], {
      cwd: NEXT_DIR,
      env: { ...process.env, PORT: String(NEXT_PORT), CYPHER_DATA_ROOT: DATA_ROOT },
      stdio: 'pipe',
    });
  } else {
    const serverPath = path.join(NEXT_DIR, 'server.js');
    // process.execPath is the Electron binary, NOT node. Without
    // ELECTRON_RUN_AS_NODE it would boot a second Electron instance, which the
    // single-instance lock immediately kills — so the server never starts.
    nextServer = spawn(process.execPath, [serverPath], {
      cwd: NEXT_DIR,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        PORT: String(NEXT_PORT),
        NODE_ENV: 'production',
        CYPHER_DATA_ROOT: DATA_ROOT,
      },
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

// ── Safe close helper — guards against use-after-destroy ────────────────────
function safeClose(win) {
  if (win && !win.isDestroyed()) win.close();
}

// ── Create the main window ───────────────────────────────────────────────────
function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.focus(); return; }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    show: false, // avoid flash — show after load
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(`http://localhost:${NEXT_PORT}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu bar tray ────────────────────────────────────────────────────────────
function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'tray-icon.png');
  let icon = nativeImage.createFromPath(iconPath);

  // Fallback: a 16×16 transparent PNG so the Tray constructor never receives
  // an empty image (which crashes Electron on macOS).
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABmJLR0QA/wD/AP+gvaeTAAAADUlEQVQ4jWNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg=='
    );
  }

  tray = new Tray(icon);
  tray.setToolTip('CYPHER');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open CYPHER', click: () => { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.show(); } else { createWindow(); } } },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]));
}

// ── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  if (initialized) return;
  initialized = true;

  // Free the port first — prevents EADDRINUSE from zombie server processes.
  await freePort(NEXT_PORT);

  startNextServer();

  loadingWin = new BrowserWindow({
    width: 480, height: 300,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0a0a0a',
    resizable: false,
    webPreferences: { contextIsolation: true },
  });
  loadingWin.loadURL(
    `data:text/html,<html style="background:%230a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui"><p style="color:%236aa8ff;font-size:18px;letter-spacing:.1em">CYPHER starting…</p></html>`
  );
  loadingWin.on('closed', () => { loadingWin = null; });

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

  safeClose(loadingWin);

  if (serverReady) {
    createTray();
    createWindow();
    registerVoiceHotkey();
  } else {
    const errWin = new BrowserWindow({
      width: 520, height: 320,
      titleBarStyle: 'hiddenInset',
      backgroundColor: '#0a0a0a',
      resizable: false,
      webPreferences: { contextIsolation: true },
    });
    errWin.loadURL(
      `data:text/html,<html style="background:%230a0a0a;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-family:system-ui"><div style="color:%23ff6b6b;text-align:center"><p style="font-size:18px;font-weight:bold">CYPHER failed to start</p><p style="color:%23aaa;margin-top:8px">Check Console.app → CYPHER for details.</p></div></html>`
    );
  }
}

// ── Global voice hotkey ──────────────────────────────────────────────────────
// Cmd+Shift+Space — works even when CYPHER is not the focused window.
function registerVoiceHotkey() {
  const ok = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      // Bring window to front (optional — voice still works in background)
      if (!mainWindow.isVisible()) mainWindow.show();
      // Tell the renderer to toggle the voice agent
      mainWindow.webContents.send('voice-toggle');
    }
  });
  if (!ok) console.warn('[cypher] Could not register voice hotkey (Cmd+Shift+Space)');
}

app.whenReady().then(bootstrap);

app.on('second-instance', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else if (serverReady) {
    createWindow();
  } else if (loadingWin && !loadingWin.isDestroyed()) {
    loadingWin.focus();
  }
});

app.on('activate', () => {
  if (serverReady) {
    if (!mainWindow || mainWindow.isDestroyed()) createWindow();
    else mainWindow.show();
  } else if (loadingWin && !loadingWin.isDestroyed()) {
    loadingWin.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  globalShortcut.unregisterAll();
  if (nextServer) {
    nextServer.kill('SIGTERM');
    // Force kill after 3s if SIGTERM doesn't land
    setTimeout(() => { try { nextServer.kill('SIGKILL'); } catch {} }, 3000);
  }
});

process.on('uncaughtException', (err) => console.error('[cypher] Uncaught:', err));
process.on('unhandledRejection', (reason) => console.error('[cypher] Rejection:', reason));
