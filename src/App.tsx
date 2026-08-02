import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import BackstageOps from "./BackstageOps";
import FanGuide from "./FanGuide";

function ReadinessMeter({ score }: { score: number | undefined }) {
  const [display, setDisplay] = useState(score ?? 0);
  const [flare, setFlare] = useState(false);
  const prev = useRef(score);

  useEffect(() => {
    if (score === undefined) return;
    if (prev.current !== undefined && prev.current !== score) {
      setFlare(true);
      const t = setTimeout(() => setFlare(false), 900);
      const start = prev.current;
      const end = score;
      const duration = 500;
      const startTime = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - startTime) / duration);
        setDisplay(Math.round(start + (end - start) * p));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      return () => clearTimeout(t);
    }
    setDisplay(score);
    prev.current = score;
  }, [score]);

  const healthy = display >= 90;
  const color =
    display >= 90 ? "var(--cue-green)" : display >= 60 ? "var(--house-amber)" : "var(--fault-red)";

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-[var(--console-graphite)] px-8 py-6 flex flex-col items-center gap-2 ${
        healthy ? "meter-breathe" : ""
      } ${flare ? "meter-flare" : ""}`}
      style={{ borderRadius: 20 }}
    >
      <div className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/60 font-mono-console">
        Readiness
      </div>
      <div
        className="font-display font-bold tabular-nums"
        style={{ fontSize: 96, lineHeight: 1, color }}
      >
        {display}
      </div>
    </div>
  );
}

function IssueList({
  issues,
  onApply,
}: {
  issues: any[];
  onApply: (id: Id<"issues">) => void;
}) {
  if (issues.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-6 text-[var(--gaff-silver)]/70">
        No open issues. Show's clean.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {issues.map((issue) => (
        <div
          key={issue._id}
          className="issue-enter rounded-xl border border-white/10 bg-[var(--console-graphite)] p-4"
          style={{
            borderLeft: `4px solid ${
              issue.severity === "high"
                ? "var(--fault-red)"
                : issue.severity === "medium"
                  ? "var(--house-amber)"
                  : "var(--gaff-silver)"
            }`,
          }}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="font-semibold text-[var(--gaff-silver)]">{issue.title}</div>
              <div className="text-sm text-[var(--gaff-silver)]/70 mt-1">{issue.detail}</div>
              <div className="text-xs font-mono-console uppercase tracking-wider mt-2 text-[var(--gaff-silver)]/50">
                {issue.fixClass === "safe" ? "safe to auto-apply" : "needs approval"}
              </div>
            </div>
            {issue.fixClass === "safe" && (
              <button
                onClick={() => onApply(issue._id)}
                className="shrink-0 rounded-md px-3 py-1.5 text-sm font-medium"
                style={{ background: "var(--house-amber)", color: "var(--stage-black)" }}
              >
                Apply
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TaskBoard({
  tasks,
  onStatusChange,
}: {
  tasks: any[];
  onStatusChange: (id: Id<"tasks">, status: "pending" | "in_progress" | "done") => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-sm text-[var(--gaff-silver)]/50">No tasks yet.</div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {tasks.map((task) => (
        <div
          key={task._id}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-sm text-[var(--gaff-silver)] truncate">{task.title}</div>
            <div className="text-xs font-mono-console text-[var(--gaff-silver)]/50">
              {task.owner}
            </div>
          </div>
          <button
            onClick={() =>
              onStatusChange(task._id, task.status === "done" ? "pending" : "done")
            }
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-mono-console uppercase tracking-wider"
            style={{
              background: task.status === "done" ? "rgba(63,185,132,0.15)" : "transparent",
              color: task.status === "done" ? "var(--cue-green)" : "var(--gaff-silver)",
              border: `1px solid ${task.status === "done" ? "var(--cue-green)" : "rgba(255,255,255,0.15)"}`,
            }}
          >
            {task.status === "done" ? "done" : "mark done"}
          </button>
        </div>
      ))}
    </div>
  );
}

function PresenceRow({ presence }: { presence: any[] }) {
  if (presence.length === 0) {
    return <div className="text-sm text-[var(--gaff-silver)]/50">No one else on the console.</div>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {presence.map((p) => (
        <div
          key={p._id}
          className="flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1 text-xs font-mono-console"
        >
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ background: "var(--cue-green)" }}
          />
          {p.name} · {p.role}
        </div>
      ))}
    </div>
  );
}

function ShowConsole() {
  const show = useQuery(api.queries.getDemoShow);
  const showId = show?._id;

  // Reactive: live subscriptions, no polling.
  const readiness = useQuery(api.queries.getReadiness, showId ? { showId } : "skip");
  const issues = useQuery(api.queries.listIssues, showId ? { showId } : "skip");
  const voiceLog = useQuery(api.queries.listVoiceLog, showId ? { showId } : "skip");
  const tasks = useQuery(api.queries.listTasks, showId ? { showId } : "skip");
  const presence = useQuery(api.queries.listPresence, showId ? { showId } : "skip");

  const seedDemo = useMutation(api.mutations.seedDemo);
  const resetDemo = useMutation(api.mutations.resetDemo);
  const applySafeChange = useMutation(api.mutations.applySafeChange);
  const transcribeAndRoute = useAction(api.actions.transcribeAndRoute);
  const simulateJamBase = useMutation(api.mutations.simulateJamBaseShortened);
  const updateTaskStatus = useMutation(api.mutations.updateTaskStatus);
  const heartbeat = useMutation(api.mutations.heartbeat);

  const [arloBusy, setArloBusy] = useState(false);

  useEffect(() => {
    if (show === null) {
      seedDemo();
    }
  }, [show, seedDemo]);

  // Presence heartbeat: this client announces itself is on the console.
  // The presence LIST is still read live via listPresence — no polling there.
  useEffect(() => {
    if (!showId) return;
    heartbeat({ showId, name: "You", role: "crew" });
    const interval = setInterval(() => {
      heartbeat({ showId, name: "You", role: "crew" });
    }, 15_000);
    return () => clearInterval(interval);
  }, [showId, heartbeat]);

  if (show === undefined || show === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--gaff-silver)]/60 font-mono-console">
        Loading Cue…
      </div>
    );
  }

  const runKeyboardOut = async () => {
    if (!showId) return;
    setArloBusy(true);
    try {
      await transcribeAndRoute({ showId, command: "the keyboard player is out" });
    } finally {
      setArloBusy(false);
    }
  };

  const runJamBaseShortened = async () => {
    if (!showId) return;
    await simulateJamBase({ showId });
  };

  return (
    <div className="min-h-screen max-w-3xl mx-auto px-5 py-8 flex flex-col gap-6">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-[var(--house-amber)] font-mono-console">
            Cue · Show console
          </div>
          <h1 className="font-display text-2xl text-[var(--gaff-silver)]">
            {show.name}
          </h1>
          <div className="text-sm text-[var(--gaff-silver)]/60">
            {show.artist} · {show.venue}
          </div>
        </div>
        <button
          onClick={() => resetDemo()}
          className="text-xs uppercase tracking-wider font-mono-console text-[var(--gaff-silver)]/50 border border-white/10 rounded-md px-3 py-2 hover:text-[var(--gaff-silver)]"
        >
          Reset demo
        </button>
      </header>

      <ReadinessMeter score={readiness?.score} />

      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Open issues
        </h2>
        <IssueList
          issues={issues ?? []}
          onApply={(issueId) => showId && applySafeChange({ showId, issueId })}
        />
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-4">
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Arlo
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={runKeyboardOut}
            disabled={arloBusy}
            className="flex-1 rounded-lg px-4 py-3 font-medium disabled:opacity-50"
            style={{ background: "var(--house-amber)", color: "var(--stage-black)" }}
          >
            {arloBusy ? "Cascading…" : "Simulate: keyboard player out"}
          </button>
          <button
            onClick={runJamBaseShortened}
            className="flex-1 rounded-lg px-4 py-3 font-medium border border-white/15 text-[var(--gaff-silver)]"
          >
            Simulate: JamBase set shortened
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-2 max-h-56 overflow-y-auto">
          {(voiceLog ?? []).map((entry: any) => (
            <div key={entry._id} className="text-sm">
              <span
                className="font-mono-console text-xs uppercase mr-2"
                style={{
                  color: entry.speaker === "arlo" ? "var(--house-amber)" : "var(--gaff-silver)",
                }}
              >
                {entry.speaker}
              </span>
              <span className="text-[var(--gaff-silver)]/80">{entry.text}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-4">
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Crew on console
        </h2>
        <PresenceRow presence={presence ?? []} />
      </section>

      <section className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-4">
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Task board
        </h2>
        <TaskBoard
          tasks={tasks ?? []}
          onStatusChange={(taskId, status) => updateTaskStatus({ taskId, status })}
        />
      </section>
    </div>
  );
}

const TABS = [
  { key: "ops" as const, label: "Festival ops" },
  { key: "fan" as const, label: "Fan guide" },
  { key: "show" as const, label: "Show console" },
];

function App() {
  const [tab, setTab] = useState<"ops" | "fan" | "show">("ops");

  return (
    <div>
      <div className="sticky top-0 z-20 border-b border-white/10 bg-[var(--stage-black)]/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-5 flex gap-1 py-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="text-xs font-mono-console uppercase tracking-wider px-3 py-2 rounded-md"
              style={{
                color: tab === t.key ? "var(--stage-black)" : "var(--gaff-silver)",
                background: tab === t.key ? "var(--house-amber)" : "transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tab === "ops" ? <BackstageOps /> : tab === "fan" ? <FanGuide /> : <ShowConsole />}
    </div>
  );
}

export default App;
