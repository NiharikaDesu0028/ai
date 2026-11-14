/**
 * main.js  —  Electron main process
 *
 * Responsibilities:
 *  1. Start the LangChain HTTP server (server.js) in-process
 *  2. Poll until the server is ready, then open the BrowserWindow
 *  3. System tray, native app menu, window state management
 */

'use strict';

const {
  app, BrowserWindow, Menu, Tray,
  shell, dialog, nativeImage, ipcMain,
} = require('electron');
const path = require('path');
const http  = require('http');

// ── Keep references alive (GC guard) ──────────────────────
let mainWindow = null;
let tray       = null;
let serverReady = false;

// ══════════════════════════════════════════════════════════
//  1. START BACKEND SERVER (same process)
// ══════════════════════════════════════════════════════════
function startBackendServer() {
  try {
    require('./server.js');           // binds to :3000
    console.log('[Electron] ✓ Backend server module loaded');
  } catch (err) {
    console.error('[Electron] ✗ Server failed to load:', err.message);
    dialog.showErrorBox(
      'Server Error',
      `Failed to start the backend server:\n\n${err.message}`
    );
  }
}

// Poll until :3000/api/model responds (server + agent both ready)
function waitForServer(maxMs = 30_000) {
  return new Promise((resolve, reject) => {
    const start    = Date.now();
    const interval = setInterval(() => {
      const req = http.request(
        { hostname: '127.0.0.1', port: 3000, path: '/api/model', method: 'GET' },
        (res) => {
          clearInterval(interval);
          serverReady = true;
          resolve();
        }
      );
      req.on('error', () => {
        if (Date.now() - start > maxMs) {
          clearInterval(interval);
          reject(new Error('Server did not start within 30 s'));
        }
      });
      req.end();
    }, 400);
  });
}

// ══════════════════════════════════════════════════════════
//  2. CREATE WINDOW
// ══════════════════════════════════════════════════════════
function createWindow() {
  mainWindow = new BrowserWindow({
    width:     1300,
    height:    860,
    minWidth:  900,
    minHeight: 600,
    title:     'Claude Chat — PC Agent',
    // Use default frame on Windows for native look
    frame:     true,
    backgroundColor: '#f5f5f0',
    show:      false,            // show after ready-to-show

    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      nodeIntegration:  false,
      contextIsolation: true,
      // Allow loading localhost
      webSecurity:      true,
    },
  });

  // Load the web UI served by our Express-like server
  mainWindow.loadURL('http://localhost:3000');

  // Show only when fully painted (avoids white flash)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in OS browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });

  // Dev tools shortcut
  mainWindow.webContents.on('before-input-event', (_, input) => {
    if (input.key === 'F12') mainWindow.webContents.toggleDevTools();
  });
}

// ══════════════════════════════════════════════════════════
//  3. SPLASH / LOADING WINDOW
// ══════════════════════════════════════════════════════════
function createSplash() {
  const splash = new BrowserWindow({
    width:           380,
    height:          220,
    frame:           false,
    resizable:       false,
    alwaysOnTop:     true,
    backgroundColor: '#1e1e2e',
    webPreferences:  { nodeIntegration: false },
  });

  splash.loadURL(`data:text/html,<!DOCTYPE html>
<html>
<head><style>
  *{margin:0;padding:0;box-sizing:border-box;}
  body{background:#1e1e2e;color:#cdd6f4;font-family:system-ui,sans-serif;
       display:flex;flex-direction:column;align-items:center;justify-content:center;
       height:100vh;gap:18px;user-select:none;}
  .logo{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:600;}
  .sub{font-size:12px;color:#6c7086;}
  .bar{width:220px;height:3px;background:#313244;border-radius:2px;overflow:hidden;}
  .fill{height:100%;background:#d97757;border-radius:2px;animation:load 2s ease-in-out infinite;}
  @keyframes load{0%{width:0}60%{width:80%}100%{width:100%}}
</style></head>
<body>
  <div class="logo">
    <svg width="28" height="28" viewBox="0 0 22 22" fill="none">
      <path d="M11 2V7M11 15V20M2 11H7M15 11H20M4.22 4.22L7.76 7.76M14.24 14.24L17.78 17.78M17.78 4.22L14.24 7.76M7.76 14.24L4.22 17.78" stroke="#d97757" stroke-width="2.2" stroke-linecap="round"/>
    </svg>
    Claude Chat
  </div>
  <div class="sub">Starting PC Agent…</div>
  <div class="bar"><div class="fill"></div></div>
  <div class="sub" id="s">Loading LangChain agent</div>
</body>
</html>`);

  return splash;
}

