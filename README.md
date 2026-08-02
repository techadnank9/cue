<h1 align="center">Cue</h1>
<p align="center"><b>An AI production manager for live shows.</b><br/>
Meet Arlo — the voice that keeps the show on the rails when everything changes at once.</p>

---

## The 30-second version

Live shows change constantly — a venue has fewer channels than the rider needs, a player drops out, the set gets cut, soundcheck runs late. Today that chaos gets handled over calls, texts, and PDFs while the crew is carrying cases across a dark stage.

Cue reads the production documents, finds the conflicts, plans the fixes, and keeps every crew member's screen in sync in real time. Ask Arlo out loud — "are we ready?" — and get a straight answer. Tell Arlo "the keyboard player is out" and watch the patch list rebuild, the schedule adjust, and the readiness score recover on every screen at once.

## Demo run-of-show (3 minutes)

1. **Open the app in two browser windows side by side.** Both load the same seeded show — "Golden Gate Stage — Saturday" — and both show readiness **75** with one open issue: *"Venue supports 16 of 20 required channels."*
2. **Point at the readiness meter.** It's the same number on both screens, live, with no refresh — pure Convex reactivity.
3. **Click "Simulate: keyboard player out"** (or say it, if a mic + `OPENAI_API_KEY` is wired up). Watch both windows update at once: the keyboard player's three inputs drop off the rider and patch list, required channels go 20 → 17, Arlo logs a short spoken reply, and the readiness score recomputes.
4. **Click "Simulate: JamBase set shortened."** This drives the exact same `ingestJamBaseEvent → scheduler.runAfter → detectConflicts` chain the real JamBase cron uses. A new schedule issue appears and readiness drops — nobody touched anything except one button standing in for the outside world.
5. **Click "Reset demo"** to restore the seed state and run it again.

Every step in that run is a Convex reactive query updating in place — no polling, no manual refresh.

## Why this is a serious use of Convex

Cue treats Convex as the whole backend and its reactive engine — not a database sitting behind an API. Four patterns carry the product:

1. **The agent runs inside Convex.** Arlo's reasoning is a Convex `action` (`transcribeAndRoute`, `detectConflicts`) that calls the model or applies a deterministic check, then hands off to `mutation`s that write issues and recompute readiness. Side effects live in actions, writes live in mutations — the canonical split. → [`convex/actions.ts`](convex/actions.ts), [`convex/mutations.ts`](convex/mutations.ts)
2. **The live experience is pure reactive queries — zero polling.** Every screen subscribes to a Convex query (`getReadiness`, `listIssues`, `listTasks`, `listPresence`, `listVoiceLog`) and re-renders when a mutation writes. The two-screens-update-together moment is Convex reactivity with no client glue. Grep the client: there is no `setInterval` driving any read. → [`convex/queries.ts`](convex/queries.ts)
3. **The world changes on its own via scheduled functions.** `convex/crons.ts` runs `pollJamBase` on an interval; a real (or scripted) schedule change cascades into a new conflict with no button press required by the poll itself. → [`convex/crons.ts`](convex/crons.ts)
4. **Multi-step cascades are Convex scheduling Convex.** `ingestJamBaseEvent` calls `ctx.scheduler.runAfter(0, internal.actions.detectConflicts, …)` to trigger detection, which recomputes readiness — a chain of functions the client only ever watches the results of. → [`ingestJamBaseEvent` in `convex/mutations.ts`](convex/mutations.ts)

Every function is validated end to end with `v.*`, the schema (`convex/schema.ts`) is typed with indexes for its real access patterns (`by_show`, `by_show_status`, `by_show_name`), and every external call (OpenAI, JamBase) is server-side inside an action with env-scoped secrets — nothing external is ever called from the client.

## Architecture

```
JamBase (schedule/status) ─┐
                           ├─► Convex actions ──► Convex mutations ──► Convex tables
Crew voice (Arlo) ─────────┘        │                    │                   │
                             OpenAI reasoning      transactional        reactive queries
                                                      writes                  │
                                                                        every crew phone (live)
```

Convex holds both the production documents (rider, patch list, stage plot, schedule) and the live show state (readiness, issues, tasks, approvals, presence, voice log). One backend, one source of truth.

## Tech stack
- **Backend & realtime:** Convex (database, actions, mutations, reactive queries, scheduled functions, crons)
- **Agent:** OpenAI (`gpt-4o-mini`) for soft-conflict detection and explanations; Whisper for voice-in when wired up. The flagship channel-capacity and schedule conflicts are deterministic code, not LLM-gated — the number stays trustworthy.
- **External data:** JamBase v3 API for festival schedule, set times, venue, and live status
- **Frontend:** React 18 + Vite + Tailwind v4, Convex React client

## Run it locally
```bash
cd cue
npm install
npx convex dev        # provisions/starts your local Convex backend
npm run dev            # in another terminal
```
Open **http://localhost:5173** in two windows. The demo show seeds itself automatically on first load. To enable the LLM pass and real voice, set `OPENAI_API_KEY` and `JAMBASE_API_KEY` as Convex environment variables (`npx convex env set OPENAI_API_KEY ...`) — without them the deterministic checks and the scripted-command buttons still run the full demo.

## Safe vs. approval — the explicit boundary
Every proposed change carries a `fixClass`: `safe` (reversible edits with no artist-facing or cost impact — auto-appliable) or `approval` (set length, personnel, anything with a cost implication — a human must approve). `applySafeChange` refuses to run on an approval-class issue; see [`convex/mutations.ts`](convex/mutations.ts).

## What's built vs. what's next
**Built:** live readiness meter, deterministic channel-capacity + schedule conflict detection, an optional LLM pass for soft conflicts, the voice cascade with a scripted fallback, the autonomous JamBase-shaped external trigger via cron + scheduler chain, the crew task board, live presence, the voice log, a reset-demo path, and a mobile-first dark console UI.
**Roadmap (explicitly out of scope for this build):** real-time mic capture + TTS playback wired to a live phone call, mic plots, comms planning, pixel maps, PDF export, full document editors, multi-tenant auth, and the other eight conflict types beyond channel-capacity and schedule.

## Credits
Cue's document layer takes its data model from ideas in the open-source live-production-docs ecosystem; no code from that project was copied into this repo. Everything in `convex/` and the Cue/Arlo product is original to this project.
