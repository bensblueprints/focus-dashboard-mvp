'use strict';

/**
 * Deepdesk smoke test — pure Node, no Electron required.
 *   1. Timer state machine: cycling, long breaks, pause/resume accounting,
 *      skip semantics, mid-session config changes.
 *   2. Noise generators produce non-silent, valid sample buffers.
 *   3. Store: session log + settings persistence round-trip and stats.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { FocusTimer, PHASES } = require('../src/timer');
const { generateNoise, rms, NOISE_TYPES } = require('../src/noise');
const { Store } = require('../src/store');

let assertions = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); assertions++; console.log(`  ✓ ${msg}`); };
const eq = (a, b, msg) => { assert.strictEqual(a, b, `${msg} (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); assertions++; console.log(`  ✓ ${msg}`); };

const MIN = 60000;

console.log('\n== 1. Timer: focus -> short break -> focus cycling ==');
{
  const t = new FocusTimer({ focusMs: 25 * MIN, shortBreakMs: 5 * MIN, longBreakMs: 15 * MIN, longBreakEvery: 4 });
  eq(t.phase, PHASES.IDLE, 'starts idle');
  t.start('write smoke tests');
  eq(t.phase, PHASES.FOCUS, 'start() enters focus');
  eq(t.remainingMs, 25 * MIN, 'full focus duration remaining');

  let events = t.tick(10 * MIN);
  eq(events.length, 0, 'no events mid-phase');
  eq(t.remainingMs, 15 * MIN, 'tick decrements remaining');

  events = t.tick(15 * MIN);
  eq(events.length, 1, 'phase-complete emitted at zero');
  eq(events[0].type, 'phase-complete', 'event type is phase-complete');
  eq(events[0].from, PHASES.FOCUS, 'completed phase was focus');
  eq(events[0].to, PHASES.SHORT_BREAK, 'auto-cycles into short break');
  eq(events[0].focusMs, 25 * MIN, 'event reports full focus time');
  eq(t.completedFocusSessions, 1, 'completed session counted');
  ok(t.running, 'autoStartNext keeps it running');

  t.tick(5 * MIN);
  eq(t.phase, PHASES.FOCUS, 'short break flows back into focus');
}

console.log('\n== 2. Timer: long break after every N sessions ==');
{
  const t = new FocusTimer({ focusMs: 10 * MIN, shortBreakMs: 2 * MIN, longBreakMs: 20 * MIN, longBreakEvery: 3 });
  t.start();
  // sessions 1 and 2 -> short breaks
  t.tick(10 * MIN); // complete focus 1
  eq(t.phase, PHASES.SHORT_BREAK, 'session 1 -> short break');
  t.tick(2 * MIN); // break done -> focus 2
  t.tick(10 * MIN); // complete focus 2
  eq(t.phase, PHASES.SHORT_BREAK, 'session 2 -> short break');
  t.tick(2 * MIN); // -> focus 3
  const events = t.tick(10 * MIN); // complete focus 3
  eq(events[0].to, PHASES.LONG_BREAK, 'session 3 (N=3) -> LONG break');
  eq(t.remainingMs, 20 * MIN, 'long break uses long duration');
  eq(t.focusSinceLongBreak, 0, 'cycle counter resets after long break');
  eq(t.completedFocusSessions, 3, 'total completed sessions tracked');
  // one giant tick spanning long break + a full focus session
  const spanned = t.tick(20 * MIN + 10 * MIN);
  eq(spanned.length, 2, 'one big tick can complete multiple phases');
  eq(t.completedFocusSessions, 4, 'spanned focus session counted too');
}

console.log('\n== 3. Timer: pause/resume time accounting ==');
{
  const t = new FocusTimer({ focusMs: 20 * MIN });
  t.start('deep work');
  t.tick(8 * MIN);
  eq(t.remainingMs, 12 * MIN, '8 minutes elapsed before pause');
  t.pause();
  ok(!t.running, 'pause stops the run flag');
  const paused = t.tick(45 * MIN); // wall-clock time passes while paused
  eq(paused.length, 0, 'ticks while paused emit nothing');
  eq(t.remainingMs, 12 * MIN, 'paused time does NOT count against the session');
  t.resume();
  t.tick(12 * MIN - 1000);
  eq(t.remainingMs, 1000, 'resume continues from exactly where it paused');
  const done = t.tick(1000);
  eq(done[0].type, 'phase-complete', 'session completes after full 20 focused minutes');
  eq(t.completedFocusSessions, 1, 'pause/resume still yields one completed session');
}

console.log('\n== 4. Timer: skip semantics ==');
{
  const t = new FocusTimer({ focusMs: 25 * MIN, shortBreakMs: 5 * MIN });
  t.start();
  t.tick(3 * MIN);
  const ev = t.skip();
  eq(ev[0].type, 'phase-complete', 'skip completes the phase');
  eq(ev[0].natural, false, 'skip is flagged as not natural');
  eq(ev[0].focusMs, 3 * MIN, 'skip still reports partial focus time');
  eq(t.phase, PHASES.SHORT_BREAK, 'skip advances focus -> break');
  eq(t.completedFocusSessions, 0, 'skipped focus does not count as completed');
  const ev2 = t.skip();
  eq(ev2[0].to, PHASES.FOCUS, 'skipping a break jumps back to focus');
  eq(t.remainingMs, 25 * MIN, 'new focus phase starts fresh');
  eq(new FocusTimer().skip().length, 0, 'skip while idle is a no-op');
}

console.log('\n== 5. Timer: config change mid-session ==');
{
  const t = new FocusTimer({ focusMs: 25 * MIN, shortBreakMs: 5 * MIN });
  t.start();
  t.tick(10 * MIN);
  // extend focus mid-session
  t.setConfig({ focusMs: 50 * MIN });
  eq(t.remainingMs, 40 * MIN, 'extending duration keeps elapsed, grows remaining');
  // shrink below elapsed -> completes immediately (user already did the time)
  const ev = t.setConfig({ focusMs: 5 * MIN });
  const complete = ev.find((e) => e.type === 'phase-complete');
  ok(complete && complete.natural, 'shrinking below elapsed completes the phase naturally');
  eq(t.phase, PHASES.SHORT_BREAK, 'now in short break under new config');
  t.setConfig({ shortBreakMs: 1 * MIN });
  eq(t.remainingMs, 1 * MIN, 'break duration change applies to current break');
  // autoStartNext=false stops at boundaries
  const t2 = new FocusTimer({ focusMs: 10 * MIN, autoStartNext: false });
  t2.start();
  t2.tick(10 * MIN);
  ok(!t2.running && t2.phase === PHASES.SHORT_BREAK, 'autoStartNext=false pauses at phase boundary');
}

console.log('\n== 6. Noise generators produce non-silent valid buffers ==');
{
  eq(NOISE_TYPES.length, 4, 'four noise types available (white/pink/brown/rain)');
  for (const type of NOISE_TYPES) {
    const buf = generateNoise(type, { sampleRate: 44100, durationSec: 1, seed: 1234 });
    ok(buf instanceof Float32Array, `${type}: returns Float32Array (AudioBuffer channel shape)`);
    eq(buf.length, 44100, `${type}: correct sample count for 1s @ 44.1kHz`);
    let inRange = true;
    for (let i = 0; i < buf.length; i++) {
      if (!Number.isFinite(buf[i]) || buf[i] < -1 || buf[i] > 1) { inRange = false; break; }
    }
    ok(inRange, `${type}: all samples finite and within [-1, 1]`);
    const level = rms(buf);
    ok(level > 0.005, `${type}: buffer is non-silent (RMS ${level.toFixed(4)})`);
  }
  const a = generateNoise('white', { durationSec: 0.1, seed: 42 });
  const b = generateNoise('white', { durationSec: 0.1, seed: 42 });
  ok(a.every((v, i) => v === b[i]), 'seeded generation is deterministic');
}

console.log('\n== 7. Store: session log + settings persistence round-trip ==');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepdesk-test-'));
  try {
    const s1 = new Store(dir);
    s1.setSettings({ focusMin: 50, ambient: { mix: { rain: 1 } } });
    s1.setTasks([{ id: 1, title: 'Ship Deepdesk', pomodoros: 0, done: false }]);
    s1.incrementTaskPomodoro(1);
    const now = Date.now();
    s1.addSession({ ts: now, intent: 'write README', minutes: 25, taskId: 1 });
    s1.addSession({ ts: now - 86400000, intent: 'yesterday work', minutes: 50 });
    s1.addSession({ ts: now - 2 * 86400000, intent: 'two days ago', minutes: 10 });

    // Fresh instance reading the same file = full round-trip through disk.
    const s2 = new Store(dir);
    eq(s2.getSettings().focusMin, 50, 'settings survive the round-trip');
    eq(s2.getSettings().ambient.mix.rain, 1, 'nested ambient mix survives');
    eq(s2.getSettings().shortBreakMin, 5, 'unset settings keep defaults after merge');
    eq(s2.getTasks()[0].pomodoros, 1, 'task pomodoro count persisted');
    eq(s2.getSessions().length, 3, 'all sessions persisted');
    eq(s2.getSessions()[0].intent, 'write README', 'session intent round-trips');

    const stats = s2.getStats(now);
    eq(stats.minutesToday, 25, 'stats: minutes today');
    eq(stats.streak, 3, 'stats: 3-day streak detected');
    eq(stats.last30.length, 30, 'stats: 30-day series has 30 entries');
    eq(stats.last30[29].minutes, 25, 'stats: today is the last series entry');
    ok(stats.minutesWeek >= 25, 'stats: week total includes today');

    // corrupt file -> safe defaults, no crash
    fs.writeFileSync(path.join(dir, 'deepdesk-data.json'), '{not json', 'utf8');
    const s3 = new Store(dir);
    eq(s3.getSessions().length, 0, 'corrupt data file falls back to defaults');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`\nAll smoke tests passed — ${assertions} assertions.`);
