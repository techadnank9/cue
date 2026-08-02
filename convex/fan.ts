// convex/fan.ts
// The fan-facing guide: "where's my favorite artist", "where's the
// restroom", "where should I go". Deterministic keyword matching covers the
// common cases with zero external calls; an optional OpenAI pass (only if
// OPENAI_API_KEY is set) handles anything open-ended. Either way the answer
// is grounded in live Convex data — the same zones/lineup the ops team sees.

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import { v } from "convex/values";
import { transcribeAudio } from "./openaiVoice";

const FRIENDLY_STATUS: Record<string, string> = {
  not_arrived: "haven't arrived on site yet",
  arrived: "are on site, getting ready",
  soundcheck: "are in soundcheck now",
  ready: "are ready to go on",
};

function nearestZoneLabel(zone: any, allZones: any[]): string {
  const others = allZones.filter(
    (z) => z._id !== zone._id && (z.kind === "stage" || z.kind === "entry")
  );
  if (others.length === 0) return "";
  let best = others[0];
  let bestDist = Infinity;
  for (const o of others) {
    const d = Math.hypot(o.x - zone.x, o.y - zone.y);
    if (d < bestDist) {
      bestDist = d;
      best = o;
    }
  }
  return `near ${best.name}`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const askGuide = action({
  args: {
    festivalId: v.id("festivals"),
    question: v.optional(v.string()),
    audio: v.optional(v.bytes()),
  },
  handler: async (ctx, { festivalId, question, audio }): Promise<{ answer: string; question: string }> => {
    const zones = await ctx.runQuery(api.backstage.listZoneStatus, { festivalId });
    const artists = await ctx.runQuery(api.backstage.listArtists, { festivalId });

    let questionText = question ?? "";
    if (!questionText && audio) {
      questionText = await transcribeAudio(audio);
    }
    if (!questionText.trim()) {
      return {
        question: "",
        answer: "I didn't catch that — try asking again, or type your question.",
      };
    }
    const q = questionText.toLowerCase();

    // 1. Artist lookup — "where's <artist>", "when is <artist> on".
    const matchedArtist = artists.find((a) =>
      q.includes(a.name.toLowerCase())
    );
    if (matchedArtist) {
      const status = FRIENDLY_STATUS[matchedArtist.status] ?? matchedArtist.status;
      const answer = `${matchedArtist.name} plays ${matchedArtist.stageName} at ${formatTime(
        matchedArtist.setTime
      )}. Right now they ${status}. Head in through ${matchedArtist.entryName} if you're coming from outside.`;
      return { question: questionText, answer: withTip(answer, artists) };
    }

    // 2. Restrooms.
    if (/(restroom|bathroom|toilet|washroom)/.test(q)) {
      const restrooms = zones.filter((z) => z.kind === "restroom");
      if (restrooms.length > 0) {
        const list = restrooms
          .map((z) => `${z.name} (${nearestZoneLabel(z, zones)})`)
          .join(" and ");
        return { question: questionText, answer: withTip(`Closest restrooms: ${list}.`, artists) };
      }
    }

    // 3. Food & drink.
    if (/(food|drink|eat|hungry|thirsty|beer|snack|water)/.test(q)) {
      const spots = zones.filter((z) => z.kind === "food_drink");
      if (spots.length > 0) {
        const list = spots.map((z) => `${z.name} (${nearestZoneLabel(z, zones)})`).join(" and ");
        return { question: questionText, answer: withTip(`Grab food or drinks at ${list}.`, artists) };
      }
    }

    // 4. Full schedule.
    if (/(schedule|lineup|when.*(play|start|on)|set time)/.test(q)) {
      const list = artists
        .map((a) => `${a.name} — ${a.stageName} at ${formatTime(a.setTime)}`)
        .join(", ");
      return { question: questionText, answer: `Today's lineup: ${list}.` };
    }

    // 5. Navigation / "where should I go" / general layout.
    if (/(navigat|where should i go|directions|how do i get|layout|map)/.test(q)) {
      const stages = zones.filter((z) => z.kind === "stage").map((z) => z.name);
      const gates = zones.filter((z) => z.kind === "entry").map((z) => z.name);
      const answer = `There are ${gates.length} entry gates (${gates.join(
        ", "
      )}) and ${stages.length} stages (${stages.join(
        ", "
      )}). Restrooms and food/drink are marked on the map between the stages — check the Fan Guide map for the closest one to you.`;
      return { question: questionText, answer: withTip(answer, artists) };
    }

    // 6. Optional LLM fallback for anything open-ended.
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const context = {
          zones: zones.map((z) => ({ name: z.name, kind: z.kind })),
          artists: artists.map((a) => ({
            name: a.name,
            stage: a.stageName,
            setTime: a.setTime,
            status: a.status,
          })),
        };
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.4,
            messages: [
              {
                role: "system",
                content:
                  "You are Arlo, a friendly festival guide talking to a fan. Answer in 1-3 short sentences using only the festival data provided. Be warm and specific, and suggest one thing they might enjoy checking out if it fits naturally.",
              },
              { role: "user", content: `Festival data: ${JSON.stringify(context)}\n\nFan question: ${questionText}` },
            ],
          }),
        });
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content?.trim();
        if (text) return { question: questionText, answer: text };
      } catch (err) {
        console.error("askGuide LLM fallback failed", err);
      }
    }

    // 7. Deterministic fallback.
    return {
      question: questionText,
      answer:
        "I can help with the lineup, set times, restrooms, food & drink, or getting around — try asking where your favorite artist is playing, or where the nearest restroom is.",
    };
  },
});

function withTip(answer: string, artists: any[]): string {
  const upcoming = artists.find((a) => a.status === "not_arrived" || a.status === "arrived");
  if (upcoming) {
    return `${answer} While you're out there, ${upcoming.name} is playing ${upcoming.stageName} at ${formatTime(
      upcoming.setTime
    )} — worth checking out.`;
  }
  return answer;
}
