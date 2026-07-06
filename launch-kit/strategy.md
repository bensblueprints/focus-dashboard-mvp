# Launch Strategy — Deepdesk

## Target communities

| Community | Angle (rules-aware) |
|---|---|
| r/pomodoro | Direct fit. Share as "I built a local-first Pomodoro app with generated ambient noise" — this sub welcomes tool posts; lead with the open-source repo, not the paid link. |
| r/productivity | No naked self-promo — post a write-up: "Why I replaced my $10/mo focus app with a one-time purchase (and open-sourced it)". Link repo in comments when asked. |
| r/GetStudying / r/GradSchool | Students on a budget = the exact "subscription fatigue" audience. Frame around study streaks + 30-day chart. Follow each sub's self-promo day rules. |
| r/ADHD_Programmers | The floating always-on-top timer + body-doubling-style ambient noise resonates here. Be genuine, disclose you're the author (required), focus on the workflow not the sale. |
| r/opensource + r/electronjs | Technical angle: pure state-machine timer with unit tests, procedural noise synthesis with WebAudio. These subs love "no audio files shipped" details. |
| Hacker News | Show HN (draft below). |
| Indie Hackers | Build-in-public post: the "one-time price vs subscription" economics of tiny desktop tools. |

## Show HN draft

**Title:** Show HN: Deepdesk – local-first focus dashboard, all sound synthesized with WebAudio

**Post:**
I kept paying for focus apps (Centered, Session) that are, at their core, a timer, a text field, and a noise loop — behind a login and a monthly bill. So I built the loop I actually use as a local Electron app and open-sourced it (MIT).

Technical bits HN might enjoy:

- The Pomodoro engine is a pure, tick-driven state machine — no timeouts in the logic. The host feeds it wall-clock deltas; tests feed it synthetic ones, so pause/skip/config-change-mid-session edge cases are all unit-tested. Pausing simply stops feeding ticks, so paused time can't leak into a session.
- Zero audio files ship with the app. White/pink/brown noise and a rain texture are generated as sample buffers (Paul Kellet's pink filter, a leaky integrator for brown, droplet synthesis for rain) and looped through WebAudio. The transition chime is synthesized bell partials.
- All data is one JSON file under userData — trivially backed up or grepped.

I sell a prebuilt Windows installer for $15 one-time; the source builds and runs with `npm i && npm start`. Happy to answer anything about the state machine or the noise synthesis.

## SEO keywords (10)

1. pomodoro app one time purchase
2. centered app alternative
3. session app alternative
4. focus timer no subscription
5. deep work app windows
6. always on top pomodoro timer
7. brown noise focus app offline
8. pomodoro app with task tracking
9. open source pomodoro desktop app
10. study timer with streaks

## AppSumo / PitchGround pitch

Deepdesk turns the $5–10/month focus-app subscription into a $15 lifetime deal your audience actually keeps. It's the full deep-work loop — Pomodoro with session intents, per-task pomodoro tallies, a floating always-on-top mini timer, procedurally generated ambient noise (white/pink/brown/rain, fully offline), and a streak-driven 30-day dashboard — running 100% locally with no account and no telemetry. That's a killer LTD story: buyers hate subscriptions, love ownership, and the MIT-licensed core builds trust while the packaged installer and lifetime updates carry the deal value. Deep-work developers, writers, and students are proven spenders in this category; give them "own your focus forever" at a price that undercuts two months of the incumbents.

## Pricing

**Suggested: $15 one-time** (launch: $12).

Competitor math for the sales page:
- Centered: ~$10/mo → Deepdesk pays for itself in **1.5 months**
- Session: ~$5/mo → pays for itself in **3 months**
- Two years of Centered = ~$240 → Deepdesk is **6%** of that.

Anchor line: "Less than two months of Centered. Yours forever."
