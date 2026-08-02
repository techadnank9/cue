// convex/schema.ts
// Cue — single Convex backend. Documents AND live state live here.
// Indexes are declared for the real access patterns used by the app.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // ---------- Document tables (the production docs Cue reads/writes) ----------

  shows: defineTable({
    name: v.string(),
    artist: v.string(),
    venue: v.string(),
    // Venue capability that conflicts are checked against:
    venueChannelCapacity: v.number(),
    jambaseEventId: v.optional(v.string()),
    date: v.string(),
  }),

  riders: defineTable({
    showId: v.id("shows"),
    requiredChannels: v.number(),
    bandMembers: v.array(
      v.object({
        name: v.string(),
        instrument: v.string(),
        // inputs this member needs, e.g. ["Kbd L", "Kbd R"]
        inputs: v.array(v.string()),
        available: v.boolean(),
      })
    ),
    backline: v.array(v.string()),
    notes: v.optional(v.string()),
  }).index("by_show", ["showId"]),

  patchLists: defineTable({
    showId: v.id("shows"),
    // channel number -> source label; null = open channel
    channels: v.array(
      v.object({
        channel: v.number(),
        source: v.union(v.string(), v.null()),
      })
    ),
  }).index("by_show", ["showId"]),

  stagePlots: defineTable({
    showId: v.id("shows"),
    elements: v.array(
      v.object({
        id: v.string(),
        label: v.string(),
        kind: v.string(), // "instrument" | "mic" | "monitor" | "di" | "riser"
        x: v.number(),
        y: v.number(),
      })
    ),
  }).index("by_show", ["showId"]),

  schedules: defineTable({
    showId: v.id("shows"),
    setLengthMinutes: v.number(),
    soundcheckStart: v.string(), // ISO time
    soundcheckDelayMinutes: v.number(),
    doors: v.string(),
    setStart: v.string(),
  }).index("by_show", ["showId"]),

  // ---------- Live-state tables (change second-to-second) ----------

  readiness: defineTable({
    showId: v.id("shows"),
    score: v.number(), // 0-100
    breakdown: v.array(
      v.object({ label: v.string(), delta: v.number() })
    ),
    updatedAt: v.number(),
  }).index("by_show", ["showId"]),

  issues: defineTable({
    showId: v.id("shows"),
    type: v.string(), // "channel_capacity" | "personnel" | "schedule" | ...
    severity: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
    title: v.string(),
    detail: v.string(),
    affectedDocs: v.array(v.string()),
    suggestedFix: v.optional(v.string()),
    // classification drives whether a fix can auto-apply
    fixClass: v.union(v.literal("safe"), v.literal("approval")),
    status: v.union(
      v.literal("open"),
      v.literal("approved"),
      v.literal("applied"),
      v.literal("dismissed")
    ),
    createdAt: v.number(),
  })
    .index("by_show", ["showId"])
    .index("by_show_status", ["showId", "status"]),

  tasks: defineTable({
    showId: v.id("shows"),
    title: v.string(),
    owner: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("done")
    ),
    issueId: v.optional(v.id("issues")),
  })
    .index("by_show", ["showId"])
    .index("by_show_status", ["showId", "status"]),

  approvals: defineTable({
    showId: v.id("shows"),
    issueId: v.id("issues"),
    description: v.string(),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    createdAt: v.number(),
  }).index("by_show", ["showId"]),

  voiceLog: defineTable({
    showId: v.id("shows"),
    speaker: v.union(v.literal("crew"), v.literal("arlo")),
    text: v.string(),
    at: v.number(),
  }).index("by_show", ["showId"]),

  presence: defineTable({
    showId: v.id("shows"),
    name: v.string(),
    role: v.string(),
    lastSeen: v.number(),
  })
    .index("by_show", ["showId"])
    .index("by_show_name", ["showId", "name"]),

  // ---------- Backstage ops platform ----------
  // A festival-wide view: who's arriving, where the crowd is, where
  // volunteers are needed. Positioned on a map (x/y are 0-100 percent).

  festivals: defineTable({
    name: v.string(),
    date: v.string(),
  }),

  zones: defineTable({
    festivalId: v.id("festivals"),
    name: v.string(),
    kind: v.union(
      v.literal("entry"),
      v.literal("stage"),
      v.literal("backstage"),
      v.literal("green_room"),
      v.literal("foh"),
      v.literal("restroom"),
      v.literal("food_drink")
    ),
    x: v.number(), // 0-100, fallback map position when no real geo is set
    y: v.number(),
    // Real GPS coordinates within the venue, when known — drives the real
    // map view instead of the abstract grid.
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    capacity: v.number(),
  }).index("by_festival", ["festivalId"]),

  crowdReadings: defineTable({
    zoneId: v.id("zones"),
    festivalId: v.id("festivals"),
    count: v.number(),
    at: v.number(),
  })
    .index("by_zone", ["zoneId"])
    .index("by_festival", ["festivalId"]),

  lineupArtists: defineTable({
    festivalId: v.id("festivals"),
    name: v.string(),
    stageZoneId: v.id("zones"),
    entryZoneId: v.id("zones"),
    setTime: v.string(), // ISO
    status: v.union(
      v.literal("not_arrived"),
      v.literal("arrived"),
      v.literal("soundcheck"),
      v.literal("ready")
    ),
  }).index("by_festival", ["festivalId"]),

  volunteers: defineTable({
    festivalId: v.id("festivals"),
    name: v.string(),
    zoneId: v.optional(v.id("zones")),
    status: v.union(v.literal("available"), v.literal("assigned")),
  }).index("by_festival", ["festivalId"]),

  // ---------- Real-world events index ----------
  // A snapshot of real festivals pulled from the JamBase MCP server (agent
  // session only — not callable from a deployed Convex function, see
  // HANDOFF.md). Refreshed manually by re-running the seed with fresh MCP
  // results; not a live poll. Drives the "choose an event" queue screen.

  festivalEvents: defineTable({
    jambaseId: v.string(),
    name: v.string(),
    startDate: v.string(), // ISO date
    venueName: v.string(),
    city: v.string(),
    region: v.optional(v.string()),
    country: v.string(),
    latitude: v.number(),
    longitude: v.number(),
    headliners: v.array(v.string()),
    jambaseUrl: v.string(),
    heroImage: v.optional(v.string()),
    // The one event with a full ops experience wired up (Festival Ops seed).
    hasOpsExperience: v.boolean(),
  }).index("by_jambaseId", ["jambaseId"]),
});
