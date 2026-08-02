# Cue — handoff

Read this first. It's the full history of the build, current state, and
what's left. Written so a fresh Claude Code session (or a human) can pick up
in this repo with zero prior context.

## What Cue is

Started as a hackathon brief for a single-show "AI production manager" with
a voice agent named Arlo. It has since grown into three surfaces in one app,
all sharing one voice agent that's aware of which surface you're on:

1. **Festival Ops** (`src/BackstageOps.tsx`, default tab) — a festival-wide
   map for crew: entry gates, stages, backstage, green room, FOH, restrooms,
   food/drink, each a "zone" with a live simulated crowd count. Density
   drives a glow (green/amber/red, flares red at critical) and a "needs
   volunteers" flag. Click a zone for detail + one-click volunteer
   assignment. Artist lineup with click-to-advance status
   (not_arrived → arrived → soundcheck → ready). Backed by
   `convex/backstage.ts`.
2. **Fan Guide** (`src/FanGuide.tsx`) — a fan-facing page: today's lineup in
   plain language, restroom/food-drink locations, and an in-page "Ask Arlo"
   chat. Backed by `convex/fan.ts`.
3. **Show Console** (`ShowConsole`, inside `src/App.tsx`) — the *original*
   single-show flow from the hackathon brief: readiness meter, the flagship
   "venue supports 16 of 20 channels" conflict, the voice-cascade demo
   ("the keyboard player is out"), a JamBase-shaped scripted trigger button,
   task board, crew presence. Kept intact, demoted to a tab, not deleted.

Tabs switch via `App.tsx`'s top nav. On top of all three sits a **floating
global voice widget** (`src/GlobalVoiceWidget.tsx`) — see below, it's the
main way anyone (crew, volunteer, or fan) is meant to interact with Arlo now.

Everything is Convex: reactive queries for all reads, mutations for all
writes, actions for the only external calls (OpenAI Whisper/TTS/chat, and an
unused JamBase REST fetch), a cron for simulated crowd density, and
`ctx.scheduler.runAfter` for the schedule→detect→recompute cascade. No
client polling — grep for `setInterval` and the only hit is the presence
heartbeat, which is a *write* heartbeat, not a data poll.

## The voice agent — Arlo

This is the actual product now, not a bolt-on. Three places you can talk to
her, all real (mic in, Whisper transcription, grounded answer, TTS voice
out — nothing here is mocked or a stub):

### 1. Floating global widget (`src/GlobalVoiceWidget.tsx`)
Always on screen, bottom-right, on every tab. Mounted once at the `App.tsx`
root *outside* the tab switch, so it never unmounts when you change tabs —
which is also why its conversation history survives navigating between
tabs (you'll see a small page-of-origin label like "Festival Ops" on older
turns asked from a different tab).

Built as a **call interface, not a chat window** (this was an explicit
correction mid-build — the first version was a click-to-record chat box and
got rejected for not feeling like a real conversation):
- One big talk button that visibly cycles **idle → listening → thinking →
  speaking** (`STATE_LABEL` in the component), not a static mic icon.
- Separate **mute mic** button (🎙/🔇) — grays out the talk button.
- Separate **mute Arlo's voice** button (🔊/🔕) — TTS stops autoplaying but
  text answers still render.