// ══════════════════════════════════════════════════════════
//  4. SYSTEM TRAY
// ══════════════════════════════════════════════════════════
function createTray() {
  // Build a 16x16 icon from raw RGBA data (orange asterisk dot)
  const size = 16;
  const buf  = Buffer.alloc(size * size * 4);
  const cx   = size / 2, cy = size / 2, r = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx  = (y * size + x) * 4;
      if (dist <= r) {
        buf[idx]     = 217;   // R
        buf[idx + 1] = 119;   // G
        buf[idx + 2] = 87;    // B
        buf[idx + 3] = Math.round(255 * Math.max(0, 1 - (dist / r) * 0.3));
      }
    }
  }
  const icon = nativeImage.createFromBuffer(buf, { width: size, height: size });

  tray = new Tray(icon);
  tray.setToolTip('Claude Chat — PC Agent');

  const menu = Menu.buildFromTemplate([
    { label: 'Open Claude Chat', click: () => { if (mainWindow) mainWindow.show(); else createWindow(); } },
    { type: 'separator' },
    { label: 'Open DevTools', click: () => mainWindow?.webContents.openDevTools() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', () => {
    if (mainWindow) { mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show(); }
  });
}

// ══════════════════════════════════════════════════════════
//  5. APP MENU
// ══════════════════════════════════════════════════════════
function buildAppMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Chat',      accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.executeJavaScript('newChat()') },
        { type:  'separator' },
        { label: 'Reload UI',     accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.reload() },
        { type:  'separator' },
        { label: 'Quit',          accelerator: 'CmdOrCtrl+Q', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut'  }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Dark Mode',  accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.executeJavaScript("document.body.classList.toggle('dark')") },
        { type:  'separator' },
        { label: 'Developer Tools',   accelerator: 'F12',          click: () => mainWindow?.webContents.toggleDevTools() },
        { label: 'Zoom In',           accelerator: 'CmdOrCtrl+=',  role: 'zoomIn'  },
        { label: 'Zoom Out',          accelerator: 'CmdOrCtrl+-',  role: 'zoomOut' },
        { label: 'Reset Zoom',        accelerator: 'CmdOrCtrl+0',  role: 'resetZoom' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'cmd — Run PowerShell',
          click: () => mainWindow?.webContents.executeJavaScript(
            `fillInput('Show me the running processes on my PC')`
          ),
        },
        {
          label: 'grep — Search Files',
          click: () => mainWindow?.webContents.executeJavaScript(
            `fillInput('Find all .js files in C:\\\\Users\\\\gowth\\\\OneDrive\\\\Desktop\\\\Test')`
          ),
        },
        { type: 'separator' },
        {
          label: 'Open Project Folder',
          click: () => shell.openPath(path.join(__dirname)),
        },
        {
          label: 'Open LM Studio',
          click: () => shell.openExternal('http://127.0.0.1:1234'),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'About Claude Chat', click: () => {
          dialog.showMessageBox(mainWindow, {
            type:    'info',
            title:   'About Claude Chat',
            message: 'Claude Chat — PC Agent',
            detail:  `Version: 2.0.0\nModel: Qwen3.5 0.8B via LM Studio\nTools: cmd, grep\nBuilt with: Electron + LangChain`,
            buttons: ['OK'],
          });
        }},
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ══════════════════════════════════════════════════════════
//  6. APP LIFECYCLE
// ══════════════════════════════════════════════════════════
app.whenReady().then(async () => {
  buildAppMenu();
  createTray();

  // Show splash
  const splash = createSplash();

  // Start server in background
  startBackendServer();

  // Wait for server + agent to be ready
  try {
    await waitForServer(30_000);
    console.log('[Electron] ✓ Server ready — opening window');
  } catch (e) {
    console.error('[Electron] ✗ Server timeout:', e.message);
    dialog.showErrorBox('Startup Error', 'The backend server did not respond.\nMake sure LM Studio is running at http://127.0.0.1:1234');
  }

  createWindow();
  splash.close();
});

// Quit when all windows closed (Windows / Linux)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// macOS: re-create window on dock click
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// IPC: renderer can query app info
ipcMain.handle('app-info', () => ({
  version:  app.getVersion(),
  platform: process.platform,
  cwd:      __dirname,
}));
