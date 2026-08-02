import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import FestivalMapView from "./FestivalMapView";

const LEVEL_COLOR: Record<string, string> = {
  low: "var(--cue-green)",
  medium: "var(--house-amber)",
  high: "var(--house-amber)",
  critical: "var(--fault-red)",
};

const ZONE_ICON: Record<string, string> = {
  entry: "⛩",
  stage: "♪",
  backstage: "▤",
  green_room: "◍",
  foh: "◈",
  restroom: "🚻",
  food_drink: "🍔",
};

function FestivalMap({
  zones,
  selected,
  onSelect,
}: {
  zones: any[];
  selected: Id<"zones"> | null;
  onSelect: (id: Id<"zones">) => void;
}) {
  return (
    <div
      className="relative w-full rounded-2xl border border-white/10 overflow-hidden"
      style={{
        aspectRatio: "5 / 4",
        paddingBottom: 8,
        background:
          "radial-gradient(ellipse at 50% 100%, rgba(232,163,61,0.08), transparent 60%), var(--stage-black)",
        backgroundImage:
          "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
        backgroundSize: "8% 8%",
      }}
    >
      {zones.map((zone) => {
        const size = 34 + Math.min(46, (zone.capacity / 600) * 46);
        const color = LEVEL_COLOR[zone.level];
        const isSelected = zone._id === selected;
        return (
          <button
            key={zone._id}
            onClick={() => onSelect(zone._id)}
            className={`absolute flex flex-col items-center justify-center rounded-full transition-transform ${
              zone.level === "critical" ? "meter-flare" : ""
            }`}
            style={{
              left: `${zone.x}%`,
              top: `${zone.y}%`,
              width: size,
              height: size,
              transform: `translate(-50%, -50%) scale(${isSelected ? 1.12 : 1})`,
              background: "rgba(26,29,34,0.9)",
              border: `2px solid ${color}`,
              boxShadow: `0 0 ${zone.level === "critical" ? 22 : zone.level === "high" ? 14 : 6}px ${color}`,
              zIndex: isSelected ? 10 : 1,
            }}
            title={`${zone.name} — ${zone.count}/${zone.capacity}`}
          >
            <span className="text-sm" style={{ color }}>
              {ZONE_ICON[zone.kind] ?? "●"}
            </span>
            {zone.understaffed && (
              <span
                className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                style={{ background: "var(--fault-red)", boxShadow: "0 0 6px var(--fault-red)" }}
              />
            )}
          </button>
        );
      })}
      {zones.map((zone) => {
        const size = 34 + Math.min(46, (zone.capacity / 600) * 46);
        return (
        <div
          key={`label-${zone._id}`}
          className="absolute font-mono-console text-[10px] uppercase tracking-wider text-[var(--gaff-silver)]/60 pointer-events-none"
          style={{
            left: `${zone.x}%`,
            top: `${zone.y}%`,
            transform: `translate(-50%, ${size / 2 + 10}px)`,
            whiteSpace: "nowrap",
          }}
        >
          {zone.name}
        </div>
        );
      })}
    </div>
  );
}

