// ============================================================================
// electron/main.mjs — GateStack Electron Main Process
// ============================================================================
import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = process.env.NODE_ENV === 'development';

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'GateStack — 8-bit Computer Simulator',
    backgroundColor: '#0a0e1a',
    show: false, // show after ready-to-show to prevent flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Graceful show
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    // Open DevTools in dev mode (undocked)
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
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

// ── Application Menu ────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Reset Computer', accelerator: 'CmdOrCtrl+R', click: () => mainWindow?.webContents.send('menu:reset') },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Simulation',
      submenu: [
        { label: 'Step (S)', accelerator: 'F10', click: () => mainWindow?.webContents.send('menu:step') },
        { label: 'Run (R)', accelerator: 'F5', click: () => mainWindow?.webContents.send('menu:run') },
        { label: 'Pause (P)', accelerator: 'F6', click: () => mainWindow?.webContents.send('menu:pause') },
        { type: 'separator' },
        { label: 'Reset', accelerator: 'CmdOrCtrl+Shift+R', click: () => mainWindow?.webContents.send('menu:reset') },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About GateStack',
          click: () => {
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About GateStack',
              message: 'GateStack v0.1.0',
              detail: 'A visual 8-bit computer simulator.\n\nBuilt with Electron, React, and (optionally) Rust/WASM.\n\nInspired by Ben Eater\'s breadboard computer.',
            });
          },
        },
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
