'use strict';
// Electron main process: transparent always-on-top overlay + LCU connection + engine.
// Hotkeys: Cmd+Shift+O = toggle click-through/interactive, Cmd+Shift+H = show/hide.

const path = require('path');
const { app, BrowserWindow, globalShortcut, ipcMain } = require('electron');

const { loadStore } = require('../engine/store');
const { loadDataDragon } = require('../engine/ddragon');
const { recommendPicks } = require('../engine/recommend');
const { recommendRunes } = require('../engine/runes');
const { recommendItems } = require('../engine/items');
const { waitForLockfile } = require('../lcu/lockfile');
const { LcuClient } = require('../lcu/client');
const { parseChampSelect } = require('../lcu/session');

const ROOT = path.join(__dirname, '..', '..');
const DEBUG = !!process.env.LOL_DEBUG;

let win = null;
let clickThrough = true;
let ctx = { store: null, profile: null, ddragon: null, lcu: null };

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 680,
    x: 40,
    y: 80,
    transparent: true,
    frame: false,
    hasShadow: false,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(ROOT, 'src', 'renderer', 'index.html'));
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function status(text, connected = false) {
  send('status', { text, connected, patch: ctx.store ? ctx.store.patch : null, clickThrough });
}

function pushRecommendations(state) {
  const { store, profile, ddragon } = ctx;
  const payload = { state, picks: [], runes: null, items: null };

  if (state.me.role) payload.picks = recommendPicks(store, profile, state);

  const myChamp = state.me.lockedChampion || state.me.hoverChampion;
  if (myChamp) {
    payload.runes = recommendRunes(store, profile, state, myChamp);
    payload.items = recommendItems(store, profile, state, myChamp);
    payload.runes.locked = Boolean(state.me.lockedChampion);
  }
  if (ddragon) {
    payload.icons = {};
    for (const p of payload.picks) payload.icons[p.champion] = ddragon.iconUrl(p.champion);
  }
  send('draft', payload);
}

async function startLcuLoop() {
  for (;;) {
    status('Waiting for League client…');
    const lockfile = await waitForLockfile({ onWaiting: () => status('Waiting for League client…') });
    status('League client found — connecting…');

    const lcu = new LcuClient(lockfile).connect();
    ctx.lcu = lcu;

    lcu.on('connected', () => status('Connected — waiting for champ select', true));
    lcu.on('champSelect', (session) => {
      if (DEBUG) console.log(JSON.stringify(session));
      try {
        const state = parseChampSelect(session, ctx.ddragon);
        pushRecommendations(state);
        status('In champ select', true);
      } catch (err) {
        console.error('parse error', err);
      }
    });
    lcu.on('champSelectEnd', () => { send('draft-end', {}); status('Champ select ended', true); });

    // Wait for disconnect (client closed), then loop back to lockfile polling.
    await new Promise((resolve) => {
      lcu.on('disconnected', resolve);
      lcu.on('error', () => {});
    });
    status('League client closed — waiting…');
    await new Promise((r) => setTimeout(r, 3000));
  }
}

app.whenReady().then(async () => {
  createWindow();

  globalShortcut.register('CommandOrControl+Shift+O', () => {
    clickThrough = !clickThrough;
    win.setIgnoreMouseEvents(clickThrough, { forward: true });
    send('interactive', { clickThrough });
  });
  globalShortcut.register('CommandOrControl+Shift+H', () => {
    if (win.isVisible()) win.hide(); else win.show();
  });

  status('Loading data…');
  try {
    ctx.ddragon = await loadDataDragon(path.join(app.getPath('userData'), 'ddragon'));
  } catch (err) {
    console.error('Data Dragon unavailable:', err.message);
    ctx.ddragon = null; // engine still works from the snapshot; id mapping needs ddragon though
    status('Warning: Data Dragon unavailable (need internet once). Live mode disabled until then.');
  }
  ({ store: ctx.store, profile: ctx.profile } = loadStore(ROOT, { ddragon: ctx.ddragon }));
  status('Data loaded');

  ipcMain.handle('get-bootstrap', () => ({
    patch: ctx.store.patch,
    ddragonVersion: ctx.ddragon ? ctx.ddragon.version : null,
    profileRoles: Object.keys(ctx.profile.pools).filter((r) => (ctx.profile.pools[r] || []).length),
    clickThrough,
  }));

  startLcuLoop().catch((err) => { console.error(err); status(`Error: ${err.message}`); });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
