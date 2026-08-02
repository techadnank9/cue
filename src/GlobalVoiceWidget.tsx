import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useVoiceRecorder, useSpeaker } from "./useVoiceRecorder";

type Tab = "ops" | "fan" | "show";
type Turn = { role: "user" | "arlo"; text: string; page: Tab };
type CallState = "idle" | "listening" | "thinking" | "speaking";

const PAGE_LABEL: Record<Tab, string> = {
  ops: "Festival Ops",
  fan: "Fan Guide",
  show: "Show Console",
};

const PAGE_HINT: Record<Tab, string> = {
  ops: "Ask about crowd density, understaffed zones, or artist status.",
  fan: "Ask where an artist is playing, restrooms, food, or the lineup.",
  show: "Ask about readiness, open issues, or say \"the keyboard player is out\".",
};

const STATE_LABEL: Record<CallState, string> = {
  idle: "Tap to talk",
  listening: "Listening… tap to send",
  thinking: "Thinking…",
  speaking: "Arlo is speaking…",
};

// A single mic, always on screen, that answers with whatever context makes
// sense for the tab you're currently on. Designed to feel like a call, not a
// chat: one big talk button drives state (idle → listening → thinking →
// speaking), with separate mute-mic / sound / stop controls alongside it.
// Mounted once at the App root so it never unmounts on tab switches, which
// is also why conversation history survives navigating between tabs.
export default function GlobalVoiceWidget({ activeTab }: { activeTab: Tab }) {
  const show = useQuery(api.queries.getDemoShow);
  const festival = useQuery(api.backstage.getFestival);

  const askGuide = useAction(api.fan.askGuide);
  const transcribeAndRoute = useAction(api.actions.transcribeAndRoute);
  const speak = useAction(api.actions.speak);
  const { recording, start, stop, cancel, error: micError } = useVoiceRecorder();
  const speaker = useSpeaker();

  const [open, setOpen] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const [showTextInput, setShowTextInput] = useState(false);
  const [history, setHistory] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, open]);

  const callState: CallState = speaker.isSpeaking
    ? "speaking"
    : thinking
      ? "thinking"
      : recording
        ? "listening"
        : "idle";

  const speakReply = async (text: string) => {
    try {
      const { audioBase64 } = await speak({ text });
      if (audioBase64) speaker.speak(audioBase64);
    } catch {
      // Text answer already rendered either way.
    }
  };

  const ask = async (opts: { text?: string; audio?: ArrayBuffer }) => {
    setThinking(true);
    try {
      if (activeTab === "show") {
        if (!show) return;
        const { reply, text } = await transcribeAndRoute({
          showId: show._id,
          command: opts.text,
          audio: opts.audio,
        });
        const spoken = opts.text ?? text;
        if (spoken) setHistory((h) => [...h, { role: "user", text: spoken, page: activeTab }]);
        setHistory((h) => [...h, { role: "arlo", text: reply, page: activeTab }]);
        setThinking(false);
        void speakReply(reply);
      } else {
        if (!festival) return;
        const priorTurns = history
          .filter((t) => t.page === activeTab)
          .slice(-6)
          .map((t) => ({ role: t.role, text: t.text }));
        const { answer, question } = await askGuide({
          festivalId: festival._id,
          question: opts.text,
          audio: opts.audio,
          mode: activeTab === "ops" ? "ops" : "fan",
          history: priorTurns,
        });
        const spoken = opts.text ?? question;
        if (spoken) setHistory((h) => [...h, { role: "user", text: spoken, page: activeTab }]);
        setHistory((h) => [...h, { role: "arlo", text: answer, page: activeTab }]);
        setThinking(false);
        void speakReply(answer);
      }
    } finally {
      setThinking(false);
    }
  };

  const submitText = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    await ask({ text });
  };

  // The one big button: idle -> start listening, listening -> stop & send.
  const handleTalkPress = async () => {
    if (micMuted || thinking || speaker.isSpeaking) return;
    setOpen(true);
    if (recording) {
      const audio = await stop();
      if (audio) await ask({ audio });
    } else {
      await start();
    }
  };

  // Hard stop: cancels an in-progress recording without sending, or cuts
  // off Arlo mid-sentence. Always available while there's something to stop.
  const handleStop = () => {
    if (recording) cancel();
    if (speaker.isSpeaking) speaker.stop();
  };

  const talkButtonLabel =
    callState === "listening" ? "●" : callState === "thinking" ? "…" : callState === "speaking" ? "🔊" : "🎙";

  return (
    <div className="fixed bottom-5 right-5 z-30 flex flex-col items-end gap-3">
      {open && (
        <div
          className="w-[min(92vw,340px)] rounded-2xl border border-white/10 bg-[var(--console-graphite)] shadow-2xl flex flex-col overflow-hidden"
          style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.5)" }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div>
              <div className="text-xs uppercase tracking-[0.25em] text-[var(--house-amber)] font-mono-console">
                Ask Arlo
              </div>
              <div className="text-[11px] text-[var(--gaff-silver)]/50">
                On {PAGE_LABEL[activeTab]}
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[var(--gaff-silver)]/50 hover:text-[var(--gaff-silver)] text-lg leading-none px-1"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          <div ref={scrollRef} className="flex flex-col gap-2 p-3 max-h-56 overflow-y-auto">
            {history.length === 0 && (
              <div className="text-sm text-[var(--gaff-silver)]/50">{PAGE_HINT[activeTab]}</div>
            )}
            {history.map((t, i) => (
              <div key={i} className="flex flex-col gap-1">
                {t.page !== activeTab && (
                  <div className="text-[10px] font-mono-console uppercase text-[var(--gaff-silver)]/30">
                    {PAGE_LABEL[t.page]}
                  </div>
                )}
                <div
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                    t.role === "user" ? "self-end" : "self-start"
                  }`}
                  style={{
                    background: t.role === "user" ? "var(--house-amber)" : "rgba(255,255,255,0.06)",
                    color: t.role === "user" ? "var(--stage-black)" : "var(--gaff-silver)",
                  }}
                >
                  {t.text}
                </div>
              </div>
            ))}
          </div>

          {/* Call controls: the actual "talking" interface. */}
          <div className="flex flex-col items-center gap-2 px-4 py-4 border-t border-white/10">
            <div
              className="text-xs font-mono-console uppercase tracking-wider"
              style={{
                color:
                  callState === "listening"
                    ? "var(--fault-red)"
                    : callState === "idle"
                      ? "var(--gaff-silver)/60"
                      : "var(--house-amber)",
              }}
            >
              {micMuted ? "Mic muted" : STATE_LABEL[callState]}
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={() => setMicMuted((m) => !m)}
                title={micMuted ? "Unmute mic" : "Mute mic"}
                className="w-10 h-10 rounded-full flex items-center justify-center text-base"
                style={{
                  background: micMuted ? "var(--fault-red)" : "rgba(255,255,255,0.08)",
                  color: micMuted ? "var(--stage-black)" : "var(--gaff-silver)",
                }}
              >
                {micMuted ? "🔇" : "🎙"}
              </button>

              <button
                onClick={handleTalkPress}
                disabled={micMuted || thinking || speaker.isSpeaking}
                title={STATE_LABEL[callState]}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl disabled:opacity-50 ${
                  callState === "listening" ? "meter-flare" : callState === "idle" ? "meter-breathe" : ""
                }`}
                style={{
                  background: callState === "listening" ? "var(--fault-red)" : "var(--house-amber)",
                  color: "var(--stage-black)",
                  boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
                }}
              >
                {talkButtonLabel}
              </button>

              <button
                onClick={() => speaker.setMuted((m) => !m)}
                title={speaker.muted ? "Unmute Arlo's voice" : "Mute Arlo's voice"}
                className="w-10 h-10 rounded-full flex items-center justify-center text-base"
                style={{
                  background: speaker.muted ? "var(--fault-red)" : "rgba(255,255,255,0.08)",
                  color: speaker.muted ? "var(--stage-black)" : "var(--gaff-silver)",
                }}
              >
                {speaker.muted ? "🔕" : "🔊"}
              </button>
            </div>

            {(recording || speaker.isSpeaking) && (
              <button
                onClick={handleStop}
                className="mt-1 text-xs font-mono-console uppercase tracking-wider px-3 py-1.5 rounded-full border"
                style={{ borderColor: "var(--fault-red)", color: "var(--fault-red)" }}
              >
                ■ Stop
              </button>
            )}

            <button
              onClick={() => setShowTextInput((s) => !s)}
              className="mt-1 text-[11px] text-[var(--gaff-silver)]/40 hover:text-[var(--gaff-silver)]/70"
            >
              {showTextInput ? "Hide keyboard" : "Type instead"}
            </button>

            {showTextInput && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitText();
                }}
                className="flex gap-2 w-full mt-1"
              >
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Type a question…"
                  className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-[var(--gaff-silver)] placeholder:text-[var(--gaff-silver)]/40 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={thinking}
                  className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
                  style={{ background: "var(--house-amber)", color: "var(--stage-black)" }}
                >
                  Send
                </button>
              </form>
            )}
          </div>
          {micError && (
            <div className="px-4 pb-3 text-xs text-[var(--fault-red)]">{micError}</div>
          )}
        </div>
      )}

      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            void handleTalkPress();
          }}
          title="Talk to Arlo"
          className="w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-2xl meter-breathe"
          style={{
            background: "var(--house-amber)",
            color: "var(--stage-black)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
          }}
        >
          🎙
        </button>
      )}
    </div>
  );
}
