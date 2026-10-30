// Desktop window for Apply-Pilot. It runs the same panel as `apply-pilot ui` inside
// this process and shows it in a window of its own. The page gets no Node access,
// and links to other sites open in the user's normal browser.
import { execFileSync } from 'node:child_process';
import { app, BrowserWindow, dialog, Menu, nativeTheme, session, shell } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SMOKE = process.env.APPLY_PILOT_SMOKE === '1';
const EXTERNAL = /^(https?|mailto):/i;
let win = null, origin = '', panel = null, leaving = false;

// A program started from the Finder or a desktop menu gets a short PATH, so the
// command-line agents would look uninstalled. The login shell knows the real one.
function loadShellPath() {
  if (process.platform === 'win32') return;
  try {
    const out = execFileSync(process.env.SHELL || '/bin/sh', ['-ilc', 'printf "\\n%s\\n" "$PATH"'], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    const path = out.trim().split('\n').pop();
    if (path) process.env.PATH = path;
  } catch { /* keep what we have */ }
}

function startPanel() {
  return new Promise(async (resolve) => {
    const { homeDir } = await import('../src/config.mjs');
    const { serve } = await import('../src/ui/server.mjs');
    // Home is the working folder, as with the old launcher: "apply-data" must not land in the install folder.
    process.chdir(app.getPath('home'));
    serve({ home: homeDir(), anyPort: true, onListen: resolve });
  });
}

function openWindow() {
  win = new BrowserWindow({
    width: 1320, height: 880, minWidth: 900, minHeight: 600, show: false, title: 'Apply-Pilot', autoHideMenuBar: true,
    icon: join(ROOT, 'assets', 'png', 'icon-512.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0f1216' : '#f7f8fa',
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (EXTERNAL.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(origin)) return;
    e.preventDefault();
    if (EXTERNAL.test(url)) shell.openExternal(url);
  });
  win.on('close', (e) => {
    if (leaving || !panel.running()) return;
    const zh = app.getLocale().startsWith('zh');
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning', buttons: zh ? ['退出', '取消'] : ['Quit', 'Cancel'], defaultId: 1, cancelId: 1,
      message: zh ? '有任务还在运行，退出会中断它。' : 'A task is still running. Quitting stops it.',
    });
    if (choice === 1) e.preventDefault(); else leaving = true;
  });
  win.on('closed', () => { win = null; });
  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      const title = await win.webContents.executeJavaScript('document.title');
      const nav = await win.webContents.executeJavaScript("document.querySelectorAll('#navs .nav').length");
      console.log(`smoke: title=${title} nav=${nav} port=${panel.port}`);
      app.exit(title === 'Apply-Pilot' && nav > 0 ? 0 : 1);
    });
  }
  win.loadURL(origin);
}

// macOS has no shortcuts for copy and paste without an Edit menu.
function setMenu() {
  if (process.platform !== 'darwin') return Menu.setApplicationMenu(null);
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]));
}

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!win && panel) openWindow(); });
  app.whenReady().then(async () => {
    loadShellPath();
    setMenu();
    session.defaultSession.setPermissionRequestHandler((_, name, done) => done(name === 'clipboard-sanitized-write'));
    panel = await startPanel();
    origin = `http://localhost:${panel.port}`;
    openWindow();
  }).catch((e) => {
    dialog.showErrorBox('Apply-Pilot', String(e?.stack || e));
    app.exit(1);
  });
}
