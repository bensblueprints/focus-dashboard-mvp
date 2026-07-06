'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Tiny JSON file store for Deepdesk. Lives under Electron's userData dir in
 * the app; tests point it at a temp dir. Atomic-ish writes (tmp + rename).
 */

const DEFAULTS = Object.freeze({
  settings: {
    focusMin: 25,
    shortBreakMin: 5,
    longBreakMin: 15,
    longBreakEvery: 4,
    autoStartNext: true,
    chimeVolume: 0.5,
    ambient: {
      playing: false,
      masterVolume: 0.5,
      mix: { white: 0, pink: 0, brown: 0.6, rain: 0.4 },
      keepDuringBreaks: true,
    },
  },
  tasks: [], // { id, title, pomodoros, done, createdAt }
  sessions: [], // { ts, intent, minutes, taskId, natural }
});

function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function startOfWeek(ts) {
  const d = new Date(startOfDay(ts));
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = path.join(dir, 'deepdesk-data.json');
    this.data = this._load();
  }

  _load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        settings: {
          ...DEFAULTS.settings,
          ...(parsed.settings || {}),
          ambient: {
            ...DEFAULTS.settings.ambient,
            ...((parsed.settings || {}).ambient || {}),
            mix: {
              ...DEFAULTS.settings.ambient.mix,
              ...(((parsed.settings || {}).ambient || {}).mix || {}),
            },
          },
        },
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULTS));
    }
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmp, this.file);
  }

  // ---- settings ----
  getSettings() { return this.data.settings; }

  setSettings(partial) {
    const prev = this.data.settings;
    this.data.settings = {
      ...prev,
      ...partial,
      ambient: {
        ...prev.ambient,
        ...(partial.ambient || {}),
        mix: { ...prev.ambient.mix, ...((partial.ambient || {}).mix || {}) },
      },
    };
    this.save();
    return this.data.settings;
  }

  // ---- tasks ----
  getTasks() { return this.data.tasks; }

  setTasks(tasks) {
    this.data.tasks = Array.isArray(tasks) ? tasks : [];
    this.save();
    return this.data.tasks;
  }

  incrementTaskPomodoro(taskId) {
    const t = this.data.tasks.find((x) => x.id === taskId);
    if (t) {
      t.pomodoros = (t.pomodoros || 0) + 1;
      this.save();
    }
    return t || null;
  }

  // ---- sessions ----
  addSession(session) {
    const s = {
      ts: session.ts || Date.now(),
      intent: session.intent || '',
      minutes: Math.max(0, Math.round((session.minutes || 0) * 10) / 10),
      taskId: session.taskId ?? null,
      natural: session.natural !== false,
    };
    this.data.sessions.push(s);
    this.save();
    return s;
  }

  getSessions() { return this.data.sessions; }

  /** Dashboard stats: today / this week focus minutes, day streak, 30-day series. */
  getStats(now = Date.now()) {
    const sessions = this.data.sessions;
    const todayStart = startOfDay(now);
    const weekStart = startOfWeek(now);

    let minutesToday = 0;
    let minutesWeek = 0;
    const byDay = new Map(); // dayKey -> minutes
    for (const s of sessions) {
      if (s.ts >= todayStart) minutesToday += s.minutes;
      if (s.ts >= weekStart) minutesWeek += s.minutes;
      const k = dayKey(s.ts);
      byDay.set(k, (byDay.get(k) || 0) + s.minutes);
    }

    // Streak: consecutive days with >= 1 session, counting back from today
    // (or from yesterday if today has none yet — today doesn't break it).
    let streak = 0;
    let cursor = todayStart;
    if (!byDay.has(dayKey(cursor))) cursor -= 86400000;
    while (byDay.has(dayKey(cursor))) {
      streak += 1;
      cursor -= 86400000;
    }

    // Last 30 days series, oldest first.
    const last30 = [];
    for (let i = 29; i >= 0; i--) {
      const ts = todayStart - i * 86400000;
      const k = dayKey(ts);
      last30.push({ date: k, minutes: Math.round((byDay.get(k) || 0) * 10) / 10 });
    }

    return {
      minutesToday: Math.round(minutesToday * 10) / 10,
      minutesWeek: Math.round(minutesWeek * 10) / 10,
      streak,
      last30,
      totalSessions: sessions.length,
    };
  }
}

module.exports = { Store, DEFAULTS, dayKey };
