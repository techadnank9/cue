import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useVoiceRecorder, useSpeaker } from "./useVoiceRecorder";

const STATUS_LABEL: Record<string, string> = {
  not_arrived: "Coming up",
  arrived: "On site",
  soundcheck: "Warming up",
  ready: "On stage soon",
};
const STATUS_COLOR: Record<string, string> = {
  not_arrived: "var(--gaff-silver)",
  arrived: "var(--house-amber)",
  soundcheck: "var(--house-amber)",
  ready: "var(--cue-green)",
};

const ZONE_ICON: Record<string, string> = {
  entry: "⛩",
  stage: "♪",
  restroom: "🚻",
  food_drink: "🍔",
};

const SUGGESTED_PROMPTS = [
  "Where's my favorite artist?",
  "Where's the nearest restroom?",
  "Where can I get food or drinks?",
  "What's the full lineup today?",
  "Where should I go right now?",
];

function ScheduleCard({ artist }: { artist: any }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-4 flex items-center justify-between gap-3">
      <div>
        <div className="font-display text-lg text-[var(--gaff-silver)]">{artist.name}</div>
        <div className="text-sm text-[var(--gaff-silver)]/60">
          {artist.stageName} ·{" "}
          {new Date(artist.setTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
      <span
        className="text-xs font-mono-console uppercase tracking-wider px-2.5 py-1.5 rounded-full shrink-0"
        style={{
          color: STATUS_COLOR[artist.status],
          border: `1px solid ${STATUS_COLOR[artist.status]}`,
        }}
      >
        {STATUS_LABEL[artist.status]}
      </span>
    </div>
  );
}

function AmenityChip({ zone }: { zone: any }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 px-3 py-2 text-sm text-[var(--gaff-silver)]/80">
      <span>{ZONE_ICON[zone.kind]}</span>
      {zone.name}
    </div>
  );
}

type ChatMessage = { role: "fan" | "arlo"; text: string };

function ChatPanel({ festivalId }: { festivalId: any }) {
  const askGuide = useAction(api.fan.askGuide);
  const speak = useAction(api.actions.speak);
  const { recording, start, stop, error: micError } = useVoiceRecorder();
  const speaker = useSpeaker();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "arlo",
      text: "Hey! I'm Arlo. Ask me where your favorite artist is playing, where to find food or restrooms, or where you should head next.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const speakReply = async (text: string) => {
    try {
      const { audioBase64 } = await speak({ text });
      if (audioBase64) speaker.speak(audioBase64);
    } catch {
      // TTS is a nice-to-have; the text answer already rendered.
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || busy) return;
    setMessages((m) => [...m, { role: "fan", text }]);
    setInput("");
    setBusy(true);
    try {
      const { answer } = await askGuide({ festivalId, question: text });
      setMessages((m) => [...m, { role: "arlo", text: answer }]);
      void speakReply(answer);
    } finally {
      setBusy(false);
    }
  };

  const sendAudio = async (audio: ArrayBuffer) => {
    setBusy(true);
    try {
      const { answer, question } = await askGuide({ festivalId, audio });
      if (question) setMessages((m) => [...m, { role: "fan", text: question }]);
      setMessages((m) => [...m, { role: "arlo", text: answer }]);
      void speakReply(answer);
    } finally {
      setBusy(false);
    }
  };

  const toggleMic = async () => {
    if (recording) {
      const audio = await stop();
      if (audio) await sendAudio(audio);
    } else {
      await start();
    }
  };

  return (
    <div className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-4 flex flex-col gap-3">
      <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console">
        Ask Arlo
      </h2>
      <div ref={scrollRef} className="flex flex-col gap-3 max-h-72 overflow-y-auto pr-1">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
              m.role === "fan" ? "self-end" : "self-start"
            }`}
            style={{
              background: m.role === "fan" ? "var(--house-amber)" : "rgba(255,255,255,0.06)",
              color: m.role === "fan" ? "var(--stage-black)" : "var(--gaff-silver)",
            }}
          >
            {m.text}
          </div>
        ))}
        {busy && (
          <div
            className="self-start max-w-[85%] rounded-2xl px-4 py-2.5 text-sm text-[var(--gaff-silver)]/50"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            Arlo is thinking…
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {SUGGESTED_PROMPTS.map((p) => (
          <button
            key={p}
            onClick={() => send(p)}
            disabled={busy}
            className="text-xs rounded-full border border-white/15 px-3 py-1.5 text-[var(--gaff-silver)]/70 hover:text-[var(--gaff-silver)] disabled:opacity-40"
          >
            {p}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Arlo anything…"
          className="flex-1 rounded-lg bg-black/30 border border-white/10 px-4 py-2.5 text-sm text-[var(--gaff-silver)] placeholder:text-[var(--gaff-silver)]/40 focus:outline-none"
        />
        <button
          type="button"
          onClick={toggleMic}
          disabled={busy}
          title={recording ? "Stop and ask" : "Ask by voice"}
          className={`rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50 ${
            recording ? "meter-breathe" : ""
          }`}
          style={{
            background: recording ? "var(--fault-red)" : "rgba(255,255,255,0.08)",
            color: recording ? "var(--stage-black)" : "var(--gaff-silver)",
          }}
        >
          {recording ? "● Listening…" : "🎙"}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--house-amber)", color: "var(--stage-black)" }}
        >
          Send
        </button>
      </form>
      {micError && (
        <div className="text-xs text-[var(--fault-red)]">{micError}</div>
      )}
    </div>
  );
}

export default function FanGuide() {
  const festival = useQuery(api.backstage.getFestival);
  const festivalId = festival?._id;
  const artists = useQuery(api.backstage.listArtists, festivalId ? { festivalId } : "skip");
  const zones = useQuery(api.backstage.listZoneStatus, festivalId ? { festivalId } : "skip");

  if (!festival || !artists || !zones) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--gaff-silver)]/60 font-mono-console">
        Loading the fan guide…
      </div>
    );
  }

  const restrooms = zones.filter((z) => z.kind === "restroom");
  const foodDrink = zones.filter((z) => z.kind === "food_drink");

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-5 py-8 flex flex-col gap-6">
      <header>
        <div className="text-xs uppercase tracking-[0.3em] text-[var(--house-amber)] font-mono-console">
          Fan Guide
        </div>
        <h1 className="font-display text-3xl text-[var(--gaff-silver)]">{festival.name}</h1>
        <div className="text-sm text-[var(--gaff-silver)]/60">
          Everything happening today, and Arlo to help you find it.
        </div>
      </header>

      <ChatPanel festivalId={festivalId} />

      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Today's lineup
        </h2>
        <div className="flex flex-col gap-3">
          {artists.map((a: any) => (
            <ScheduleCard key={a._id} artist={a} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Restrooms
        </h2>
        <div className="flex flex-wrap gap-2">
          {restrooms.map((z: any) => (
            <AmenityChip key={z._id} zone={z} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Food & drink
        </h2>
        <div className="flex flex-wrap gap-2">
          {foodDrink.map((z: any) => (
            <AmenityChip key={z._id} zone={z} />
          ))}
        </div>
      </section>
    </div>
  );
}
