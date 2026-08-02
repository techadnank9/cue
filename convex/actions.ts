// convex/actions.ts
// Actions hold all side-effecting external calls (OpenAI, JamBase, STT).
// They never write to the DB directly — they call mutations.

import { internalAction, action } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Detect conflicts. The deterministic channel-capacity check runs in
// checkChannelCapacity (trustworthy for the flagship case); this action adds
// an LLM pass for softer conflicts when an OpenAI key is configured.
export const detectConflicts = internalAction({
  args: { showId: v.id("shows") },
  handler: async (ctx, { showId }) => {
    // 1. Deterministic channel-capacity check (never LLM-gated).
    await ctx.runMutation(internal.mutations.checkChannelCapacity, { showId });

    // 2. Optional LLM pass for explanations + additional soft conflicts.
    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const context = await ctx.runQuery(internal.queries.getShowContext, {
          showId,
        });
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0,
            messages: [
              {
                role: "system",
                content:
                  'You are Cue, a live-show production risk detector. Return ONLY JSON matching this shape, no prose, no markdown fences: { "issues": [ { "type": string, "severity": "low"|"medium"|"high", "title": string, "detail": string, "affectedDocs": string[], "suggestedFix": string, "fixClass": "safe"|"approval" } ] }. Only report NEW risks not already obvious from a raw channel-count mismatch. If there are none, return { "issues": [] }.',
              },
              { role: "user", content: JSON.stringify(context) },
            ],
          }),
        });
        const data = await res.json();
        let raw: string = data?.choices?.[0]?.message?.content ?? "{}";
        raw = raw.trim().replace(/^```json?/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(raw);
        const issues = Array.isArray(parsed?.issues) ? parsed.issues : [];
        for (const issue of issues) {
          if (!issue?.title || !issue?.type) continue;
          await ctx.runMutation(internal.mutations.insertLlmIssue, {
            showId,
            type: String(issue.type),
            severity: ["low", "medium", "high"].includes(issue.severity)
              ? issue.severity
              : "low",
            title: String(issue.title),
            detail: String(issue.detail ?? ""),
            affectedDocs: Array.isArray(issue.affectedDocs)
              ? issue.affectedDocs.map(String)
              : [],
            suggestedFix: issue.suggestedFix ? String(issue.suggestedFix) : undefined,
            fixClass: issue.fixClass === "safe" ? "safe" : "approval",
          });
        }
      } catch (err) {
        console.error("detectConflicts LLM pass failed", err);
      }
    }

    // 3. Recompute readiness after writing issues.
    await ctx.runMutation(internal.mutations.recomputeReadiness, { showId });
  },
});

// Poll JamBase for the demo festival. Runs on a Convex cron (see crons.ts).
// Caches results into Convex; on a relevant change, calls ingestJamBaseEvent.
export const pollJamBase = internalAction({
  args: {},
  handler: async (ctx) => {
    const key = process.env.JAMBASE_API_KEY;
    const showId = await ctx.runQuery(internal.queries.getDemoShowId, {});
    if (!key || !showId) return; // No key configured — the scripted button drives the demo.

    try {
      const show = await ctx.runQuery(internal.queries.getShowInternal, { showId });
      if (!show?.jambaseEventId) return;
      const res = await fetch(
        `https://data.jambase.com/v3/events/id/${show.jambaseEventId}?apikey=${key}`
      );
      if (!res.ok) return;
      const data = await res.json();
      const status: string | undefined = data?.eventStatus;
      if (status && status.toLowerCase().includes("shorten")) {
        await ctx.runMutation(internal.mutations.ingestJamBaseEvent, {
          showId,
          newSetLengthMinutes: 30,
        });
      }
    } catch (err) {
      console.error("pollJamBase failed", err);
    }
  },
});

// Voice in: transcribe, map to an intent, run the matching cascade.
export const transcribeAndRoute = action({
  args: {
    showId: v.id("shows"),
    audio: v.optional(v.bytes()),
    command: v.optional(v.string()),
  },
  handler: async (ctx, { showId, audio, command }): Promise<{ reply: string; text: string }> => {
    let text = command ?? "";

    if (!text && audio) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (apiKey) {
        try {
          const form = new FormData();
          form.append("file", new Blob([audio]), "command.webm");
          form.append("model", "whisper-1");
          const res = await fetch(
            "https://api.openai.com/v1/audio/transcriptions",
            {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}` },
              body: form,
            }
          );
          const data = await res.json();
          text = data?.text ?? "";
        } catch (err) {
          console.error("transcribe failed", err);
        }
      }
    }

    const lower = text.toLowerCase();

    // Flagship intent: keyboard player unavailable.
    if (
      lower.includes("keyboard") &&
      (lower.includes("out") ||
        lower.includes("unavailable") ||
        lower.includes("gone") ||
        lower.includes("down"))
    ) {
      const reply: string = await ctx.runMutation(
        internal.mutations.removeKeyboardPlayer,
        { showId }
      );
      return { reply, text };
    }

    // Fallback: log the command, give a generic status reply.
    const showState = await ctx.runQuery(internal.queries.getShowContext, {
      showId,
    });
    const openCount = showState.openIssues?.length ?? 0;
    const reply =
      openCount === 0
        ? "No open issues. Show's clean."
        : `${openCount} open issue${openCount === 1 ? "" : "s"}. Top one: ${showState.openIssues[0]?.title}.`;
    await ctx.runMutation(internal.mutations.logVoiceTurn, {
      showId,
      speaker: "crew",
      text: text || "(no speech detected)",
    });
    await ctx.runMutation(internal.mutations.logVoiceTurn, {
      showId,
      speaker: "arlo",
      text: reply,
    });
    return { reply, text };
  },
});
