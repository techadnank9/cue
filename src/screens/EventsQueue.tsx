import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import BrandButton from "../components/BrandButton";
import CueLogo from "../components/CueLogo";

type FestivalEvent = {
  _id: string;
  jambaseId: string;
  name: string;
  startDate: string;
  venueName: string;
  city: string;
  region?: string;
  country: string;
  distanceMiles: number;
  headliners: string[];
  jambaseUrl: string;
  heroImage?: string;
  hasOpsExperience: boolean;
};

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EventsQueue({ onEnterOps }: { onEnterOps: () => void }) {
  const events = useQuery(api.events.listFestivalEventsByDistance) as
    | FestivalEvent[]
    | undefined;
  const [selected, setSelected] = useState<FestivalEvent | null>(null);

  if (selected) {
    return <EventDetail event={selected} onBack={() => setSelected(null)} onEnterOps={onEnterOps} />;
  }

  return (
    <main className="role-screen events-queue">
      <div className="role-screen__brand"><CueLogo surface="dark" /></div>
      <section className="role-panel" aria-labelledby="events-heading">
        <p className="eyebrow">Live from JamBase</p>
        <h1 id="events-heading">What's happening near you</h1>
        <p className="role-panel__intro">
          Real festivals, sorted by distance from Cue's home base in San Francisco.
        </p>
        {!events && <p className="events-queue__loading">Loading real event data…</p>}
        <div className="events-queue__list">
          {events?.map((ev, i) => (
            <button
              key={ev._id}
              className="event-card"
              onClick={() => setSelected(ev)}
            >
              {i === 0 && <span className="event-card__badge">Top priority — near you</span>}
              <div className="event-card__main">
                <h2>{ev.name}</h2>
                <p className="event-card__meta">
                  {formatDate(ev.startDate)} · {ev.venueName}, {ev.city}
                  {ev.region ? `, ${ev.region}` : ""}
                </p>
                <p className="event-card__headliners">{ev.headliners.join(" · ")}</p>
              </div>
              <div className="event-card__distance">
                <strong>{ev.distanceMiles}</strong>
                <span>mi away</span>
              </div>
            </button>
          ))}
        </div>
        <p className="role-panel__note">
          Data pulled from the JamBase MCP server. Refreshed manually, not a live poll.
        </p>
      </section>
    </main>
  );
}

function EventDetail({
  event,
  onBack,
  onEnterOps,
}: {
  event: FestivalEvent;
  onBack: () => void;
  onEnterOps: () => void;
}) {
  return (
    <main className="role-screen events-queue">
      <div className="role-screen__brand"><CueLogo surface="dark" /></div>
      <section className="role-panel event-detail" aria-labelledby="event-detail-heading">
        <button className="event-detail__back" onClick={onBack}>← All events</button>
        {event.heroImage && (
          <img className="event-detail__hero" src={event.heroImage} alt="" />
        )}
        <p className="eyebrow">{event.distanceMiles} mi from San Francisco</p>
        <h1 id="event-detail-heading">{event.name}</h1>
        <p className="role-panel__intro">
          {formatDate(event.startDate)} · {event.venueName}, {event.city}
          {event.region ? `, ${event.region}` : ""}
        </p>
        <div className="event-detail__headliners">
          {event.headliners.map((h) => (
            <span key={h} className="event-detail__pill">{h}</span>
          ))}
        </div>
        <a
          className="event-detail__link"
          href={event.jambaseUrl}
          target="_blank"
          rel="noreferrer"
        >
          View real listing on JamBase ↗
        </a>
        {event.hasOpsExperience ? (
          <BrandButton className="event-detail__cta" onClick={onEnterOps}>
            Enter Cue for {event.name} <span aria-hidden="true">→</span>
          </BrandButton>
        ) : (
          <p className="event-detail__soon">
            The full Cue ops experience is live for Outside Lands first. Support for
            {" " + event.name} is next.
          </p>
        )}
      </section>
    </main>
  );
}
