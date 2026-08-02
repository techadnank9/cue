// convex/backstage.ts
// The backstage-ops platform: festival-wide artist lineup, entry points,
// live crowd density per zone, and volunteer allocation. Crowd density is a
// simulated live feed (crons.ts drives simulateCrowdTick) so the map moves
// on its own, same pattern as pollJamBase driving the show-conflict cascade.

import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ---------- Reactive reads ----------

export const getFestival = query({
  args: {},
  handler: async (ctx) => {
    const festivals = await ctx.db.query("festivals").collect();
    return festivals[0] ?? null;
  },
});

function densityLevel(count: number, capacity: number): "low" | "medium" | "high" | "critical" {
  const ratio = capacity > 0 ? count / capacity : 0;
  if (ratio >= 1) return "critical";
  if (ratio >= 0.75) return "high";
  if (ratio >= 0.4) return "medium";
  return "low";
}

// Zones joined with their latest crowd reading and volunteer coverage.
// The map + the "needs volunteers" panel both subscribe here.
export const listZoneStatus = query({
  args: { festivalId: v.id("festivals") },
  handler: async (ctx, { festivalId }) => {
    const zones = await ctx.db
      .query("zones")
      .withIndex("by_festival", (q) => q.eq("festivalId", festivalId))
      .collect();
    const volunteers = await ctx.db
      .query("volunteers")
      .withIndex("by_festival", (q) => q.eq("festivalId", festivalId))
      .collect();

    const results = await Promise.all(
      zones.map(async (zone) => {
        const latest = await ctx.db
          .query("crowdReadings")
          .withIndex("by_zone", (q) => q.eq("zoneId", zone._id))
          .order("desc")
          .first();
        const count = latest?.count ?? 0;
        const level = densityLevel(count, zone.capacity);
        const assigned = volunteers.filter((v) => v.zoneId === zone._id).length;
        const ratio = zone.capacity > 0 ? count / zone.capacity : 0;
        const needed =
          Math.ceil(zone.capacity / 40) + (level === "critical" ? 2 : level === "high" ? 1 : 0);
        return {
          ...zone,
          count,
          level,
          ratio,
          assignedVolunteers: assigned,
          neededVolunteers: needed,
          understaffed: assigned < needed,
        };
      })
    );
    return results.sort((a, b) => b.ratio - a.ratio);
  },
});

export const listArtists = query({
  args: { festivalId: v.id("festivals") },
  handler: async (ctx, { festivalId }) => {
    const artists = await ctx.db
      .query("lineupArtists")
      .withIndex("by_festival", (q) => q.eq("festivalId", festivalId))
      .collect();
    const zones = await ctx.db
      .query("zones")
      .withIndex("by_festival", (q) => q.eq("festivalId", festivalId))
      .collect();
    const zoneById = new Map(zones.map((z) => [z._id, z]));
    return artists
      .map((a) => ({
        ...a,
        stageName: zoneById.get(a.stageZoneId)?.name ?? "—",
        entryName: zoneById.get(a.entryZoneId)?.name ?? "—",
      }))
      .sort((a, b) => a.setTime.localeCompare(b.setTime));
  },
});

export const listVolunteers = query({
  args: { festivalId: v.id("festivals") },
  handler: async (ctx, { festivalId }) => {
    const volunteers = await ctx.db
      .query("volunteers")
      .withIndex("by_festival", (q) => q.eq("festivalId", festivalId))
      .collect();
    const zones = await ctx.db
      .query("zones")
      .withIndex("by_festival", (q) => q.eq("festivalId", festivalId))
      .collect();
    const zoneById = new Map(zones.map((z) => [z._id, z]));
    return volunteers.map((v) => ({
      ...v,
      zoneName: v.zoneId ? zoneById.get(v.zoneId)?.name ?? "—" : null,
    }));
  },
});

// ---------- Writes ----------

export const assignVolunteer = mutation({
  args: { volunteerId: v.id("volunteers"), zoneId: v.id("zones") },
  handler: async (ctx, { volunteerId, zoneId }) => {
    await ctx.db.patch(volunteerId, { zoneId, status: "assigned" });
  },
});

export const unassignVolunteer = mutation({
  args: { volunteerId: v.id("volunteers") },
  handler: async (ctx, { volunteerId }) => {
    await ctx.db.patch(volunteerId, { zoneId: undefined, status: "available" });
  },
});

export const updateArtistStatus = mutation({
  args: {
    artistId: v.id("lineupArtists"),
    status: v.union(
      v.literal("not_arrived"),
      v.literal("arrived"),
      v.literal("soundcheck"),
      v.literal("ready")
    ),
  },
  handler: async (ctx, { artistId, status }) => {
    await ctx.db.patch(artistId, { status });
  },
});

