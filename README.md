<h1 align="center">Cue</h1>
<p align="center"><b>A festival operations platform with a voice agent, Arlo.</b><br/>
One app for the ops team, the fans, and the show — all three talk to the same live data, all three talk to Arlo.</p>

<p align="center"><b>Live:</b> https://cue-psi-snowy.vercel.app</p>

---

## The 30-second version

Festivals run on three groups who never see each other's information: the ops team tracking crowd flow and volunteer coverage, fans trying to find their favorite artist or the nearest restroom, and the production crew running a specific show's readiness and patch list. Cue puts all three in one app on top of one live Convex backend, with a voice agent — Arlo — who answers differently depending on who's asking and what page they're on.

Tap the mic, anywhere in the app, and talk. Ask ops "which zones need volunteers" and get real staffing numbers. Ask the fan guide "where's my favorite artist" and get a stage, a time, and directions. Say "the keyboard player is out" on the show console and watch the patch list rebuild and the readiness score recompute live, on every screen watching it.

## The three surfaces

1. **Festival Ops** — a live venue map. Zones (gates, stages, backstage, green room, FOH, restrooms, food/drink) glow by real-time crowd density, flare red at critical, and flag themselves when understaffed. Click a zone to see detail and assign an available volunteer with one tap. Artist lineup with click-to-advance status.
2. **Fan Guide** — today's lineup in plain language, restroom/food-drink locations, and an in-page Ask Arlo chat.
3. **Show Console** — the original single-show production flow: a live readiness meter, the flagship "venue supports 16 of 20 required channels" conflict, the voice-cascade demo, a task board, crew presence.

A **floating voice widget** sits on top of all three, always visible, and follows you across tabs — its conversation history persists as you navigate because it's one component that's never unmounted, not a per-page reset.

## Meet Arlo

Arlo isn't a chatbot wedged into a corner — she's a real voice, everywhere in the app:

- **Real microphone capture** (`MediaRecorder`), **real speech-to-text** (OpenAI Whisper), **a real spoken voice back** (OpenAI TTS, `nova` — warm and friendly), not a text box that happens to also talk.
- **Built as a call, not a chat.** One big talk button that visibly moves through *listening → thinking → speaking*. Dedicated mute-mic and mute-Arlo's-voice controls. A stop button that actually stops — cancels a recording before it sends, or cuts Arlo off mid-sentence. Typing is available but tucked behind a "Type instead" toggle, because talking is the point.
- **Context-aware by page.** The same floating mic answers completely differently depending where you are:
  - *Festival Ops* → crowd density, understaffed zones, artist status — crew-facing, no fluff.
  - *Fan Guide* → warm, lineup- and amenity-grounded answers for a fan.
  - *Show Console* → the actual production cascade, including "the keyboard player is out."
- **Remembers the conversation.** Recent turns on the current page feed back into the model as context, so a follow-up question makes sense without repeating yourself.
- **Grounded, not hallucinated.** Every answer is built from live Convex data (the same zones, artists, and readiness numbers the screens show) — deterministic keyword matching handles the common cases with zero API cost; an LLM only fills in anything open-ended, using that same live data as its only source of truth.

## Why this is a serious use of Convex

Cue treats Convex as the whole backend and its reactive engine — not a database sitting behind an API. The patterns that carry the product:

1. **The agent runs inside Convex.** Arlo's reasoning lives in Convex `action`s (`transcribeAndRoute`, `askGuide`, `speak`, `detectConflicts`) that call OpenAI or apply a deterministic check, then hand off to `mutation`s that write state. Side effects live in actions, writes live in mutations — the canonical split. → [`convex/actions.ts`](convex/actions.ts), [`convex/fan.ts`](convex/fan.ts), [`convex/mutations.ts`](convex/mutations.ts)
2. **The live experience is pure reactive queries — zero polling.** Every screen subscribes to a Convex query (`getReadiness`, `listIssues`, `listZoneStatus`, `listArtists`, `listPresence`) and re-renders when a mutation writes. Grep the client: there is no `setInterval` driving any read — the only one that exists is a presence *write* heartbeat, not a data poll. → [`convex/queries.ts`](convex/queries.ts), [`convex/backstage.ts`](convex/backstage.ts)
3. **The world changes on its own via scheduled functions.** `convex/crons.ts` runs `simulateCrowdTick` every 5 seconds (the festival map genuinely moves without anyone touching it) and `pollJamBase` on an interval. → [`convex/crons.ts`](convex/crons.ts)
4. **Multi-step cascades are Convex scheduling Convex.** `ingestJamBaseEvent` calls `ctx.scheduler.runAfter(0, internal.actions.detectConflicts, …)` — a chain of functions the client only ever watches the results of. → [`convex/mutations.ts`](convex/mutations.ts)