- **■ Stop** button, shown only while there's something to stop — cancels
  an in-progress recording without sending it (`useVoiceRecorder`'s
  `cancel()`, distinct from `stop()` which sends), or cuts Arlo off
  mid-sentence (`useSpeaker`'s `stop()`).
- Text input still available as a fallback, tucked behind a "Type instead"
  toggle so voice is the default, not chat-first.

Routes to a different backend action depending on the active tab:
- **Festival Ops** → `fan:askGuide` with `mode: "ops"` — crowd density,
  understaffed-zone, and artist-status answers, phrased for crew (no fan
  fluff).
- **Fan Guide** → `fan:askGuide` with `mode: "fan"` — warm, fan-facing.
- **Show Console** → `actions:transcribeAndRoute` — the actual cascade
  logic, including the "keyboard player is out" intent.

Every reply plays back as speech via `actions:speak`. The last 6 turns *for
the currently active tab* are sent back into `askGuide`'s LLM fallback as
conversation history on each ask, so follow-ups on the same page stay
coherent (each tab's history is filtered separately when building that
context — asking about Main Stage on Ops then switching to Fan Guide won't
confuse the fan-mode answer with ops-mode context).

### 2. In-page Fan Guide chat (`ChatPanel` inside `src/FanGuide.tsx`)
Same `askGuide` action, `mode: "fan"`, its own separate mic button and
message history (does not share state with the global widget — different
component, different `useState`).

### 3. In-page Show Console panel (inside `src/App.tsx`)
"🎙 Talk to Arlo" button next to the existing scripted
"Simulate: keyboard player out" button. Same `transcribeAndRoute` action the
global widget uses on that tab.

### Shared voice plumbing
- `convex/openaiVoice.ts` — plain (non-Convex-function) helpers, server-only:
  - `transcribeAudio(audio: ArrayBuffer): Promise<string>` — Whisper
    (`whisper-1`).
  - `synthesizeSpeech(text: string): Promise<string | null>` — TTS
    (`tts-1`), voice **`nova`** (warm/friendly/female — changed from the
    original `onyx` per explicit request), returns base64 mp3 or null if no
    key / the call fails.
- `convex/actions.ts` — `transcribeAndRoute` (existing show cascade action)
  now calls the shared `transcribeAudio` instead of duplicating the Whisper
  call; new `speak` action wraps `synthesizeSpeech` for the client.
- `convex/fan.ts` — `askGuide` accepts `audio: v.bytes()` as an alternative
  to `question: v.string()`, transcribes first if audio is given.
- `src/useVoiceRecorder.ts` — two hooks:
  - `useVoiceRecorder()` — `MediaRecorder`-based mic capture. `start()`,
    `stop()` (resolves an `ArrayBuffer`, the "send" path), `cancel()` (stops
    and discards, the "stop" control), `recording`, `error`.
  - `useSpeaker()` — manages a single `<audio>` element for TTS playback.
    `speak(base64)`, `stop()`, `isSpeaking`, `muted`, `setMuted`. Used by
    the global widget AND both in-page panels (replaced an earlier
    fire-and-forget `playBase64Audio` free function that had no mute/stop
    capability — that function no longer exists).

### Verified how (read before assuming voice is broken)
Headless Chrome **cannot** grant real microphone permission, so an actual
human tapping the talk button and speaking out loud is the one thing that
has **not** been personally observed working end-to-end by an agent in this
repo's history. Everything else has been verified for real:
- Synthesized real speech audio via OpenAI TTS ("the keyboard player is
  out", "where's the nearest restroom"), sent the raw bytes through a real
  `ConvexHttpClient` (not the CLI — `npx convex run` does not accept plain
  base64 for `v.bytes()` args, you need an actual `ArrayBuffer` through the
  JS client) against the live cloud deployment, and got back correct
  transcriptions *and* correct results (the channel-count cascade actually
  ran; the restroom answer was correctly grounded).
- `actions:speak` confirmed returning real, valid mp3 bytes (`afinfo`
  confirmed a real mp3 container, 24kHz mono).
- `fan:askGuide`'s `mode: "ops"` keyword handlers (volunteer coverage,
  crowd density) tested directly with real festival data and returned
  correct, live numbers.
- Buttons confirmed rendering with no console errors on all three tabs, and
  on the actual Vercel production URL, via headless Chrome + puppeteer.

If a real user reports voice not working, start with: mic permission prompt
dismissed/denied, `MediaRecorder` mime type support in their browser
(`useVoiceRecorder` tries `audio/webm` then falls back to `audio/mp4`),
HTTPS/localhost requirement (satisfied on both Vercel prod and localhost —
`getUserMedia` refuses to work over plain HTTP on a non-localhost origin).

## Repo / deployment state

- **Local path:** `/Users/adnan/Documents/cue`
- **GitHub:** https://github.com/techadnank9/cue (pushed, `main` branch,
  connected to Vercel for auto-deploy on every push)
- **Vercel:** project `cue` under scope `mdadnan456gmailcoms-projects`.
  Production URL: **https://cue-psi-snowy.vercel.app**
