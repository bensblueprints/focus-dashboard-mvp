# ◈ Deepdesk — Focus Dashboard

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Pay once. Own it forever. No subscription.**

Deepdesk is a local-first deep-work dashboard for Windows (and anywhere Electron runs). It replaces $5–10/month focus apps like **Centered** and **Session** with a one-time purchase: a Pomodoro engine, session intents, a per-task pomodoro tally, a floating always-on-top mini timer, procedurally generated ambient noise, and a dashboard that shows your streaks and focus history — all stored on **your** machine. No account. No cloud. No telemetry.

![Deepdesk screenshot](docs/screenshot.png)

## ☕ Skip the setup — get the 1-click installer

Don't want to touch a terminal? Grab the packaged Windows installer:

**→ [Get Deepdesk on Whop](https://whop.com/benjisaiempire/deepdesk)** — one-time payment, lifetime updates.

The source here is MIT and always will be. The paid version is the convenience: a signed installer, auto-shortcuts, zero setup.

## Features

- **Pomodoro timer** — configurable focus / short break / long break lengths, auto-cycling, long break after every N sessions, pause and skip.
- **Session intent** — answer "what are you working on?" before each session; every intent lands in your session log.
- **Task list with pomodoro tallies** — add tasks, select the active one, and watch its 🍅 count grow as you complete sessions.
- **Always-on-top mini timer** — frameless, draggable floating widget with a live progress ring. Hover to expand pause / skip / open controls.
- **Transitions you can feel** — OS notification plus a gentle two-note chime synthesized live with WebAudio (no audio files shipped).
- **Ambient sound engine** — white, pink, and brown noise plus procedural rain, all generated mathematically in real time. Per-source mix sliders, master volume, and a "keep playing during breaks" toggle.
- **Daily dashboard** — focus minutes today and this week, day streak, a 30-day history chart, and a full session log with intents.
- **Local-first** — settings, tasks, and history persist as plain JSON under your OS user-data folder. Yours to back up, grep, or delete.

## Quick start

```bash
npm i
npm start
```

That's it. The main dashboard and the floating mini timer open together.

```bash
npm test    # runs the smoke suite: timer engine, noise generators, persistence
npm run dist  # builds the Windows NSIS installer (electron-builder)
```

## Deepdesk vs. the subscription apps

| | **Deepdesk** | Centered | Session |
|---|---|---|---|
| Price | **$15 once** | ~$10/mo | ~$5/mo |
| Cost over 2 years | **$15** | ~$240 | ~$120 |
| Works offline | ✅ Always | Partly | Partly |
| Account required | ❌ Never | ✅ | ✅ |
| Your data location | **Your disk** | Their cloud | Their cloud |
| Pomodoro + intents + tasks | ✅ | ✅ | ✅ |
| Floating mini timer | ✅ | ✅ | ✅ |
| Ambient noise (generated) | ✅ | ✅ (streamed) | ❌ |
| Open source | ✅ MIT | ❌ | ❌ |

## How it works

- **`src/timer.js`** — the whole Pomodoro brain is a pure, tick-driven state machine. No `setTimeout` in the logic; the Electron main process feeds it wall-clock deltas, tests feed it synthetic ones. Pause simply stops feeding ticks, so paused time can never leak into a session.
- **`src/noise.js`** — white/pink/brown/rain noise as pure sample-buffer math (Paul Kellet pink filter, leaky-integrator brown, droplet-synthesis rain). The renderer copies these into looping stereo `AudioBuffer`s.
- **`src/store.js`** — atomic JSON persistence (settings, tasks, session log) plus streak/series stats, under Electron's `userData` dir.
- **`src/main.js`** — owns the clock, the two windows, notifications, and IPC. The mini window is frameless, transparent, always-on-top, and resized from the main process on hover.

## Tech stack

- **Electron** (main + preload + renderer, context-isolated, no nodeIntegration)
- **Vanilla HTML/CSS/JS** renderer — zero runtime dependencies
- **WebAudio** for every sound in the app — nothing is shipped as an audio file
- **electron-builder** for the Windows NSIS installer

## License

[MIT](LICENSE) © 2026 Ben (bensblueprints)
