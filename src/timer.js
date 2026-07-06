'use strict';

/**
 * Deepdesk timer state machine — pure, tick-driven, no real timeouts.
 *
 * The host (Electron main process, tests, anything) owns the clock and calls
 * `tick(deltaMs)`. Every mutating call returns an array of events so the host
 * can react (notifications, chimes, session logging) without the engine
 * knowing anything about the outside world.
 *
 * Phases: idle -> focus -> shortBreak -> focus -> ... -> longBreak (every
 * `longBreakEvery` completed focus sessions) -> focus -> ...
 */

const PHASES = Object.freeze({
  IDLE: 'idle',
  FOCUS: 'focus',
  SHORT_BREAK: 'shortBreak',
  LONG_BREAK: 'longBreak',
});

const DEFAULT_CONFIG = Object.freeze({
  focusMs: 25 * 60 * 1000,
  shortBreakMs: 5 * 60 * 1000,
  longBreakMs: 15 * 60 * 1000,
  longBreakEvery: 4, // long break after every N completed focus sessions
  autoStartNext: true, // auto-cycle into the next phase
});

class FocusTimer {
  constructor(config = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.phase = PHASES.IDLE;
    this.running = false;
    this.elapsedMs = 0; // time accrued in the current phase (excludes paused time)
    this.completedFocusSessions = 0; // focus phases that ran to natural completion
    this.focusSinceLongBreak = 0;
    this.intent = '';
    this.taskId = null;
  }

  phaseDuration(phase = this.phase) {
    switch (phase) {
      case PHASES.FOCUS: return this.config.focusMs;
      case PHASES.SHORT_BREAK: return this.config.shortBreakMs;
      case PHASES.LONG_BREAK: return this.config.longBreakMs;
      default: return 0;
    }
  }

  get remainingMs() {
    return Math.max(0, this.phaseDuration() - this.elapsedMs);
  }

  /** Fraction of the current phase completed, 0..1. */
  get progress() {
    const dur = this.phaseDuration();
    return dur > 0 ? Math.min(1, this.elapsedMs / dur) : 0;
  }

  /** Begin a focus session (from idle) or resume if paused. */
  start(intent, taskId) {
    const events = [];
    if (intent !== undefined && intent !== null) this.intent = String(intent);
    if (taskId !== undefined) this.taskId = taskId;
    if (this.phase === PHASES.IDLE) {
      this.phase = PHASES.FOCUS;
      this.elapsedMs = 0;
      events.push({ type: 'phase-start', phase: PHASES.FOCUS });
    }
    this.running = true;
    return events;
  }

  pause() {
    if (!this.running) return [];
    this.running = false;
    return [{ type: 'paused', phase: this.phase, remainingMs: this.remainingMs }];
  }

  resume() {
    if (this.running || this.phase === PHASES.IDLE) return [];
    this.running = true;
    return [{ type: 'resumed', phase: this.phase, remainingMs: this.remainingMs }];
  }

  /** Abandon everything and return to idle. */
  reset() {
    this.phase = PHASES.IDLE;
    this.running = false;
    this.elapsedMs = 0;
    return [{ type: 'reset' }];
  }

  /**
   * Advance the clock. Paused/idle timers ignore ticks entirely (pause/resume
   * time accounting lives here: wall time passing while paused never counts).
   * A single large delta may complete multiple phases; all events are returned
   * in order.
   */
  tick(deltaMs) {
    const events = [];
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return events;
    if (!this.running || this.phase === PHASES.IDLE) return events;

    let left = deltaMs;
    let guard = 0;
    while (left > 0 && this.running && this.phase !== PHASES.IDLE && guard++ < 10000) {
      const rem = this.remainingMs;
      if (left >= rem) {
        this.elapsedMs += rem;
        left -= rem;
        this._completePhase(events, /* natural */ true);
      } else {
        this.elapsedMs += left;
        left = 0;
      }
    }
    return events;
  }

  /**
   * Skip the rest of the current phase and advance. A skipped focus phase
   * does NOT count as a completed session (no cheating the streak), but the
   * partial focus time is still reported on the event for logging.
   */
  skip() {
    if (this.phase === PHASES.IDLE) return [];
    const events = [];
    this._completePhase(events, /* natural */ false);
    return events;
  }

  /**
   * Change config mid-session. The elapsed time in the current phase is kept;
   * if the new duration is now <= elapsed, the phase completes immediately
   * (naturally — the user already put the time in).
   */
  setConfig(partial) {
    this.config = { ...this.config, ...partial };
    const events = [{ type: 'config-changed', config: { ...this.config } }];
    if (this.phase !== PHASES.IDLE && this.elapsedMs >= this.phaseDuration()) {
      this._completePhase(events, true);
    }
    return events;
  }

  getState() {
    return {
      phase: this.phase,
      running: this.running,
      elapsedMs: this.elapsedMs,
      remainingMs: this.remainingMs,
      progress: this.progress,
      durationMs: this.phaseDuration(),
      completedFocusSessions: this.completedFocusSessions,
      focusSinceLongBreak: this.focusSinceLongBreak,
      intent: this.intent,
      taskId: this.taskId,
      config: { ...this.config },
    };
  }

  _completePhase(events, natural) {
    const from = this.phase;
    const focusMs = from === PHASES.FOCUS
      ? Math.min(this.elapsedMs, this.phaseDuration(from))
      : 0;

    let to;
    if (from === PHASES.FOCUS) {
      if (natural) {
        this.completedFocusSessions += 1;
        this.focusSinceLongBreak += 1;
      }
      if (natural && this.focusSinceLongBreak >= this.config.longBreakEvery) {
        to = PHASES.LONG_BREAK;
        this.focusSinceLongBreak = 0;
      } else {
        to = PHASES.SHORT_BREAK;
      }
    } else {
      to = PHASES.FOCUS;
    }

    this.phase = to;
    this.elapsedMs = 0;
    if (!this.config.autoStartNext) this.running = false;

    events.push({
      type: 'phase-complete',
      from,
      to,
      natural,
      focusMs,
      intent: this.intent,
      taskId: this.taskId,
      autoStarted: this.running,
    });
  }
}

module.exports = { FocusTimer, PHASES, DEFAULT_CONFIG };