Every function is validated end to end with `v.*`, the schema (`convex/schema.ts`) is typed with indexes for its real access patterns, and every external call (OpenAI, JamBase) is server-side inside an action with env-scoped secrets — nothing external is ever called from the client.

## Architecture

```
OpenAI (Whisper STT / TTS / chat) ─┐
JamBase (schedule/status, partial) ┤
                                    ├─► Convex actions ──► Convex mutations ──► Convex tables
Mic input (any page) ──────────────┘        │                    │                   │
                                      reasoning / STT / TTS  transactional      reactive queries
                                                                writes                  │
                                                                                  every screen (live)
```

Convex holds the festival's live state (zones, crowd readings, artists, volunteers) and the show's production documents (rider, patch list, schedule, readiness, issues, tasks, presence, voice log). One backend, one source of truth, three surfaces reading and writing the same tables.

## Tech stack
- **Backend & realtime:** Convex — database, actions, mutations, reactive queries, scheduled functions, crons
- **Agent:** OpenAI (`gpt-4o-mini` for reasoning/chat, `whisper-1` for speech-to-text, `tts-1` with the `nova` voice for speech-out). Flagship conflict detection (channel-capacity, schedule) is deterministic code, never LLM-gated — the readiness number stays trustworthy even with no API key configured.
- **External data:** JamBase (festival schedule/artist data) — real data was pulled in as a one-time seed via JamBase's MCP server; live polling isn't wired up yet, see `HANDOFF.md`.
- **Frontend:** React 18 + Vite + Tailwind v4, Convex React client, `MediaRecorder` for mic capture

## Run it locally
```bash
cd cue
npm install
npx convex dev        # provisions/starts your Convex backend
npm run dev            # in another terminal
```
Open **http://localhost:5173**. Everything seeds itself automatically on first load. Set `OPENAI_API_KEY` (and optionally `JAMBASE_API_KEY`) as Convex environment variables (`npx convex env set OPENAI_API_KEY ...`) to enable voice and the LLM fallback — without a key, deterministic checks and the scripted-command buttons still run the full demo, just without a spoken voice.

## Safe vs. approval — the explicit boundary
Every proposed change on the Show Console carries a `fixClass`: `safe` (reversible edits with no artist-facing or cost impact — auto-appliable) or `approval` (set length, personnel, anything with a cost implication — a human must approve). `applySafeChange` refuses to run on an approval-class issue; see [`convex/mutations.ts`](convex/mutations.ts).

## What's built vs. what's next
**Built:** the festival ops map with live simulated crowd density and volunteer allocation, the fan guide, the original show console, a real voice agent (mic → Whisper → grounded answer → TTS) available as a floating call-style widget on every page plus in-page chats, deployed to Vercel + Convex cloud.

**Open threads** (full detail in `HANDOFF.md`): JamBase live polling isn't wired up (the MCP path works but isn't integrated into the cron; a one-time real-data seed was pulled via MCP); `convex/_generated/` is committed to git (cosmetic); no automated tests (explicit call); a real human hasn't been observed talking to Arlo through an actual live microphone yet, though the whole pipeline is proven with real synthesized audio.

**Explicitly out of scope, by design:** mic plots, comms planning, pixel maps, PDF export, full document editors, multi-tenant auth, the other eight conflict types beyond channel-capacity and schedule.

## Credits
Cue's document layer takes its data model from ideas in the open-source live-production-docs ecosystem; no code from that project was copied into this repo. Everything in `convex/` and the Cue/Arlo product is original to this project.
