'use strict';

const { app, BrowserWindow, ipcMain, Notification, screen } = require('electron');
const path = require('path');
const { FocusTimer, PHASES } = require('./timer');
const { Store } = require('./store');

const SMOKE_BOOT = process.argv.includes('--smoke-boot');

let mainWin = null;
let miniWin = null;
let store = null;
let timer = null;
let tickHandle = null;
let lastTick = 0;

const MINI_COLLAPSED = { width: 232, height: 74 };
const MINI_EXPANDED = { width: 232, height: 128 };

function settingsToTimerConfig(s) {
  return {
    focusMs: Math.max(1, s.focusMin) * 60000,
    shortBreakMs: Math.max(1, s.shortBreakMin) * 60000,
    longBreakMs: Math.max(1, s.longBreakMin) * 60000,
    longBreakEvery: Math.max(1, s.longBreakEvery),
    autoStartNext: !!s.autoStartNext,
  };
}

function broadcast(channel, payload) {
  for (const win of [mainWin, miniWin]) {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function broadcastState() {
  broadcast('timer:state', timer.getState());
}

function phaseLabel(phase) {
  return {
    [PHASES.FOCUS]: 'Focus',
    [PHASES.SHORT_BREAK]: 'Short break',
    [PHASES.LONG_BREAK]: 'Long break',
    [PHASES.IDLE]: 'Idle',
  }[phase] || phase;
}

function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'phase-complete') {
      // Log focus time (natural completions and meaningful partial skips).
      if (ev.from === PHASES.FOCUS && ev.focusMs >= 30000) {
        store.addSession({
          ts: Date.now(),
          intent: ev.intent,
          minutes: ev.focusMs / 60000,
          taskId: ev.taskId,
          natural: ev.natural,
        });
        if (ev.natural && ev.taskId != null) store.incrementTaskPomodoro(ev.taskId);
        broadcast('data:changed', { reason: 'session-logged' });
      }
      if (ev.natural && Notification.isSupported()) {
        const body = ev.to === PHASES.FOCUS
          ? 'Break over — time to get back into it.'
          : (ev.to === PHASES.LONG_BREAK
            ? 'Great run! Take a long break — you earned it.'
            : 'Focus session done. Take a short break.');
        new Notification({
          title: `Deepdesk — ${phaseLabel(ev.to)}`,
          body,
          silent: true, // the renderer plays a gentle WebAudio chime instead
        }).show();
      }
    }
    broadcast('timer:event', ev);
  }
}

function startTicking() {
  if (tickHandle) return;
  lastTick = Date.now();
  tickHandle = setInterval(() => {
    const now = Date.now();
    const events = timer.tick(now - lastTick);
    lastTick = now;
    if (events.length) handleEvents(events);
    broadcastState();
  }, 250);
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1120,
    height: 740,
    minWidth: 860,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    title: 'Deepdesk',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWin.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  mainWin.once('ready-to-show', () => mainWin.show());
  mainWin.on('closed', () => { mainWin = null; });
}

function createMiniWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  miniWin = new BrowserWindow({
    width: MINI_COLLAPSED.width,
    height: MINI_COLLAPSED.height,
    x: workArea.x + workArea.width - MINI_COLLAPSED.width - 24,
    y: workArea.y + 24,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  miniWin.setAlwaysOnTop(true, 'screen-saver');
  miniWin.loadFile(path.join(__dirname, 'renderer', 'mini.html'));
  miniWin.once('ready-to-show', () => miniWin.show());
  miniWin.on('closed', () => { miniWin = null; });
}

function registerIpc() {
  // Timer control — every mutation returns events to main's handler and
  // pushes fresh state to both windows.
  ipcMain.handle('timer:getState', () => timer.getState());
  ipcMain.handle('timer:start', (_e, { intent, taskId } = {}) => {
    handleEvents(timer.start(intent, taskId));
    lastTick = Date.now();
    broadcastState();
    return timer.getState();
  });
  ipcMain.handle('timer:pause', () => {
    handleEvents(timer.pause());
    broadcastState();
    return timer.getState();
  });
  ipcMain.handle('timer:resume', () => {
    handleEvents(timer.resume());
    lastTick = Date.now();
    broadcastState();
    return timer.getState();
  });
  ipcMain.handle('timer:skip', () => {
    handleEvents(timer.skip());
    broadcastState();
    return timer.getState();
  });
  ipcMain.handle('timer:reset', () => {
    handleEvents(timer.reset());
    broadcastState();
    return timer.getState();
  });

  // Store
  ipcMain.handle('store:getSettings', () => store.getSettings());
  ipcMain.handle('store:setSettings', (_e, partial) => {
    const s = store.setSettings(partial || {});
    handleEvents(timer.setConfig(settingsToTimerConfig(s)));
    broadcastState();
    broadcast('settings:changed', s);
    return s;
  });
  ipcMain.handle('store:getTasks', () => store.getTasks());
  ipcMain.handle('store:setTasks', (_e, tasks) => {
    const t = store.setTasks(tasks);
    broadcast('data:changed', { reason: 'tasks' });
    return t;
  });
  ipcMain.handle('store:getSessions', () => store.getSessions());
  ipcMain.handle('store:getStats', () => store.getStats());

  // Mini window
  ipcMain.on('mini:setExpanded', (_e, expanded) => {
    if (!miniWin || miniWin.isDestroyed()) return;
    const size = expanded ? MINI_EXPANDED : MINI_COLLAPSED;
    const [x, y] = miniWin.getPosition();
    miniWin.setBounds({ x, y, width: size.width, height: size.height });
  });
  ipcMain.on('mini:showMain', () => {
    if (mainWin && !mainWin.isDestroyed()) {
      if (mainWin.isMinimized()) mainWin.restore();
      mainWin.show();
      mainWin.focus();
    }
  });
}

app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  timer = new FocusTimer(settingsToTimerConfig(store.getSettings()));

  registerIpc();
  createMainWindow();
  createMiniWindow();
  startTicking();

  if (SMOKE_BOOT) {
    let loaded = 0;
    const done = () => {
      loaded += 1;
      if (loaded === 2) {
        // Both windows finished loading — boot is good.
        console.log('SMOKE_BOOT_OK main+mini windows loaded');
        setTimeout(() => app.quit(), 300);
      }
    };
    mainWin.webContents.once('did-finish-load', done);
    miniWin.webContents.once('did-finish-load', done);
    setTimeout(() => {
      console.error('SMOKE_BOOT_TIMEOUT');
      app.exit(1);
    }, 20000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
      createMiniWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (tickHandle) clearInterval(tickHandle);
  app.quit();
});
