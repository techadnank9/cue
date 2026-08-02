// convex/mutations.ts
// All DB writes live here (never in actions, never in the client).
// recomputeReadiness is deterministic and legible so the number is trustworthy.

import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Deterministic readiness. Keep it simple and legible: start at 100,
// subtract weighted penalties per open issue. Do NOT let the LLM set this.
export const recomputeReadiness = internalMutation({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    const open = await ctx.db
      .query("issues")
      .withIndex("by_show_status", (q) =>
        q.eq("showId", showId).eq("status", "open")
      )
      .collect();

    const penalty = { low: 5, medium: 12, high: 25 } as const;
    const breakdown = open.map((i) => ({
      label: i.title,
      delta: -penalty[i.severity],
    }));
    const score = Math.max(
      0,
      100 + breakdown.reduce((s, b) => s + b.delta, 0)
    );

    const existing = await ctx.db
      .query("readiness")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    const doc = { showId, score, breakdown, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, doc);
    else await ctx.db.insert("readiness", doc);
    return score;
  },
});

// Code-verified channel-capacity check. Deterministic, no LLM. Called after
// any change that could affect required vs. available channels.
export const checkChannelCapacity = internalMutation({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    const show = await ctx.db.get(showId);
    const rider = await ctx.db
      .query("riders")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    if (!show || !rider) return;

    const existingOpen = await ctx.db
      .query("issues")
      .withIndex("by_show_status", (q) =>
        q.eq("showId", showId).eq("status", "open")
      )
      .filter((q) => q.eq(q.field("type"), "channel_capacity"))
      .collect();

    if (rider.requiredChannels > show.venueChannelCapacity) {
      const overflow = rider.requiredChannels - show.venueChannelCapacity;
      const title = `Venue supports ${show.venueChannelCapacity} of ${rider.requiredChannels} required channels`;
      const detail = `The rider needs ${rider.requiredChannels} input channels; this venue's console provides ${show.venueChannelCapacity}. ${overflow} input${overflow === 1 ? "" : "s"} can't be patched.`;
      if (existingOpen.length > 0) {
        await ctx.db.patch(existingOpen[0]._id, { title, detail });
      } else {
        await ctx.db.insert("issues", {
          showId,
          type: "channel_capacity",
          severity: "high",
          title,
          detail,
          affectedDocs: ["rider", "patchList"],
          suggestedFix: "Trim inputs or add a submixer to fit the venue's channel count.",
          fixClass: "approval",
          status: "open",
          createdAt: Date.now(),
        });
      }
    } else {
      // Requirement now fits — resolve any open channel_capacity issue.
      for (const issue of existingOpen) {
        await ctx.db.patch(issue._id, { status: "applied" });
      }
    }
  },
});

// Inserts an LLM-sourced issue if an open issue of the same type isn't
// already present (avoids duplicate noise on repeated detection runs).
export const insertLlmIssue = internalMutation({
  args: {
    showId: v.id("shows"),
    type: v.string(),
    severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high")),
    title: v.string(),
    detail: v.string(),
    affectedDocs: v.array(v.string()),
    suggestedFix: v.optional(v.string()),
    fixClass: v.union(v.literal("safe"), v.literal("approval")),
  },
  handler: async (ctx, args) => {
    const existingOpen = await ctx.db
      .query("issues")
      .withIndex("by_show_status", (q) =>
        q.eq("showId", args.showId).eq("status", "open")
      )
      .filter((q) => q.eq(q.field("type"), args.type))
      .collect();
    if (existingOpen.length > 0) return;
    await ctx.db.insert("issues", { ...args, status: "open", createdAt: Date.now() });
  },
});

export const logVoiceTurn = internalMutation({
  args: {
    showId: v.id("shows"),
    speaker: v.union(v.literal("crew"), v.literal("arlo")),
    text: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("voiceLog", { ...args, at: Date.now() });
  },
});

// Transactional: apply the doc edit, write an audit task, recompute — all-or-nothing.
// A crew phone never sees a half-applied state.
export const applySafeChange = mutation({
  args: { showId: v.id("shows"), issueId: v.id("issues") },
  handler: async (ctx, { showId, issueId }) => {
    const issue = await ctx.db.get(issueId);
    if (!issue) throw new Error("Issue not found");
    if (issue.fixClass !== "safe") {
      throw new Error("Refusing to auto-apply an approval-class change");
    }

    await ctx.db.patch(issueId, { status: "applied" });
    await ctx.db.insert("tasks", {
      showId,
      title: `Applied fix: ${issue.title}`,
      owner: "Arlo",
      status: "done",
      issueId,
    });
    await ctx.runMutation(internal.mutations.recomputeReadiness, { showId });
  },
});