- **Convex:** cloud deployment `useful-avocet-854`, team `mohammad-adnan`,
  project `cue`. Dashboard:
  https://dashboard.convex.dev/t/mohammad-adnan/cue/useful-avocet-854
  - Started on an **anonymous local** deployment
    (`anonymous:anonymous-cue`, 127.0.0.1:3210), then switched to this cloud
    one partway through: `npx convex dev --configure existing --team
    mohammad-adnan --project cue --dev-deployment cloud`. The old local env
    is backed up at `.env.local.bak-local` (gitignored, harmless, not a
    secret — it's an anonymous local deployment pointer).
  - Two background processes are expected for local dev: `npx convex dev`
    (watches `convex/`, pushes on save) and `npm run dev` (Vite,
    localhost:5173). See "How to resume" below.

### Env vars — where things live and why
- `OPENAI_API_KEY` — **Convex env var** (`npx convex env set
  OPENAI_API_KEY ...`), used only inside `convex/actions.ts`
  (`detectConflicts`, `transcribeAndRoute`, `speak`) and `convex/fan.ts`
  (`askGuide`), via the shared `convex/openaiVoice.ts` helpers. **Confirmed
  working** end-to-end — see the voice section above and the earlier
  `detectConflicts` LLM-fallback test.
- `JAMBASE_API_KEY` — **Convex env var**, set but **not used by any working
  code path**. See "JamBase" below — the key works against JamBase's MCP
  server (confirmed via raw HTTP JSON-RPC) but not their REST API, and
  `pollJamBase` in `convex/actions.ts` still calls the REST API and no-ops.
- `VITE_CONVEX_URL` / `VITE_CONVEX_SITE_URL` — not secrets, just tell the
  client which Convex deployment to talk to. Set as **Vercel env vars**
  (build-time, inlined by Vite) pointing at `useful-avocet-854`. Also in the
  local `.env.local` (gitignored, regenerated by `npx convex dev`).

## JamBase — partially understood, still not wired into the app

The original brief wanted `pollJamBase` (a Convex cron action in
`convex/actions.ts`) to poll the real JamBase API every 30s and surface
schedule changes automatically. Status:

- Two different `jbd_trial_...` trial keys were tried against
  `https://www.jambase.com/jb-api/v1/events` (JamBase's REST API) — both
  rejected with `api_key_invalid`.
- `https://data.jambase.com/v3/...` (the host named in the original
  `ARCHITECTURE.md` brief) is **not an API host** — it just serves
  JamBase's marketing website HTML.
- The keys ARE valid for **`https://mcp.jambase.com/mcp`, a JamBase MCP
  server** — confirmed directly with raw HTTP JSON-RPC (`curl` an
  `initialize` call, got a real `serverInfo` response; `tools/list` returned
  27 real tools: `searchEvents`, `searchFestivals`, `getEvent`, `getArtist`,
  etc.). This is NOT a REST API — it's the Model Context Protocol, meant for
  an LLM agent to call, not a typical `fetch()`-from-a-backend integration.
  The server was registered as a Claude Code MCP server (`claude mcp add
  --transport http jambase https://mcp.jambase.com/mcp --header
  "Authorization: Bearer <key>" -s local`) and shows "Connected" via
  `claude mcp list`, but its tools have inconsistently surfaced inside
  actual Claude Code sessions (worked in at least one session — see next
  point — but a `ToolSearch` for "jambase" in other sessions came back
  empty). Likely needs a fresh session per attempt; unclear why it's
  inconsistent.
- **A separate session DID successfully use it**: `convex/backstage.ts`'s
  seed data was updated (outside of any session documented in this file's
  prior revisions) to a real festival — "Musikfest — Bethlehem, PA",
  2026-07-31, with real headliners (Third Eye Blind, Train, "Weird Al"
  Yankovic) — with a code comment citing `jambase:16253409` and the
  `searchFestivals`/`getEvent` tools. So real JamBase data *has* made it
  into the app, just as a one-time seed, not a live poll.
- **Net effect on the running app:** `pollJamBase` still no-ops — it calls
  the REST API (which rejects the key) and checks for a `jambaseEventId` on
  the show that was never actually set to a real event id anyway. The
  **"Simulate: JamBase set shortened" button** in Show Console is what
  actually carries this part of any demo — it drives the exact same
  `ingestJamBaseEvent → ctx.scheduler.runAfter → detectConflicts →
  recomputeReadiness` chain a real poll would, just without the network
  call.
- **If you pick this up:** the real path forward is almost certainly
  rewriting `pollJamBase` to speak MCP JSON-RPC directly via `fetch()`
  (Convex actions have `fetch` and it's just HTTP POST + JSON — no special
  MCP client library needed, verified this works with plain `curl`), calling
  `tools/call` with `getEvent` for the real Musikfest event id, rather than
  hoping the JamBase Claude Code MCP server's tools consistently surface to
  an agent. That sidesteps the "does Convex support MCP" question entirely
  since it's just JSON-RPC over HTTP.

## What's fully done and verified

Verified live end-to-end (not just typechecked) — backend confirmed via
`npx convex run` / `ConvexHttpClient`, frontend confirmed via headless
Chrome + puppeteer clicking through the real UI, and finally confirmed on
the actual Vercel production URL:

- **Festival Ops**: real festival (Musikfest, Bethlehem PA) with 12 zones
  (3 gates, 2 stages, backstage, green room, FOH, 2 restrooms, 2 food/drink),
  simulated live crowd density via the `simulateCrowdTick` cron (every 5s,
  random-walked, pruned after 3 min), understaffed detection, one-click
  volunteer assignment, artist status advance, reset-to-seed.
- **Fan Guide**: lineup, restrooms, food/drink, in-page Ask Arlo chat — all
  deterministic paths tested (artist lookup, restroom, food, schedule,
  navigation); OpenAI LLM fallback tested directly and confirmed working.
- **Show Console**: readiness meter, flagship channel-capacity conflict,
  voice cascade (keyboard-player-out → 20→17 channels → readiness
  recompute), JamBase-shaped scripted trigger (not the real API, see
  above), task board, crew presence, reset-to-seed.
- **Real voice** (mic capture, Whisper STT, TTS playback) on all three
  surfaces plus the floating global widget — see the voice section above
  for exactly what was and wasn't verified.
- **Global voice widget** as a real call UI (talk/mute-mic/mute-voice/stop),
  not a chat box — confirmed rendering and functioning correctly on all
  three tabs and on production.
- **Arlo's voice** is `nova` (warm/friendly/female) — confirmed via a live
  TTS generation, real mp3 bytes verified with `afinfo`.
- Deployed and reachable at https://cue-psi-snowy.vercel.app, reading from
  the live Convex cloud deployment, auto-deploying on every push to `main`.

## What's NOT done / open threads

1. **JamBase real-time integration** — see above. Data got seeded once via
   MCP by some session; `pollJamBase` itself still doesn't work.
2. **`convex/_generated/` is committed to git** — normally gitignored build
   output, got committed in the initial commit before `.gitignore` excluded
   it. Harmless (regenerates automatically on `npx convex dev`), but worth a
   cleanup commit (`git rm -r --cached convex/_generated` + add to
   `.gitignore`) if it bothers you.
3. **No automated tests** — explicit instruction early in this build ("do
   not write test case... run it fast"). Nothing to pick up here unless
   asked for directly.
4. **Crowd data drifts unattended** — the cron runs continuously once the
   backend is live, so zones may show wildly overcrowded numbers by the
   time anyone looks. Hit "Reset demo" in Festival Ops before demoing.
5. **A real human has not been observed speaking to Arlo through an actual
   microphone** — see the voice-verification note above. The pipeline is
   proven end-to-end with real audio; a live mic tap by an actual person is
   the one remaining unknown.
6. **Explicitly out of scope per the original brief** (never attempted, by
   design, not a gap): mic plots, comms planner, pixel maps, PDF export,
   multi-tenant auth, the other eight conflict types beyond
   channel-capacity/schedule.

## How to resume a session on this

```bash
cd /Users/adnan/Documents/cue
npx convex dev &        # watches convex/, pushes to the cloud deployment
npm run dev &            # vite, localhost:5173
```
Both should point at the cloud deployment already (`.env.local` is set up).
If `.env.local` is missing/wrong, re-link with:
```bash
npx convex dev --configure existing --team mohammad-adnan --project cue --dev-deployment cloud --once
```

To redeploy the frontend to Vercel after a change:
```bash
git add -A && git commit -m "..." && git push   # auto-deploys via Vercel's GitHub integration
# or manually:
vercel --prod --scope mdadnan456gmailcoms-projects
```

To set/check Convex env vars:
```bash
npx convex env set OPENAI_API_KEY sk-...
npx convex env set JAMBASE_API_KEY jbd_trial_...
npx convex env list
```

To test a Convex action/query with real binary data (audio), the CLI
(`npx convex run`) does NOT accept plain base64 for `v.bytes()` args — use
the JS client instead:
```js
const { ConvexHttpClient } = require('convex/browser');
const client = new ConvexHttpClient('https://useful-avocet-854.convex.cloud');
const buf = fs.readFileSync('audio.mp3');
const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
await client.action('actions:transcribeAndRoute', { showId: '...', audio: arrayBuffer });
```

## Design notes (for anyone touching UI)

Dark road-gear palette, defined as CSS vars in `src/index.css`:
`--stage-black`, `--console-graphite`, `--gaff-silver`, `--house-amber`
(signature accent), `--cue-green` (ready/go only), `--fault-red`
(fault/critical only). Amber is the star; green/red are strictly semantic,
never decorative. Mono font for data/labels, condensed display font for the
readiness number and screen titles. Respect `prefers-reduced-motion`
(handled globally in `index.css`). Full brief in `README.md`.

For the voice widget specifically: it should read as a phone call, not a
chat app. If you're extending it, keep the state machine visible (the user
should always be able to tell at a glance whether Arlo is listening,
thinking, or talking) and keep mute/stop controls one tap away — that was
the explicit correction that produced the current design, don't regress to
a click-record-then-send text box.
