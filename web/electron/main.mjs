// ============================================================================
// electron/main.mjs — GateStack Electron Main Process
// ============================================================================
import { app, BrowserWindow, Menu, shell, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

// 'wasm-unsafe-eval' lets the page compile WebAssembly (the Rust CPU core)
// without allowing JavaScript eval. Without it the app silently falls back
// to the JavaScript engine.
const CSP = [
  "default-src 'self' file: data:",
  "script-src 'self' file: 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' file: data: blob:",
].join('; ') + ';';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'GateStack — 32-bit Computer Simulator',
    backgroundColor: '#06080f',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Set CSP via response headers — works correctly with file:// protocol
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    });
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    const appPath = app.getAppPath();
    mainWindow.loadFile(path.join(appPath, 'dist', 'index.html'));
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

const send = (channel) => () => mainWindow?.webContents.send(channel);

// ── Application Menu ────────────────────────────────────────────────────
// Ctrl+R / Ctrl+Shift+R are not used: in production there is no reload
// (reloading would throw away the CPU state), and Reset CPU is on F8.
function buildMenu() {
  const viewMenu = [
    ...(isDev ? [
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
    ] : []),
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ];

  const template = [
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    { label: 'View', submenu: viewMenu },
    {
      label: 'Simulation',
      submenu: [
        { label: 'Step (S)', accelerator: 'F10', click: send('menu:step') },
        { label: 'Step Back (B)', accelerator: 'F9', click: send('menu:stepback') },
        { label: 'Run (R)', accelerator: 'F5', click: send('menu:run') },
        { label: 'Pause (P)', accelerator: 'F6', click: send('menu:pause') },
        { type: 'separator' },
        { label: 'Reset CPU (keeps RAM)', accelerator: 'F8', click: send('menu:reset') },
        { label: 'Wipe RAM', click: send('menu:wipe') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Quick Reference (?)', click: send('menu:help') },
        { type: 'separator' },
        // The About box is an in-app dialog, so its text can be selected and copied.
        { label: 'About GateStack', click: send('menu:about') },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── App Lifecycle ───────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
