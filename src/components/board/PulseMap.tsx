"use client";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import { HOOD_COORDS } from "@/lib/geo";

export interface PulseRow { neighborhood: string; open: number; total: number; critical?: number }

// Frame every neighborhood Relay knows, so no circle can fall outside the map.
const COORDS = Object.values(HOOD_COORDS);
const BOUNDS: [[number, number], [number, number]] = [
  [Math.min(...COORDS.map((c) => c[0])), Math.min(...COORDS.map((c) => c[1]))],
  [Math.max(...COORDS.map((c) => c[0])), Math.max(...COORDS.map((c) => c[1]))],
];

/** Proportional circles: area follows all requests, the number inside is how many are still open. */
export default function PulseMap({ rows, className = "", selected, onSelect }: { rows: PulseRow[]; className?: string; selected?: string | null; onSelect?: (h: string) => void }) {
  const max = Math.max(1, ...rows.map((r) => r.total));
  // Largest first, so a small circle is never hidden under a big neighbour.
  const ordered = [...rows].sort((a, b) => b.total - a.total);
  return (
    <MapContainer bounds={BOUNDS} boundsOptions={{ padding: [30, 30] }} zoomControl={false} zoomSnap={0.1} scrollWheelZoom={false} dragging={false} doubleClickZoom={false} attributionControl={false} className={`h-full w-full ${className}`}>
      <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {ordered.map((r) => {
        const c = HOOD_COORDS[r.neighborhood];
        if (!c) return null;
        const radius = 8 + Math.sqrt(r.total / max) * 11;
        const isSel = selected === r.neighborhood;
        return [
          <CircleMarker key={`${r.neighborhood}-dot`} center={c} radius={radius} interactive={false}
            pathOptions={{ color: isSel ? "#111827" : "#ffffff", weight: isSel ? 3 : 1.5, fillColor: (r.critical ?? 0) > 0 ? "#dc2626" : "#0b93d5", fillOpacity: 0.92 }}>
            {r.open > 0 && <Tooltip permanent direction="center" className="pulse-count">{r.open}</Tooltip>}
          </CircleMarker>,
          // Invisible hit target on top: carries the hover name and the click, so the count label stays put.
          <CircleMarker key={`${r.neighborhood}-hit`} center={c} radius={radius} pathOptions={{ stroke: false, fillOpacity: 0 }}
            eventHandlers={onSelect ? { click: () => onSelect(r.neighborhood) } : undefined}>
            <Tooltip direction="top" offset={[0, -radius]} opacity={1} className="!bg-surface !text-ink !border-line !rounded-md !shadow-sm !text-[12px]">{r.neighborhood}: {r.open} open of {r.total}</Tooltip>
          </CircleMarker>,
        ];
      })}
    </MapContainer>
  );
}
