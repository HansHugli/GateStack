// ============================================================================
// electron/main.mjs — GateStack Electron Main Process
// ============================================================================
import { app, BrowserWindow, Menu, shell, dialog, session } from 'electron';
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
    title: 'GateStack — 16-bit Computer Simulator',
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
        'Content-Security-Policy': ["default-src 'self' file: data:; script-src 'self' file: 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' file: data: blob:;"]
      }
    });
  });

  // Graceful show
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the app
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
        { label: 'Step Back (B)', accelerator: 'F9', click: () => mainWindow?.webContents.send('menu:stepback') },
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
            const version = app.getVersion() || '0.2.0';
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About GateStack',
              message: `GateStack v${version}`,
              detail: `Version: ${version}\nElectron: ${process.versions.electron}\nChrome: ${process.versions.chrome}\nNode: ${process.versions.node}\n\nA visual 16-bit computer simulator.\nBuilt with Electron, React, and TypeScript.\nRust/WASM core available (experimental).\n\nInspired by J. Clark Scott's "But How Do It Know?"\nand nand2tetris.org by Nisan & Schocken.`,
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