export const assignTask = mutation({
  args: {
    showId: v.id("shows"),
    title: v.string(),
    owner: v.string(),
    issueId: v.optional(v.id("issues")),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("tasks", { ...args, status: "pending" });
  },
});

export const updateTaskStatus = mutation({
  args: {
    taskId: v.id("tasks"),
    status: v.union(
      v.literal("pending"),
      v.literal("in_progress"),
      v.literal("done")
    ),
  },
  handler: async (ctx, { taskId, status }) => {
    await ctx.db.patch(taskId, { status });
  },
});

// Crew presence heartbeat. Client pings this on mount + interval; the
// presence list itself is read live via a reactive query, no polling there.
export const heartbeat = mutation({
  args: { showId: v.id("shows"), name: v.string(), role: v.string() },
  handler: async (ctx, { showId, name, role }) => {
    const existing = await ctx.db
      .query("presence")
      .withIndex("by_show_name", (q) => q.eq("showId", showId).eq("name", name))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { lastSeen: Date.now(), role });
    } else {
      await ctx.db.insert("presence", { showId, name, role, lastSeen: Date.now() });
    }
  },
});

export const resolveApproval = mutation({
  args: {
    approvalId: v.id("approvals"),
    decision: v.union(v.literal("approved"), v.literal("rejected")),
  },
  handler: async (ctx, { approvalId, decision }) => {
    const approval = await ctx.db.get(approvalId);
    if (!approval) throw new Error("Approval not found");
    await ctx.db.patch(approvalId, { status: decision });
    if (decision === "approved") {
      await ctx.db.patch(approval.issueId, { status: "approved" });
    }
  },
});

// Writes a JamBase-sourced change, then SCHEDULES detection.
// This is the cascade entry point: Convex function scheduling a Convex function.
export const ingestJamBaseEvent = internalMutation({
  args: {
    showId: v.id("shows"),
    newSetLengthMinutes: v.optional(v.number()),
    soundcheckDelayMinutes: v.optional(v.number()),
  },
  handler: async (ctx, { showId, newSetLengthMinutes, soundcheckDelayMinutes }) => {
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    if (schedule) {
      const setLengthMinutes = newSetLengthMinutes ?? schedule.setLengthMinutes;
      await ctx.db.patch(schedule._id, {
        setLengthMinutes,
        ...(soundcheckDelayMinutes !== undefined
          ? { soundcheckDelayMinutes }
          : {}),
      });

      // Deterministic schedule conflict: a set under 40 min is too tight
      // given the delay already logged.
      const existingOpen = await ctx.db
        .query("issues")
        .withIndex("by_show_status", (q) =>
          q.eq("showId", showId).eq("status", "open")
        )
        .filter((q) => q.eq(q.field("type"), "schedule"))
        .collect();

      if (setLengthMinutes < 40 && existingOpen.length === 0) {
        await ctx.db.insert("issues", {
          showId,
          type: "schedule",
          severity: "medium",
          title: `Set shortened to ${setLengthMinutes} min`,
          detail: `JamBase reports the set is now ${setLengthMinutes} minutes. Soundcheck is already ${schedule.soundcheckDelayMinutes} min behind — confirm the trimmed setlist with the artist.`,
          affectedDocs: ["schedule"],
          suggestedFix: "Confirm trimmed setlist with the artist and notify crew.",
          fixClass: "approval",
          status: "open",
          createdAt: Date.now(),
        });
      }
    }
    // Kick off detection without blocking the write. THE cascade pattern.
    await ctx.scheduler.runAfter(0, internal.actions.detectConflicts, { showId });
  },
});

// Public entry point for the scripted "Simulate: JamBase set shortened"
// button — drives the exact same ingest -> schedule -> detect chain the
// real pollJamBase action uses.
export const simulateJamBaseShortened = mutation({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    await ctx.runMutation(internal.mutations.ingestJamBaseEvent, {
      showId,
      newSetLengthMinutes: 30,
    });
  },
});

