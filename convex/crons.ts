// convex/crons.ts
// The autonomous heartbeat. This is what makes the external-trigger demo
// happen with no button press — and it's a Convex feature most hackathon
// projects never touch. Keep it.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Poll JamBase for schedule/status changes on the demo festival.
crons.interval(
  "poll jambase",
  { seconds: 30 },
  internal.actions.pollJamBase,
  {}
);

// Simulated live crowd feed for the backstage-ops map — the world moves
// on its own, same pattern as the JamBase poll above.
crons.interval(
  "simulate crowd tick",
  { seconds: 5 },
  internal.backstage.simulateCrowdTick,
  {}
);

export default crons;
