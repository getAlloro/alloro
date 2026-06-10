import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "../../../pages/competitor-onboarding/competitor-map.css";
import {
  getLocationCompetitors,
  type CuratedCompetitor,
  type SelectedCompetitorSearchResult,
} from "../../../api/practiceRanking";

/**
 * RankingsMapCard — stylized competitor map for the simplified Local Rankings
 * hub. Reuses the competitor-onboarding leaflet setup (divIcon numbered pins +
 * CARTO voyager tiles + competitor-map.css) and the existing
 * `getLocationCompetitors` endpoint, which returns competitor lat/lng AND the
 * practice's own location in one call.
 *
 * Spec: plans/06102026-local-rankings-simplification/spec.html (T1)
 */

function makeCompetitorIcon(label: number | string): L.DivIcon {
  return L.divIcon({
    className: "alloro-marker-wrapper",
    html: `<div class="alloro-pin alloro-pin-competitor">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function makePracticeIcon(): L.DivIcon {
  return L.divIcon({
    className: "alloro-marker-wrapper",
    html: `<div class="alloro-pin alloro-pin-practice">YOU</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

// Imperatively fit the map to all plotted points (react-leaflet has no
// declarative bounds prop after first render). Mirrors the onboarding map.
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join("|");
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
      return;
    }
    map.fitBounds(points, { padding: [36, 36] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

type MapPoint = { lat: number; lng: number; placeId: string; label: number | string };

const PANEL_HEIGHT = 300;

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="overflow-hidden rounded-[14px] border border-line-soft"
      style={{ height: PANEL_HEIGHT, background: "#EFE9DD" }}
    >
      {children}
    </div>
  );
}

export function RankingsMapCard({
  locationId,
  searchResults,
}: {
  locationId: number | null;
  searchResults: SelectedCompetitorSearchResult[] | null;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["rankingsMapCompetitors", locationId],
    queryFn: () => getLocationCompetitors(locationId as number),
    enabled: locationId != null,
    staleTime: 5 * 60 * 1000,
  });

  // Look up each competitor's sampled local-search position by placeId so the
  // pins are numbered by rank (falls back to list order).
  const positionByPlaceId = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of searchResults ?? []) {
      if (r.placeId && r.position != null) map.set(r.placeId, r.position);
    }
    return map;
  }, [searchResults]);

  const competitors = useMemo<MapPoint[]>(() => {
    const withCoords = (data?.competitors ?? []).filter(
      (c): c is CuratedCompetitor & { lat: number; lng: number } =>
        c.lat != null && c.lng != null,
    );
    return withCoords.map((c, i) => ({
      lat: c.lat,
      lng: c.lng,
      placeId: c.placeId,
      label: positionByPlaceId.get(c.placeId) ?? i + 1,
    }));
  }, [data, positionByPlaceId]);

  const practice = data?.practiceLocation ?? null;

  const points = useMemo<[number, number][]>(() => {
    const pts: [number, number][] = competitors.map((c) => [c.lat, c.lng]);
    if (practice) pts.push([practice.lat, practice.lng]);
    return pts;
  }, [competitors, practice]);

  if (locationId == null) return null;

  if (isLoading) {
    return (
      <Shell>
        <div className="h-full w-full animate-pulse" style={{ background: "#E7E0D2" }} />
      </Shell>
    );
  }

  if (points.length === 0) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center px-6 text-center text-[13px] font-semibold text-alloro-navy/55">
          Competitor locations appear after your next ranking run.
        </div>
      </Shell>
    );
  }

  const center: [number, number] = practice
    ? [practice.lat, practice.lng]
    : points[0];

  return (
    <Shell>
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
        />
        <FitBounds points={points} />
        {competitors.map((c) => (
          <Marker
            key={c.placeId}
            position={[c.lat, c.lng]}
            icon={makeCompetitorIcon(c.label)}
          />
        ))}
        {practice && (
          <Marker
            position={[practice.lat, practice.lng]}
            icon={makePracticeIcon()}
            zIndexOffset={500}
            interactive={false}
          />
        )}
      </MapContainer>
    </Shell>
  );
}

export default RankingsMapCard;