function ZoneDetail({
  zone,
  volunteers,
  onAssign,
}: {
  zone: any;
  volunteers: any[];
  onAssign: (volunteerId: Id<"volunteers">, zoneId: Id<"zones">) => void;
}) {
  const available = volunteers.filter((v) => v.status === "available");
  const assigned = volunteers.filter((v) => v.zoneId === zone._id);
  return (
    <div className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div>
          <div className="font-display text-lg text-[var(--gaff-silver)]">{zone.name}</div>
          <div className="text-xs font-mono-console uppercase tracking-wider text-[var(--gaff-silver)]/50">
            {zone.kind.replace("_", " ")}
          </div>
        </div>
        <div
          className="font-display font-bold tabular-nums"
          style={{ fontSize: 40, color: LEVEL_COLOR[zone.level] }}
        >
          {zone.count}
          <span className="text-sm text-[var(--gaff-silver)]/40 font-mono-console"> /{zone.capacity}</span>
        </div>
      </div>

      <div
        className="text-xs font-mono-console uppercase tracking-wider px-2 py-1 rounded-md self-start"
        style={{
          color: LEVEL_COLOR[zone.level],
          border: `1px solid ${LEVEL_COLOR[zone.level]}`,
        }}
      >
        {zone.level} density
      </div>

      <div className="text-sm text-[var(--gaff-silver)]/80">
        {zone.assignedVolunteers} of {zone.neededVolunteers} volunteers assigned.{" "}
        {zone.understaffed ? "Needs more hands." : "Covered."}
      </div>

      {assigned.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {assigned.map((v) => (
            <span
              key={v._id}
              className="text-xs font-mono-console rounded-full border border-white/10 px-2 py-1 text-[var(--gaff-silver)]/70"
            >
              {v.name}
            </span>
          ))}
        </div>
      )}

      {zone.understaffed && available.length > 0 && (
        <div className="flex flex-col gap-2 pt-1">
          <div className="text-xs font-mono-console uppercase tracking-wider text-[var(--gaff-silver)]/50">
            Assign available volunteer
          </div>
          <div className="flex flex-wrap gap-2">
            {available.map((v) => (
              <button
                key={v._id}
                onClick={() => onAssign(v._id, zone._id)}
                className="text-xs rounded-md px-2.5 py-1.5 font-medium"
                style={{ background: "var(--house-amber)", color: "var(--stage-black)" }}
              >
                + {v.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const ARTIST_STATUS_COLOR: Record<string, string> = {
  not_arrived: "var(--gaff-silver)",
  arrived: "var(--house-amber)",
  soundcheck: "var(--house-amber)",
  ready: "var(--cue-green)",
};
const ARTIST_STATUS_NEXT: Record<string, "not_arrived" | "arrived" | "soundcheck" | "ready"> = {
  not_arrived: "arrived",
  arrived: "soundcheck",
  soundcheck: "ready",
  ready: "not_arrived",
};

function ArtistRoster({
  artists,
  onAdvance,
}: {
  artists: any[];
  onAdvance: (id: Id<"lineupArtists">, status: any) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {artists.map((a) => (
        <div
          key={a._id}
          className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
        >
          <div className="min-w-0">
            <div className="text-sm text-[var(--gaff-silver)] truncate">{a.name}</div>
            <div className="text-xs font-mono-console text-[var(--gaff-silver)]/50">
              {a.stageName} · in via {a.entryName} ·{" "}
              {new Date(a.setTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
          <button
            onClick={() => onAdvance(a._id, ARTIST_STATUS_NEXT[a.status])}
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-mono-console uppercase tracking-wider"
            style={{
              color: ARTIST_STATUS_COLOR[a.status],
              border: `1px solid ${ARTIST_STATUS_COLOR[a.status]}`,
            }}
          >
            {a.status.replace("_", " ")}
          </button>
        </div>
      ))}
    </div>
  );
}

export default function BackstageOps() {
  const festival = useQuery(api.backstage.getFestival);
  const festivalId = festival?._id;

  const zones = useQuery(
    api.backstage.listZoneStatus,
    festivalId ? { festivalId } : "skip"
  );
  const artists = useQuery(
    api.backstage.listArtists,
    festivalId ? { festivalId } : "skip"
  );
  const volunteers = useQuery(
    api.backstage.listVolunteers,
    festivalId ? { festivalId } : "skip"
  );

  const seedFestival = useMutation(api.backstage.seedFestival);
  const resetFestival = useMutation(api.backstage.resetFestival);
  const assignVolunteer = useMutation(api.backstage.assignVolunteer);
  const updateArtistStatus = useMutation(api.backstage.updateArtistStatus);

  const [selectedZone, setSelectedZone] = useState<Id<"zones"> | null>(null);

  useEffect(() => {
    if (festival === null) seedFestival();
  }, [festival, seedFestival]);

  if (festival === undefined || festival === null || !zones || !artists || !volunteers) {
    return (
      <div className="loading-state">
        Loading festival operations…
      </div>
    );
  }

  const activeZone = zones.find((z) => z._id === selectedZone) ?? zones[0];
  const understaffedCount = zones.filter((z) => z.understaffed).length;
  const availableVolunteers = volunteers.filter((v) => v.status === "available").length;

  return (
    <div className="crew-overview">
      <header className="screen-heading">
        <div>
          <div className="eyebrow">
            Festival overview
          </div>
          <h2>{festival.name}</h2>
          <div className="muted-copy">
            {zones.length} zones · {understaffedCount} need volunteers · {availableVolunteers}{" "}
            available
          </div>
        </div>
        <button
          onClick={() => resetFestival()}
          className="quiet-button"
        >
          Reset demo
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {zones.every((z) => z.lat != null && z.lng != null) ? (
          <FestivalMapView zones={zones} selected={activeZone?._id ?? null} onSelect={setSelectedZone} />
        ) : (
          <FestivalMap zones={zones} selected={activeZone?._id ?? null} onSelect={setSelectedZone} />
        )}
        {activeZone && (
          <ZoneDetail
            zone={activeZone}
            volunteers={volunteers}
            onAssign={(volunteerId, zoneId) => assignVolunteer({ volunteerId, zoneId })}
          />
        )}
      </div>

      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Zones needing volunteers
        </h2>
        {understaffedCount === 0 ? (
          <div className="rounded-xl border border-white/10 bg-[var(--console-graphite)] p-6 text-[var(--gaff-silver)]/70">
            Every zone is covered.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {zones
              .filter((z) => z.understaffed)
              .map((z) => (
                <div
                  key={z._id}
                  className="issue-enter flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2"
                  style={{ borderLeft: `4px solid ${LEVEL_COLOR[z.level]}` }}
                >
                  <div>
                    <div className="text-sm text-[var(--gaff-silver)]">{z.name}</div>
                    <div className="text-xs font-mono-console text-[var(--gaff-silver)]/50">
                      {z.count}/{z.capacity} · {z.assignedVolunteers}/{z.neededVolunteers} volunteers
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedZone(z._id)}
                    className="text-xs rounded-md px-3 py-1.5 font-mono-console uppercase tracking-wider border border-white/15 text-[var(--gaff-silver)]"
                  >
                    View
                  </button>
                </div>
              ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.25em] text-[var(--gaff-silver)]/50 font-mono-console mb-3">
          Artist lineup
        </h2>
        <ArtistRoster
          artists={artists}
          onAdvance={(id, status) => updateArtistStatus({ artistId: id, status })}
        />
      </section>
    </div>
  );
}
