# Product Hunt Launch — Deepdesk

## Name
Deepdesk

## Tagline (60 chars max)
The $15-once focus app. Pomodoro, ambient noise, no sub.
(56 chars)

## Description (260 chars max)
Deepdesk is a local-first focus dashboard: Pomodoro timer with session intents, per-task pomodoro tallies, a floating always-on-top mini timer, procedurally generated ambient noise, and streak/history stats. Pay $15 once. No account, no cloud, no subscription.
(259 chars)

## Full description

Deepdesk replaces the $5–10/month focus apps (Centered, Session) with software you actually own.

**What you get:**

- A Pomodoro engine with configurable focus/break lengths, auto-cycling, and a long break after every N sessions
- "What are you working on?" intents attached to every session, plus a task list that tallies pomodoros per task
- A frameless, draggable, always-on-top mini timer with a live progress ring — hover to expand controls
- Ambient sound generated live with WebAudio: white, pink, and brown noise plus procedural rain, with per-source mixing (no streamed audio, works fully offline)
- Gentle synthesized chimes and OS notifications on every transition
- A dashboard with focus minutes today/this week, your day streak, a 30-day chart, and a full session log

Everything is stored as plain JSON on your machine. No account. No telemetry. The core is MIT open source; the paid version is the 1-click Windows installer.

## Maker first comment

Hey PH 👋

I built Deepdesk because I got tired of paying $10/mo for a Pomodoro timer with a todo list stapled to it. I loved the *shape* of Centered and Session — intents, flow music, the little floating timer — but a recurring bill for a timer never sat right, and I didn't love my focus history living in someone's cloud.

So I rebuilt the parts I actually used, local-first:

- The timer brain is a pure state machine (it's unit-tested — pause/skip/config-change edge cases and all)
- The ambient noise isn't streamed or shipped as MP3s — white/pink/brown/rain are all synthesized in real time with WebAudio
- Your data is one JSON file on your disk you can back up or grep

It's $15 once. The code is MIT on GitHub if you'd rather build it yourself — the payment is for the 1-click installer and for keeping this sustainable.

Honest limitations: it's Windows-first right now (Electron, so mac/linux builds are trivial and coming), and there's no calendar integration yet. Ask me anything — I'll be here all day.

## Gallery shot list (5 shots)

1. **Hero — Focus view**: the big progress ring mid-session showing "FOCUS 17:42", intent "Write launch post" above it, task list and ambient mixer beside it, dark UI. Caption: "One screen. Intent, timer, tasks, sound."
2. **Mini timer over real work**: the floating mini widget in the corner of a code editor / doc, progress ring visible, expanded state with Pause/Skip/Open on hover. Caption: "Always-on-top mini timer follows you everywhere."
3. **Dashboard**: stat cards (focus today, this week, 🔥 streak, sessions) above the 30-day bar chart and session log with intents. Caption: "See your deep work stack up — 30-day history, streaks, every intent logged."
4. **Ambient mixer close-up**: the four sliders (white/pink/brown/rain) with the "generated live" tag and keep-during-breaks toggle. Caption: "Ambient noise synthesized in real time. No streams, no files, works offline."
5. **Comparison card**: Deepdesk $15 once vs Centered ~$240/2yr vs Session ~$120/2yr table on brand background. Caption: "Pay once. Own it forever."