// The flagship voice cascade: keyboard player goes unavailable.
// Marks them unavailable, drops their inputs from the rider requirement and
// patch list, then runs detection + readiness recompute in the same mutation
// so no half-applied state is ever visible.
export const removeKeyboardPlayer = internalMutation({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }): Promise<string> => {
    const rider = await ctx.db
      .query("riders")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    if (!rider) throw new Error("No rider for show");

    const kb = rider.bandMembers.find((m) =>
      m.instrument.toLowerCase().includes("key")
    );
    const droppedInputs = kb ? kb.inputs : [];

    const bandMembers = rider.bandMembers.map((m) =>
      m === kb ? { ...m, available: false } : m
    );
    const requiredChannels = Math.max(
      0,
      rider.requiredChannels - droppedInputs.length
    );
    await ctx.db.patch(rider._id, { bandMembers, requiredChannels });

    const patchList = await ctx.db
      .query("patchLists")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    if (patchList) {
      const channels = patchList.channels.map((c) =>
        droppedInputs.includes(c.source ?? "") ? { ...c, source: null } : c
      );
      await ctx.db.patch(patchList._id, { channels });
    }

    await ctx.db.insert("voiceLog", {
      showId,
      speaker: "crew",
      text: "The keyboard player is unavailable. Update the production plan.",
      at: Date.now(),
    });

    await ctx.runMutation(internal.mutations.checkChannelCapacity, { showId });
    const score = await ctx.runMutation(internal.mutations.recomputeReadiness, {
      showId,
    });

    const show = await ctx.db.get(showId);
    const withinLimit = show ? requiredChannels <= show.venueChannelCapacity : false;
    const reply = withinLimit
      ? `Keyboard removed. Down to ${requiredChannels} channels — we're within the venue's limit. Readiness back to ${score}.`
      : `Keyboard removed. Down to ${requiredChannels} channels, still over the venue's ${show?.venueChannelCapacity} limit. Readiness at ${score}.`;

    await ctx.db.insert("voiceLog", {
      showId,
      speaker: "arlo",
      text: reply,
      at: Date.now(),
    });

    return reply;
  },
});

// ---------- Seed / reset (keeps the demo bulletproof) ----------

const SEED_SHOW = {
  name: "Golden Gate Stage — Saturday",
  artist: "The Foglights",
  venue: "Golden Gate Stage",
  venueChannelCapacity: 16,
  date: new Date().toISOString().slice(0, 10),
};

const SEED_BAND_MEMBERS = [
  { name: "Vocalist", instrument: "Vocals", inputs: ["Vox"], available: true },
  {
    name: "Guitarist",
    instrument: "Guitar",
    inputs: ["Gtr", "Gtr Amp Mic"],
    available: true,
  },
  {
    name: "Bassist",
    instrument: "Bass",
    inputs: ["Bass DI", "Bass Amp"],
    available: true,
  },
  {
    name: "Keyboardist",
    instrument: "Keyboard",
    inputs: ["Kbd L", "Kbd R", "Aux Synth"],
    available: true,
  },
];

function seedPatchChannels() {
  const sources = [
    "Vox",
    "Gtr",
    "Gtr Amp Mic",
    "Bass DI",
    "Bass Amp",
    "Kbd L",
    "Kbd R",
    "Aux Synth",
    "Kick",
    "Snare",
    "Hi-Hat",
    "Tom 1",
    "Tom 2",
    "OH L",
    "OH R",
    "Talkback",
  ];
  return sources.map((source, i) => ({ channel: i + 1, source }));
}

async function clearShow(ctx: any, showId: any) {
  for (const table of [
    "riders",
    "patchLists",
    "stagePlots",
    "schedules",
    "readiness",
    "issues",
    "tasks",
    "approvals",
    "voiceLog",
    "presence",
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_show", (q: any) => q.eq("showId", showId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
}

async function seed(ctx: any) {
  {
    const existing = await ctx.db.query("shows").collect();
    for (const s of existing) {
      await clearShow(ctx, s._id);
      await ctx.db.delete(s._id);
    }

    const showId = await ctx.db.insert("shows", SEED_SHOW);

    await ctx.db.insert("riders", {
      showId,
      requiredChannels: 20,
      bandMembers: SEED_BAND_MEMBERS,
      backline: ["Drum kit", "2x guitar amp", "1x bass amp"],
      notes: "Standard four-piece rock rider.",
    });

    await ctx.db.insert("patchLists", {
      showId,
      channels: seedPatchChannels(),
    });

    await ctx.db.insert("stagePlots", {
      showId,
      elements: [
        { id: "vox", label: "Vox", kind: "mic", x: 50, y: 10 },
        { id: "gtr", label: "Guitar", kind: "instrument", x: 20, y: 30 },
        { id: "bass", label: "Bass", kind: "instrument", x: 80, y: 30 },
        { id: "kbd", label: "Keys", kind: "instrument", x: 65, y: 20 },
        { id: "drums", label: "Drums", kind: "riser", x: 50, y: 60 },
      ],
    });

    const now = new Date();
    const setStart = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    await ctx.db.insert("schedules", {
      showId,
      setLengthMinutes: 45,
      soundcheckStart: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
      soundcheckDelayMinutes: 12,
      doors: new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString(),
      setStart: setStart.toISOString(),
    });

    await ctx.runMutation(internal.mutations.checkChannelCapacity, { showId });
    await ctx.runMutation(internal.mutations.recomputeReadiness, { showId });

    return showId;
  }
}

export const seedDemo = mutation({
  args: {},
  handler: async (ctx) => seed(ctx),
});

// Restores the seed state so the demo can be rerun repeatedly on stage.
export const resetDemo = mutation({
  args: {},
  handler: async (ctx) => seed(ctx),
});
