// convex/events.ts
// Real-world festival index. Data below was pulled from the JamBase MCP
// server in an agent session on 2026-08-02 (searchFestivals, geo-anchored on
// San Francisco + nearby major metros, next ~6 weeks). MCP tools only exist
// in an agent session — a deployed Convex function or a browser can't call
// them directly — so this is a manual snapshot, refreshed by re-running
// `seedFestivalEvents` after a fresh MCP pull, not a live poll.

import { mutation, query } from "./_generated/server";

const SF_LAT = 37.7749;
const SF_LNG = -122.4194;

const REAL_EVENTS = [
  {
    jambaseId: "jambase:15738826",
    name: "Outside Lands",
    startDate: "2026-08-07",
    venueName: "Golden Gate Park",
    city: "San Francisco",
    region: "CA",
    country: "United States",
    latitude: 37.7682,
    longitude: -122.4932,
    headliners: ["Charli XCX", "The Strokes", "RÜFÜS DU SOL"],
    jambaseUrl: "https://www.jambase.com/festival/outside-lands-2026",
    heroImage:
      "https://www.jambase.com/wp-content/uploads/2023/11/340853191_564110812370713_6744073452357664632_n-e1700234752192-1480x832.jpg",
    hasOpsExperience: true,
  },
  {
    jambaseId: "jambase:16145034",
    name: "Cory Wong's Syncopated Summer Camp",
    startDate: "2026-08-13",
    venueName: "Fairmont Hotel",
    city: "San Francisco",
    region: "CA",
    country: "United States",
    latitude: 37.7923,
    longitude: -122.4105,
    headliners: ["Cory Wong", "Eric Krasno", "Ariel Posen"],
    jambaseUrl:
      "https://www.jambase.com/festival/cory-wongs-syncopated-summer-camp-2026",
    heroImage:
      "https://www.jambase.com/wp-content/uploads/2026/04/cory-wongs-syncopated-summer-camp-1480x832.png",
    hasOpsExperience: false,
  },
  {
    jambaseId: "jambase:15980325",
    name: "KCON LA",
    startDate: "2026-08-14",
    venueName: "Crypto.com Arena",
    city: "Los Angeles",
    region: "CA",
    country: "United States",
    latitude: 34.043,
    longitude: -118.2668,
    headliners: ["NCT 127", "ZEROBASEONE", "TOMORROW X TOGETHER"],
    jambaseUrl: "https://www.jambase.com/festival/kcon-la-2026",
    heroImage:
      "https://www.jambase.com/wp-content/uploads/2025/05/kcon-la-1480x832.png",
    hasOpsExperience: false,
  },
  {
    jambaseId: "jambase:15701823",
    name: "Sound and Fury Festival",
    startDate: "2026-08-15",
    venueName: "Exposition Park",
    city: "Los Angeles",
    region: "CA",
    country: "United States",
    latitude: 34.0149,
    longitude: -118.2845,
    headliners: ["Angel Du$t", "Béton Armé", "Carry On"],
    jambaseUrl: "https://www.jambase.com/festival/sound-and-fury-festival-2026",
    heroImage:
      "https://www.jambase.com/wp-content/uploads/2020/03/soundandfury2020-1480x832.jpg",
    hasOpsExperience: false,
  },
];

export const seedFestivalEvents = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("festivalEvents").collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const e of REAL_EVENTS) await ctx.db.insert("festivalEvents", e);
    return REAL_EVENTS.length;
  },
});

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Events ordered by distance from Cue's home base (San Francisco), soonest
// first among ties. Powers the "choose an event" queue.
export const listFestivalEventsByDistance = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("festivalEvents").collect();
    return events
      .map((e) => ({
        ...e,
        distanceMiles: Math.round(
          haversineMiles(SF_LAT, SF_LNG, e.latitude, e.longitude)
        ),
      }))
      .sort((a, b) => a.distanceMiles - b.distanceMiles || a.startDate.localeCompare(b.startDate));
  },
});
