// convex/queries.ts
// All reactive. Clients subscribe to these; no polling anywhere.

import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Live readiness score for a show. The signature meter subscribes here.
export const getReadiness = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    return await ctx.db
      .query("readiness")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
  },
});

// Open issues, newest first. The issue list spine subscribes here.
export const listIssues = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    const rows = await ctx.db
      .query("issues")
      .withIndex("by_show_status", (q) =>
        q.eq("showId", showId).eq("status", "open")
      )
      .collect();
    return rows.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const listTasks = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    return await ctx.db
      .query("tasks")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .collect();
  },
});

// Crew members active in the last 30s. Reactive — no polling.
export const listPresence = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    const rows = await ctx.db
      .query("presence")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .collect();
    const cutoff = Date.now() - 30_000;
    return rows.filter((r) => r.lastSeen >= cutoff);
  },
});

export const listVoiceLog = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    const rows = await ctx.db
      .query("voiceLog")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .collect();
    return rows.sort((a, b) => b.at - a.at).slice(0, 20);
  },
});

export const getRider = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    return await ctx.db
      .query("riders")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
  },
});

export const getPatchList = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    return await ctx.db
      .query("patchLists")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
  },
});

export const getSchedule = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    return await ctx.db
      .query("schedules")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
  },
});

// One call the top bar uses to render the whole show state live.
export const getShowState = query({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    const show = await ctx.db.get(showId);
    const readiness = await ctx.db
      .query("readiness")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    const openIssues = await ctx.db
      .query("issues")
      .withIndex("by_show_status", (q) =>
        q.eq("showId", showId).eq("status", "open")
      )
      .collect();
    return { show, readiness, openIssues };
  },
});

// The first (only) show — the client boots straight into the demo show.
export const getDemoShow = query({
  args: {},
  handler: async (ctx) => {
    const shows = await ctx.db.query("shows").collect();
    return shows[0] ?? null;
  },
});

// ---------- internal-only helpers used by actions ----------

export const getShowContext = internalQuery({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    const show = await ctx.db.get(showId);
    const rider = await ctx.db
      .query("riders")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    const schedule = await ctx.db
      .query("schedules")
      .withIndex("by_show", (q) => q.eq("showId", showId))
      .unique();
    const openIssues = await ctx.db
      .query("issues")
      .withIndex("by_show_status", (q) =>
        q.eq("showId", showId).eq("status", "open")
      )
      .collect();
    return { show, rider, schedule, openIssues };
  },
});

export const getDemoShowId = internalQuery({
  args: {},
  handler: async (ctx) => {
    const shows = await ctx.db.query("shows").collect();
    return shows[0]?._id ?? null;
  },
});

export const getShowInternal = internalQuery({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => ctx.db.get(showId),
});