// Simulated live crowd feed. Runs on a Convex cron (see crons.ts) so the
// map moves on its own, the same "world changes without a button" pattern
// as pollJamBase. Random-walks each zone's count and prunes old readings.
export const simulateCrowdTick = internalMutation({
  args: {},
  handler: async (ctx) => {
    const festivals = await ctx.db.query("festivals").collect();
    for (const festival of festivals) {
      const zones = await ctx.db
        .query("zones")
        .withIndex("by_festival", (q) => q.eq("festivalId", festival._id))
        .collect();
      for (const zone of zones) {
        const latest = await ctx.db
          .query("crowdReadings")
          .withIndex("by_zone", (q) => q.eq("zoneId", zone._id))
          .order("desc")
          .first();
        const prev = latest?.count ?? Math.round(zone.capacity * 0.3);
        const drift = Math.round((Math.random() - 0.45) * zone.capacity * 0.18);
        const next = Math.max(0, Math.min(Math.round(zone.capacity * 1.3), prev + drift));
        await ctx.db.insert("crowdReadings", {
          zoneId: zone._id,
          festivalId: festival._id,
          count: next,
          at: Date.now(),
        });

        // Prune readings older than 3 minutes so this table doesn't grow
        // unbounded during a long-running demo.
        const cutoff = Date.now() - 3 * 60_000;
        const old = await ctx.db
          .query("crowdReadings")
          .withIndex("by_zone", (q) => q.eq("zoneId", zone._id))
          .filter((q) => q.lt(q.field("at"), cutoff))
          .collect();
        for (const row of old) await ctx.db.delete(row._id);
      }
    }
  },
});

// ---------- Seed / reset ----------

async function clearFestival(ctx: any, festivalId: Id<"festivals">) {
  for (const table of ["zones", "lineupArtists", "volunteers"] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex("by_festival", (q: any) => q.eq("festivalId", festivalId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  }
  const readings = await ctx.db
    .query("crowdReadings")
    .withIndex("by_festival", (q: any) => q.eq("festivalId", festivalId))
    .collect();
  for (const row of readings) await ctx.db.delete(row._id);
}

async function seed(ctx: any) {
  const existing = await ctx.db.query("festivals").collect();
  for (const f of existing) {
    await clearFestival(ctx, f._id);
    await ctx.db.delete(f._id);
  }

  const festivalId = await ctx.db.insert("festivals", {
    name: "Golden Gate Stage — Saturday",
    date: new Date().toISOString().slice(0, 10),
  });

  const zoneDefs = [
    { name: "Main Gate", kind: "entry" as const, x: 50, y: 84, capacity: 400 },
    { name: "West Gate", kind: "entry" as const, x: 14, y: 66, capacity: 220 },
    { name: "East Gate", kind: "entry" as const, x: 86, y: 66, capacity: 220 },
    { name: "Main Stage", kind: "stage" as const, x: 50, y: 34, capacity: 600 },
    { name: "Second Stage", kind: "stage" as const, x: 22, y: 26, capacity: 300 },
    { name: "Backstage", kind: "backstage" as const, x: 78, y: 24, capacity: 80 },
    { name: "Green Room", kind: "green_room" as const, x: 78, y: 12, capacity: 30 },
    { name: "FOH / Mix", kind: "foh" as const, x: 50, y: 56, capacity: 25 },
    { name: "Restrooms — North", kind: "restroom" as const, x: 34, y: 46, capacity: 40 },
    { name: "Restrooms — South", kind: "restroom" as const, x: 66, y: 78, capacity: 40 },
    { name: "Food Court", kind: "food_drink" as const, x: 14, y: 46, capacity: 150 },
    { name: "Bar & Drinks", kind: "food_drink" as const, x: 86, y: 46, capacity: 100 },
  ];
  const zoneIds: Record<string, Id<"zones">> = {};
  for (const z of zoneDefs) {
    const id = await ctx.db.insert("zones", { festivalId, ...z });
    zoneIds[z.name] = id;
    await ctx.db.insert("crowdReadings", {
      zoneId: id,
      festivalId,
      count: Math.round(z.capacity * (0.3 + Math.random() * 0.3)),
      at: Date.now(),
    });
  }

  const now = new Date();
  const setTime = (offsetMin: number) =>
    new Date(now.getTime() + offsetMin * 60_000).toISOString();

  const artistDefs = [
    {
      name: "The Foglights",
      stageZoneId: zoneIds["Main Stage"],
      entryZoneId: zoneIds["Main Gate"],
      setTime: setTime(90),
      status: "soundcheck" as const,
    },
    {
      name: "Coastal Static",
      stageZoneId: zoneIds["Second Stage"],
      entryZoneId: zoneIds["West Gate"],
      setTime: setTime(30),
      status: "arrived" as const,
    },
    {
      name: "Nine Rivers",
      stageZoneId: zoneIds["Main Stage"],
      entryZoneId: zoneIds["East Gate"],
      setTime: setTime(180),
      status: "not_arrived" as const,
    },
    {
      name: "Marigold Radio",
      stageZoneId: zoneIds["Second Stage"],
      entryZoneId: zoneIds["Main Gate"],
      setTime: setTime(240),
      status: "not_arrived" as const,
    },
  ];
  for (const a of artistDefs) {
    await ctx.db.insert("lineupArtists", { festivalId, ...a });
  }

  const volunteerNames = [
    "Priya",
    "Marcus",
    "Dana",
    "Theo",
    "Yuki",
    "Sam",
    "Ines",
    "Cole",
  ];
  for (let i = 0; i < volunteerNames.length; i++) {
    const assign = i < 4;
    await ctx.db.insert("volunteers", {
      festivalId,
      name: volunteerNames[i],
      zoneId: assign ? zoneIds[zoneDefs[i % zoneDefs.length].name] : undefined,
      status: assign ? "assigned" : "available",
    });
  }

  return festivalId;
}

export const seedFestival = mutation({
  args: {},
  handler: async (ctx) => seed(ctx),
});

export const resetFestival = mutation({
  args: {},
  handler: async (ctx) => seed(ctx),
});
