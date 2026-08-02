import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { playBase64Audio, useVoiceRecorder } from "../useVoiceRecorder";

function ReadinessMeter({ score }: { score: number | undefined }) {
  const [display, setDisplay] = useState(score ?? 0);
  const [flare, setFlare] = useState(false);
  const previous = useRef(score);

  useEffect(() => {
    if (score === undefined) return;
    if (previous.current !== undefined && previous.current !== score) {
      setFlare(true);
      const timer = window.setTimeout(() => setFlare(false), 900);
      const start = previous.current;
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / 500);
        setDisplay(Math.round(start + (score - start) * progress));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      previous.current = score;
      return () => window.clearTimeout(timer);
    }
    setDisplay(score);
    previous.current = score;
  }, [score]);

  const tone = display >= 90 ? "success" : display >= 60 ? "warning" : "danger";
  return (
    <div className={`readiness-card readiness-card--${tone} ${flare ? "meter-flare" : ""}`}>
      <span className="section-label">Show readiness</span>
      <strong>{display}</strong>
      <span>{display >= 90 ? "Ready to go" : "Arlo is tracking what needs attention"}</span>
    </div>
  );
}

export default function ShowConsole() {
  const show = useQuery(api.queries.getDemoShow);
  const showId = show?._id;
  const readiness = useQuery(api.queries.getReadiness, showId ? { showId } : "skip");
  const issues = useQuery(api.queries.listIssues, showId ? { showId } : "skip");
  const voiceLog = useQuery(api.queries.listVoiceLog, showId ? { showId } : "skip");
  const tasks = useQuery(api.queries.listTasks, showId ? { showId } : "skip");
  const presence = useQuery(api.queries.listPresence, showId ? { showId } : "skip");

  const seedDemo = useMutation(api.mutations.seedDemo);
  const resetDemo = useMutation(api.mutations.resetDemo);
  const applySafeChange = useMutation(api.mutations.applySafeChange);
  const transcribeAndRoute = useAction(api.actions.transcribeAndRoute);
  const speak = useAction(api.actions.speak);
  const simulateJamBase = useMutation(api.mutations.simulateJamBaseShortened);
  const updateTaskStatus = useMutation(api.mutations.updateTaskStatus);
  const heartbeat = useMutation(api.mutations.heartbeat);
  const { recording, start: startMic, stop: stopMic, error: micError } = useVoiceRecorder();
  const [arloBusy, setArloBusy] = useState(false);

  useEffect(() => {
    if (show === null) void seedDemo();
  }, [show, seedDemo]);

  useEffect(() => {
    if (!showId) return;
    void heartbeat({ showId, name: "You", role: "crew" });
    const interval = window.setInterval(() => {
      void heartbeat({ showId, name: "You", role: "crew" });
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [showId, heartbeat]);

  if (!show) return <div className="loading-state">Loading show operations…</div>;

  const speakReply = async (text: string) => {
    try {
      const { audioBase64 } = await speak({ text });
      if (audioBase64) playBase64Audio(audioBase64);
    } catch {
      // Text remains visible when speech playback is unavailable.
    }
  };

  const runKeyboardOut = async () => {
    if (!showId) return;
    setArloBusy(true);
    try {
      const { reply } = await transcribeAndRoute({ showId, command: "the keyboard player is out" });
      void speakReply(reply);
    } finally {
      setArloBusy(false);
    }
  };

  const toggleMic = async () => {
    if (!showId) return;
    if (!recording) return void (await startMic());
    setArloBusy(true);
    try {
      const audio = await stopMic();
      if (audio) {
        const { reply } = await transcribeAndRoute({ showId, audio });
        void speakReply(reply);
      }
    } finally {
      setArloBusy(false);
    }
  };

  return (
    <div className="console-layout">
      <header className="screen-heading">
        <div><p className="eyebrow">Live production</p><h2>{show.name}</h2><p>{show.artist} · {show.venue}</p></div>
        <button className="quiet-button" onClick={() => resetDemo()}>Reset demo</button>
      </header>

      <div className="console-grid">
        <ReadinessMeter score={readiness?.score} />
        <section className="surface-card arlo-card">
          <div className="section-heading"><div><span className="arlo-dot">A</span><h3>Ask Arlo</h3></div><span className="live-pill">Live</span></div>
          <p className="muted-copy">Speak naturally. Arlo will route the update and keep every crew screen in sync.</p>
          <div className="action-row">
            <button className={`voice-button ${recording ? "is-recording" : ""}`} onClick={toggleMic} disabled={arloBusy && !recording}>
              {recording ? "● Listening — tap to send" : "🎙 Talk to Arlo"}
            </button>
            <button className="secondary-button" onClick={runKeyboardOut} disabled={arloBusy}>
              {arloBusy ? "Updating…" : "Simulate keyboard player out"}
            </button>
            <button className="secondary-button" onClick={() => showId && simulateJamBase({ showId })}>Simulate shortened set</button>
          </div>
          {micError && <p className="error-copy">{micError}</p>}
          <div className="voice-log">
            {(voiceLog ?? []).map((entry: any) => (
              <div key={entry._id} className={`voice-message voice-message--${entry.speaker}`}>
                <strong>{entry.speaker === "arlo" ? "Arlo" : "Crew"}</strong><span>{entry.text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="surface-card">
        <div className="section-heading"><h3>Production issues</h3><span>{(issues ?? []).length} open</span></div>
        <div className="stack-list">
          {(issues ?? []).length === 0 && <div className="empty-state">No open issues. The show is clean.</div>}
          {(issues ?? []).map((issue: any) => (
            <article className={`issue-row issue-row--${issue.severity}`} key={issue._id}>
              <div><strong>{issue.title}</strong><p>{issue.detail}</p><small>{issue.fixClass === "safe" ? "Safe to apply" : "Needs approval"}</small></div>
              {issue.fixClass === "safe" && <button className="small-button" onClick={() => showId && applySafeChange({ showId, issueId: issue._id as Id<"issues"> })}>Apply</button>}
            </article>
          ))}
        </div>
      </section>

      <div className="two-column">
        <section className="surface-card">
          <div className="section-heading"><h3>Crew tasks</h3><span>{(tasks ?? []).length}</span></div>
          <div className="stack-list">
            {(tasks ?? []).length === 0 && <div className="empty-state">No tasks yet.</div>}
            {(tasks ?? []).map((task: any) => (
              <div className="task-row" key={task._id}>
                <div><strong>{task.title}</strong><small>{task.owner}</small></div>
                <button className={`status-button ${task.status === "done" ? "is-done" : ""}`} onClick={() => updateTaskStatus({ taskId: task._id, status: task.status === "done" ? "pending" : "done" })}>
                  {task.status === "done" ? "Done" : "Mark done"}
                </button>
              </div>
            ))}
          </div>
        </section>
        <section className="surface-card">
          <div className="section-heading"><h3>Crew online</h3><span>{(presence ?? []).length}</span></div>
          <div className="presence-list">
            {(presence ?? []).map((person: any) => <span key={person._id}><i />{person.name} · {person.role}</span>)}
            {(presence ?? []).length === 0 && <div className="empty-state">No one else is on the console.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
