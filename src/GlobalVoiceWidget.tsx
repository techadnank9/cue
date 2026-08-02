import { useEffect, useRef, useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useVoiceRecorder, playBase64Audio } from "./useVoiceRecorder";

type Tab = "ops" | "fan" | "show";
type Turn = { role: "user" | "arlo"; text: string; page: Tab };

const PAGE_LABEL: Record<Tab, string> = {
  ops: "Festival Ops",
  fan: "Fan Guide",
  show: "Show Console",
};

const PAGE_HINT: Record<Tab, string> = {
  ops: "Ask about crowd density, understaffed zones, or artist status.",
  fan: "Ask where an artist is playing, restrooms, food, or the lineup.",
  show: "Ask about readiness, open issues, or say a command like \"the keyboard player is out\".",
};

// A single mic, always on screen, that answers with whatever context makes
// sense for the tab you're currently on — ops staff get crowd/volunteer
// detail, fans get lineup/amenities, Show Console keeps the original voice
// cascade. History persists across tab switches because this component is
// mounted once at the App root and never unmounts when the tab changes.
export default function GlobalVoiceWidget({ activeTab }: { activeTab: Tab }) {
  const show = useQuery(api.queries.getDemoShow);
  const festival = useQuery(api.backstage.getFestival);

  const askGuide = useAction(api.fan.askGuide);
  const transcribeAndRoute = useAction(api.actions.transcribeAndRoute);
  const speak = useAction(api.actions.speak);
  const { recording, start, stop, error: micError } = useVoiceRecorder();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<Turn[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, open]);

  const speakReply = async (text: string) => {
    try {
      const { audioBase64 } = await speak({ text });
      if (audioBase64) playBase64Audio(audioBase64);
    } catch {
      // Text answer already rendered either way.
    }
  };

  const ask = async (opts: { text?: string; audio?: ArrayBuffer }) => {
    setBusy(true);
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
        void speakReply(answer);
      }
    } finally {
      setBusy(false);
    }
  };

  const submitText = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    await ask({ text });
  };

  const toggleMic = async () => {
    if (busy) return;
    if (recording) {
      const audio = await stop();
      if (audio) await ask({ audio });
    } else {
      setOpen(true);
      await start();
    }
  };

  const visibleHistory = history;

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

          <div ref={scrollRef} className="flex flex-col gap-2 p-3 max-h-72 overflow-y-auto">
            {visibleHistory.length === 0 && (
              <div className="text-sm text-[var(--gaff-silver)]/50">{PAGE_HINT[activeTab]}</div>
            )}
            {visibleHistory.map((t, i) => (
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
            {busy && (
              <div
                className="self-start max-w-[90%] rounded-xl px-3 py-2 text-sm text-[var(--gaff-silver)]/50"
                style={{ background: "rgba(255,255,255,0.06)" }}
              >
                Arlo is thinking…
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              submitText();
            }}
            className="flex gap-2 p-3 border-t border-white/10"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type or use the mic…"
              className="flex-1 rounded-lg bg-black/30 border border-white/10 px-3 py-2 text-sm text-[var(--gaff-silver)] placeholder:text-[var(--gaff-silver)]/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
              style={{ background: "var(--house-amber)", color: "var(--stage-black)" }}
            >
              Send
            </button>
          </form>
          {micError && (
            <div className="px-3 pb-2 text-xs text-[var(--fault-red)]">{micError}</div>
          )}
        </div>
      )}

      <button
        onClick={() => {
          if (!open) setOpen(true);
          void toggleMic();
        }}
        disabled={busy && !recording}
        title={recording ? "Stop and send" : "Talk to Arlo"}
        className={`w-14 h-14 rounded-full flex items-center justify-center text-xl shadow-2xl disabled:opacity-50 ${
          recording ? "meter-flare" : "meter-breathe"
        }`}
        style={{
          background: recording ? "var(--fault-red)" : "var(--house-amber)",
          color: "var(--stage-black)",
          boxShadow: "0 6px 24px rgba(0,0,0,0.5)",
        }}
      >
        {recording ? "●" : "🎙"}
      </button>
    </div>
  );
}
