import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import type { Id } from "../convex/_generated/dataModel";
import "leaflet/dist/leaflet.css";

const LEVEL_COLOR: Record<string, string> = {
  low: "#7ed6a5",
  medium: "#ffda38",
  high: "#ffda38",
  critical: "#ff7166",
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

// Real venue map (OpenStreetMap tiles) for festivals with real GPS zone
// coordinates. Falls back to the abstract grid (FestivalMap) when a zone
// hasn't been geo-placed yet.
export default function FestivalMapView({
  zones,
  selected,
  onSelect,
}: {
  zones: any[];
  selected: Id<"zones"> | null;
  onSelect: (id: Id<"zones">) => void;
}) {
  const center = useMemo((): [number, number] => {
    const lats = zones.map((z) => z.lat);
    const lngs = zones.map((z) => z.lng);
    return [
      lats.reduce((a, b) => a + b, 0) / lats.length,
      lngs.reduce((a, b) => a + b, 0) / lngs.length,
    ];
  }, [zones]);

  return (
    <div className="relative w-full rounded-2xl border border-white/10 overflow-hidden" style={{ aspectRatio: "5 / 4" }}>
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom={false}
        style={{ width: "100%", height: "100%", background: "var(--stage-black)" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; OpenStreetMap contributors &copy; CARTO'
        />
        {zones.map((zone) => {
          const color = LEVEL_COLOR[zone.level];
          const isSelected = zone._id === selected;
          const radius = 10 + Math.min(14, (zone.capacity / 600) * 14) + (isSelected ? 4 : 0);
          return (
            <CircleMarker
              key={zone._id}
              center={[zone.lat, zone.lng]}
              radius={radius}
              pathOptions={{
                color,
                weight: isSelected ? 3 : 2,
                fillColor: "#1a1d22",
                fillOpacity: 0.9,
              }}
              eventHandlers={{ click: () => onSelect(zone._id) }}
            >
              <Tooltip direction="top" offset={[0, -radius]} opacity={1} permanent>
                <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 10, textTransform: "uppercase" }}>
                  {ZONE_ICON[zone.kind] ?? "●"} {zone.name}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}
