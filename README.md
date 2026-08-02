# Cue

**A live festival operations platform powered by Arlo, a context-aware voice agent.**

Cue connects festival organizers, production teams, and attendees through one live data layer. Arlo understands who is asking, what part of the festival they are using, and what information they are allowed to access.

**Live Demo:** https://cue-psi-snowy.vercel.app

---

## What Cue Does

Festivals depend on multiple groups that usually work with disconnected information:

- Organizers monitor crowds, gates, volunteers, artists, and incidents.
- Production teams manage show readiness, equipment, schedules, and crew tasks.
- Fans need accurate schedules, directions, amenities, and real-time updates.

Cue brings these workflows together using Convex as a shared, reactive backend and Arlo as the voice interface.

Tap the microphone and ask:

- **Arlo Crew:** “Which zones need more volunteers?”
- **Arlo Fan:** “When should I leave for the next artist?”
- **Show Operations:** “The keyboard player is unavailable. What needs to change?”

Arlo responds using the live data already visible inside Cue.

---

## Product Experiences

### Arlo Crew

The private operations experience for organizers, stage managers, production teams, and authorized festival staff.

Arlo Crew includes:

- Live crowd-density monitoring
- Gate and zone status
- Volunteer allocation
- Artist arrival and performance status
- Show-readiness scoring
- Production conflicts
- Crew tasks and presence
- Operational voice commands
- Human approval for sensitive changes

Organizers can ask questions such as:

> “Which areas need attention right now?”

> “Entrance A is crowded and the artist arrives in 15 minutes. What should we do?”

> “Lighting rig two is not responding. Give me a recovery plan.”

---

### Arlo Fan

The attendee-facing festival guide.

Arlo Fan provides:

- Artist schedules
- Current and upcoming performances
- Public artist-status updates
- Food and drink locations
- Restroom and water information
- Crowd-aware guidance
- Suggested departure times
- Text and voice questions
- Spoken Arlo responses

Fans can ask:

> “Where is the nearest water station?”

> “Which route should I take to the next stage?”

> “When should I arrive if I want to get closer to the front?”

> “Is the artist delayed?”

Arlo Fan does not expose backstage routes, crew tasks, security plans, production documents, or organizer controls.

---

## Meet Arlo

Arlo is not a generic chatbot added to the side of the application. Arlo is a voice-first interface connected directly to Cue’s live data.

### Real voice interaction

Arlo supports:

- Browser microphone capture using `MediaRecorder`
- Speech-to-text using OpenAI Whisper
- Context-aware reasoning
- Spoken responses using OpenAI text-to-speech
- Listening, thinking, and speaking states
- Mute and stop controls
- Text input as a fallback

### Context-aware responses

Arlo responds differently depending on the active experience:

- **Arlo Crew:** crowd conditions, staffing, artists, production risks, and operational actions
- **Arlo Fan:** schedules, amenities, routes, public updates, and attendee guidance
- **Show operations:** patch lists, readiness, schedules, tasks, and recovery workflows

### Conversation memory

Recent messages from the active experience are included as context, allowing users to ask follow-up questions without repeating the full situation.

### Grounded answers

Arlo uses live Convex data as its source of truth.

Common requests use deterministic logic when possible. OpenAI reasoning is used for open-ended questions and summaries while remaining grounded in the same festival and production data.

---

## Example Production Scenario

A show is scheduled with:

- 20 required audio channels
- A venue limit of 16 channels
- A keyboard setup using four channels
- A 45-minute performance plan

The keyboard player becomes unavailable and the performance slot is reduced to 30 minutes.

The production manager tells Arlo:

> “The keyboard player is out, and our set is now 30 minutes. Are we ready?”

Arlo can:

1. Detect that the patch list is outdated
2. Remove the unused keyboard channels
3. Recalculate channel capacity
4. Flag the outdated stage setup
5. Identify the schedule conflict
6. Propose a recovery plan
7. Update the readiness score
8. Synchronize approved changes across connected screens

---

## Safe Changes and Human Approval

Every proposed production change includes a `fixClass`.

### Safe

Reversible changes with no artist-facing or financial impact.

Examples:

- Removing obsolete patch-list entries
- Recalculating timing
- Synchronizing approved data
- Updating internal readiness status

### Approval Required

Changes affecting artists, personnel, cost, safety, or public communication.

Examples:

- Shortening a performance
- Changing artist routes
- Modifying personnel assignments
- Sending festival-wide updates
- Restricting or redirecting gate access

The backend rejects approval-class changes when they are submitted through the safe-change workflow.

---

## Why Convex

Cue uses Convex as both the backend and the real-time coordination engine.

### Reactive data

Every major screen subscribes directly to Convex queries.

When a mutation changes crowd density, artist status, readiness, tasks, or production issues, connected interfaces update automatically without polling.

### Actions and mutations

External calls and reasoning happen inside Convex actions.

Database writes happen inside Convex mutations.

Examples include:

- `transcribeAndRoute`
- `askGuide`
- `speak`
- `detectConflicts`
- `applySafeChange`
- `assignVolunteer`
- `updateArtistStatus`

### Scheduled activity

Convex scheduled functions and crons simulate or ingest live event changes.

Examples:

- Crowd-density updates
- Artist and schedule updates
- Conflict detection after an event change

### Validation

Convex functions use validated arguments and typed schemas. OpenAI and JamBase credentials remain server-side through Convex environment variables.

---

## Architecture

```text
OpenAI Whisper / Chat / TTS ──────┐
JamBase artist and event data ────┤
Microphone or text input ─────────┘
                                  │
                                  ▼
                          Convex Actions
                     transcription and reasoning
                                  │
                                  ▼
                         Convex Mutations
                       transactional state updates
                                  │
                                  ▼
                          Convex Database
                                  │
                                  ▼
                         Reactive Queries
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
             Arlo Crew                        Arlo Fan
       private operations data          public attendee guidance
