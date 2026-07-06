'use strict';

/** Deepdesk main window renderer. */
(function () {
  const api = window.deepdesk;
  const { AmbientPlayer, playChime } = window.DeepdeskAudio;

  const $ = (id) => document.getElementById(id);
  const RING_CIRC = 2 * Math.PI * 118;

  let settings = null;
  let tasks = [];
  let selectedTaskId = null;
  let lastState = null;

  // ---------------- Navigation ----------------
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
      $(`view-${btn.dataset.view}`).classList.add('active');
      if (btn.dataset.view === 'dashboard') refreshDashboard();
    });
  });

  // ---------------- Timer UI ----------------
  const phaseInfo = {
    idle: { label: 'Ready', color: 'var(--focus-c)' },
    focus: { label: 'Focus', color: 'var(--focus-c)' },
    shortBreak: { label: 'Short break', color: 'var(--break-c)' },
    longBreak: { label: 'Long break', color: 'var(--long-c)' },
  };

  function fmt(ms) {
    const total = Math.ceil(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function renderTimer(state) {
    lastState = state;
    const info = phaseInfo[state.phase] || phaseInfo.idle;
    $('phaseLabel').textContent = state.phase === 'idle'
      ? 'Ready'
      : `${info.label}${state.running ? '' : ' · paused'}`;
    $('timeDisplay').textContent = state.phase === 'idle'
      ? fmt(state.config.focusMs)
      : fmt(state.remainingMs);

    const ring = $('ringFg');
    ring.style.stroke = info.color;
    const prog = state.phase === 'idle' ? 0 : state.progress;
    ring.style.strokeDashoffset = String(RING_CIRC * (1 - prog));

    // cycle dots: position within the long-break cycle
    const every = state.config.longBreakEvery;
    const dots = $('cycleDots');
    dots.innerHTML = '';
    for (let i = 0; i < every; i++) {
      const d = document.createElement('div');
      d.className = 'dot' + (i < state.focusSinceLongBreak ? ' done' : '');
      dots.appendChild(d);
    }

    // buttons
    const idle = state.phase === 'idle';
    $('btnStart').classList.toggle('hidden', !idle && state.running);
    $('btnStart').textContent = idle ? 'Start focus' : 'Resume';
    $('btnPause').classList.toggle('hidden', idle || !state.running);
    $('btnSkip').classList.toggle('hidden', idle);
    $('btnReset').classList.toggle('hidden', idle);

    // ambient ducking during breaks
    if (settings && !settings.ambient.keepDuringBreaks) {
      AmbientPlayer.setDuckedForBreak(state.phase === 'shortBreak' || state.phase === 'longBreak');
    } else {
      AmbientPlayer.setDuckedForBreak(false);
    }
  }

  $('btnStart').addEventListener('click', () => {
    if (lastState && lastState.phase !== 'idle') {
      api.timer.resume();
    } else {
      api.timer.start($('intentInput').value.trim(), selectedTaskId);
    }
  });
  $('btnPause').addEventListener('click', () => api.timer.pause());
  $('btnSkip').addEventListener('click', () => api.timer.skip());
  $('btnReset').addEventListener('click', () => api.timer.reset());

  api.timer.onState(renderTimer);
  api.timer.onEvent((ev) => {
    if (ev.type === 'phase-complete' && ev.natural && settings) {
      playChime(ev.to === 'focus' ? 'focus' : 'break', settings.chimeVolume);
    }
  });

  // ---------------- Tasks ----------------
  function renderTasks() {
    const list = $('taskList');
    list.innerHTML = '';
    if (!tasks.length) {
      const li = document.createElement('li');
      li.className = 'task-empty';
      li.textContent = 'No tasks yet. Add one and select it — completed pomodoros are tallied per task.';
      list.appendChild(li);
      return;
    }
    for (const t of tasks) {
      const li = document.createElement('li');
      li.className = 'task-item' + (t.id === selectedTaskId ? ' selected' : '') + (t.done ? ' done' : '');

      const check = document.createElement('input');
      check.type = 'checkbox';
      check.className = 'task-check';
      check.checked = !!t.done;
      check.addEventListener('click', (e) => {
        e.stopPropagation();
        t.done = check.checked;
        saveTasks();
      });

      const title = document.createElement('span');
      title.className = 'task-title';
      title.textContent = t.title;

      const poms = document.createElement('span');
      poms.className = 'task-poms';
      poms.textContent = `🍅 ${t.pomodoros || 0}`;

      const del = document.createElement('button');
      del.className = 'task-del';
      del.textContent = '✕';
      del.title = 'Delete task';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        tasks = tasks.filter((x) => x.id !== t.id);
        if (selectedTaskId === t.id) selectedTaskId = null;
        saveTasks();
      });

      li.append(check, title, poms, del);
      li.addEventListener('click', () => {
        selectedTaskId = selectedTaskId === t.id ? null : t.id;
        if (selectedTaskId && !$('intentInput').value.trim()) $('intentInput').value = t.title;
        renderTasks();
      });
      list.appendChild(li);
    }
  }

  async function saveTasks() {
    tasks = await api.store.setTasks(tasks);
    renderTasks();
  }

  $('taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('taskInput').value.trim();
    if (!title) return;
    tasks.push({ id: Date.now(), title, pomodoros: 0, done: false, createdAt: Date.now() });
    $('taskInput').value = '';
    saveTasks();
  });

  api.store.onChanged(async ({ reason }) => {
    if (reason === 'session-logged') {
      tasks = await api.store.getTasks();
      renderTasks();
      refreshDashboard();
      refreshSidebarStreak();
    }
  });

  // ---------------- Ambient panel ----------------
  const ambientToggle = $('ambientToggle');
  function renderAmbientButton() {
    ambientToggle.textContent = AmbientPlayer.playing ? '⏸ Stop' : '▶ Play';
  }
  ambientToggle.addEventListener('click', () => {
    if (AmbientPlayer.playing) AmbientPlayer.stop();
    else AmbientPlayer.start();
    renderAmbientButton();
    persistAmbient();
  });
  $('ambientVolume').addEventListener('input', (e) => {
    AmbientPlayer.setMasterVolume(e.target.value / 100);
    persistAmbientDebounced();
  });
  document.querySelectorAll('#ambientMix input[type="range"]').forEach((slider) => {
    slider.addEventListener('input', () => {
      AmbientPlayer.setMix(slider.dataset.noise, slider.value / 100);
      persistAmbientDebounced();
    });
  });
  $('keepDuringBreaks').addEventListener('change', () => {
    settings.ambient.keepDuringBreaks = $('keepDuringBreaks').checked;
    if (lastState) renderTimer(lastState);
    persistAmbient();
  });

  let ambientSaveTimer = null;
  function persistAmbientDebounced() {
    clearTimeout(ambientSaveTimer);
    ambientSaveTimer = setTimeout(persistAmbient, 500);
  }
  function persistAmbient() {
    const ambient = {
      playing: AmbientPlayer.playing,
      masterVolume: $('ambientVolume').value / 100,
      mix: AmbientPlayer.getMix(),
      keepDuringBreaks: $('keepDuringBreaks').checked,
    };
    settings.ambient = { ...settings.ambient, ...ambient };
    api.store.setSettings({ ambient });
  }

  // ---------------- Dashboard ----------------
  async function refreshDashboard() {
    const [stats, sessions] = await Promise.all([api.store.getStats(), api.store.getSessions()]);
    $('statToday').textContent = formatMinutes(stats.minutesToday);
    $('statWeek').textContent = formatMinutes(stats.minutesWeek);
    $('statStreak').textContent = String(stats.streak);
    $('statSessions').textContent = String(stats.totalSessions);

    // chart
    const chart = $('chart');
    chart.innerHTML = '';
    const max = Math.max(1, ...stats.last30.map((d) => d.minutes));
    stats.last30.forEach((d, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'bar-wrap';
      const bar = document.createElement('div');
      bar.className = 'bar' + (d.minutes === 0 ? ' zero' : '');
      bar.style.height = `${Math.max(2, (d.minutes / max) * 100)}%`;
      bar.title = `${d.date}: ${formatMinutes(d.minutes)}`;
      wrap.appendChild(bar);
      if (i % 5 === 4 || i === 29) {
        const label = document.createElement('div');
        label.className = 'bar-label';
        label.textContent = d.date.slice(5).replace('-', '/');
        wrap.appendChild(label);
      }
      chart.appendChild(wrap);
    });

    // log (newest first, last 50)
    const log = $('sessionLog');
    log.innerHTML = '';
    const rows = sessions.slice(-50).reverse();
    if (!rows.length) {
      const li = document.createElement('li');
      li.className = 'log-empty';
      li.textContent = 'No sessions yet. Start a focus session and it will show up here.';
      log.appendChild(li);
      return;
    }
    for (const s of rows) {
      const li = document.createElement('li');
      li.className = 'session-row';
      const when = document.createElement('span');
      when.className = 'session-when';
      when.textContent = new Date(s.ts).toLocaleString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
      const intent = document.createElement('span');
      intent.className = 'session-intent';
      intent.textContent = s.intent || '(no intent set)';
      const mins = document.createElement('span');
      mins.className = 'session-mins';
      mins.textContent = formatMinutes(s.minutes);
      li.append(when, intent, mins);
      if (!s.natural) {
        const partial = document.createElement('span');
        partial.className = 'session-partial';
        partial.textContent = 'skipped early';
        li.appendChild(partial);
      }
      log.appendChild(li);
    }
  }

  function formatMinutes(min) {
    if (min >= 60) {
      const h = Math.floor(min / 60);
      const m = Math.round(min % 60);
      return `${h}h ${m}m`;
    }
    return `${Math.round(min)}m`;
  }

  async function refreshSidebarStreak() {
    const stats = await api.store.getStats();
    $('sidebarStreak').textContent = `🔥 ${stats.streak} day streak${stats.streak === 1 ? '' : 's'}`.replace('streaks', 'day streak');
    $('sidebarStreak').textContent = `🔥 ${stats.streak} day streak`;
  }

  // ---------------- Settings ----------------
  function renderSettings() {
    $('setFocus').value = settings.focusMin;
    $('setShort').value = settings.shortBreakMin;
    $('setLong').value = settings.longBreakMin;
    $('setEvery').value = settings.longBreakEvery;
    $('setAuto').checked = !!settings.autoStartNext;
    $('setChime').value = Math.round(settings.chimeVolume * 100);
    $('ambientVolume').value = Math.round(settings.ambient.masterVolume * 100);
    $('keepDuringBreaks').checked = !!settings.ambient.keepDuringBreaks;
    document.querySelectorAll('#ambientMix input[type="range"]').forEach((slider) => {
      const v = settings.ambient.mix[slider.dataset.noise];
      slider.value = Math.round((v || 0) * 100);
      AmbientPlayer.setMix(slider.dataset.noise, v || 0);
    });
    AmbientPlayer.setMasterVolume(settings.ambient.masterVolume);
  }

  function bindSettingInput(id, key, parse) {
    $(id).addEventListener('change', async (e) => {
      const value = parse(e.target);
      if (value === null) return;
      settings = await api.store.setSettings({ [key]: value });
    });
  }
  bindSettingInput('setFocus', 'focusMin', (el) => clampInt(el, 1, 180));
  bindSettingInput('setShort', 'shortBreakMin', (el) => clampInt(el, 1, 60));
  bindSettingInput('setLong', 'longBreakMin', (el) => clampInt(el, 1, 120));
  bindSettingInput('setEvery', 'longBreakEvery', (el) => clampInt(el, 1, 12));
  bindSettingInput('setAuto', 'autoStartNext', (el) => el.checked);
  bindSettingInput('setChime', 'chimeVolume', (el) => Number(el.value) / 100);

  function clampInt(el, min, max) {
    const v = Math.round(Number(el.value));
    if (!Number.isFinite(v)) return null;
    const clamped = Math.min(max, Math.max(min, v));
    el.value = clamped;
    return clamped;
  }

  $('chimeTest').addEventListener('click', () => playChime('break', Number($('setChime').value) / 100));

  api.store.onSettingsChanged((s) => { settings = s; });

  // ---------------- Boot ----------------
  (async function boot() {
    settings = await api.store.getSettings();
    tasks = await api.store.getTasks();
    renderSettings();
    renderTasks();
    renderAmbientButton();
    renderTimer(await api.timer.getState());
    refreshDashboard();
    refreshSidebarStreak();
  })();
})();
