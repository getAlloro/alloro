import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import {
  type CuratedCompetitor,
  type PracticeLocationRef,
} from "../../../api/practiceRanking";
import {
  makeCompetitorIcon,
  makePracticeIcon,
  getRadiusBounds,
} from "../locationCompetitorOnboarding.utils";

// The map wrapper's height now tracks the competitor-list column (grid
// stretch), so the container resizes as rows are added/removed. Leaflet
// only measures its canvas once — observe the container and re-measure,
// otherwise tiles go stale/blank in the newly exposed area.
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Imperatively pan/zoom to fit the supplied points whenever they change.
// `react-leaflet` doesn't expose a declarative bounds prop on MapContainer
// after first render, so this helper rides inside the map context.
function FitBoundsOnChange({
  points,
  radiusCenter,
  radiusMeters,
}: {
  points: [number, number][];
  radiusCenter?: [number, number] | null;
  radiusMeters?: number;
}) {
  const map = useMap();
  // Stable serialization keeps useEffect from re-running on object identity churn.
  const key = useMemo(
    () =>
      [
        points.map((p) => p.join(",")).join("|"),
        radiusCenter?.join(",") ?? "",
        radiusMeters ?? "",
      ].join(":"),
    [points, radiusCenter, radiusMeters]
  );
  useEffect(() => {
    if (points.length === 0) return;
    if (radiusCenter && radiusMeters) {
      const bounds = getRadiusBounds(radiusCenter, radiusMeters);
      points.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds, { padding: [28, 28] });
      return;
    }
    if (points.length === 1) {
      map.setView(points[0], 14);
      return;
    }
    map.fitBounds(points, { padding: [40, 40] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function PanToSelectedPin({
  competitor,
}: {
  competitor: (CuratedCompetitor & { lat: number; lng: number }) | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!competitor) return;
    map.flyTo(
      [competitor.lat, competitor.lng],
      Math.max(map.getZoom(), 12),
      { duration: 0.45 }
    );
  }, [competitor, map]);
  return null;
}

function AnimatedRadiusCircle({
  center,
  radiusMeters,
}: {
  center: [number, number];
  radiusMeters: number;
}) {
  const map = useMap();
  const circleRef = useRef<L.Circle | null>(null);
  const previousRadiusRef = useRef(radiusMeters);
  const centerLat = center[0];
  const centerLng = center[1];

  useEffect(() => {
    const circle = L.circle([centerLat, centerLng], {
      radius: previousRadiusRef.current,
      color: "#D66853",
      weight: 2,
      opacity: 0.6,
      fillColor: "#D66853",
      fillOpacity: 0.12,
      interactive: false,
    }).addTo(map);
    circleRef.current = circle;
    return () => {
      circle.removeFrom(map);
      circleRef.current = null;
    };
  }, [centerLat, centerLng, map]);

  useEffect(() => {
    const circle = circleRef.current;
    if (!circle) return;

    circle.setLatLng([centerLat, centerLng]);
    circle.setStyle({
      color: "#D66853",
      fillColor: "#D66853",
      fillOpacity: 0.12,
      opacity: 0.6,
    });

    const from = previousRadiusRef.current;
    const to = radiusMeters;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const t = Math.min((now - startedAt) / 520, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      circle.setRadius(from + (to - from) * eased);
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        previousRadiusRef.current = to;
      }
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [centerLat, centerLng, radiusMeters]);

  return null;
}

export function CompetitorMap({
  competitors,
  practiceLocation,
  radiusMeters,
  height,
  showLoadingFallback,
  selectedPlaceId,
  onPinClick,
}: {
  competitors: CuratedCompetitor[];
  practiceLocation: PracticeLocationRef | null;
  radiusMeters?: number;
  /** Fixed pixel height. When omitted, fills parent (parent must have a height). */
  height?: number;
  showLoadingFallback?: boolean;
  selectedPlaceId?: string | null;
  onPinClick?: (placeId: string) => void;
}) {
  const heightStyle: React.CSSProperties =
    height !== undefined ? { height: `${height}px` } : { height: "100%" };
  const withCoords = useMemo(
    () =>
      competitors.filter(
        (c): c is CuratedCompetitor & { lat: number; lng: number } =>
          typeof c.lat === "number" && typeof c.lng === "number"
      ),
    [competitors]
  );

  const points = useMemo<[number, number][]>(() => {
    const arr: [number, number][] = withCoords.map((c) => [c.lat, c.lng]);
    if (practiceLocation) arr.push([practiceLocation.lat, practiceLocation.lng]);
    return arr;
  }, [withCoords, practiceLocation]);
  const selectedCompetitor = useMemo(
    () => withCoords.find((c) => c.placeId === selectedPlaceId) ?? null,
    [selectedPlaceId, withCoords]
  );

  // Pre-Leaflet shimmer fallback for the brief discovery window when no
  // coordinates have arrived yet. Once we have any point, render the real map.
  if (points.length === 0) {
    return (
      <div
        className="relative bg-gradient-to-br from-alloro-bg to-slate-50 overflow-hidden"
        style={heightStyle}
      >
        {showLoadingFallback && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="absolute rounded-full border-2 border-alloro-orange/40"
                style={{ left: "50%", top: "50%" }}
                initial={{ width: 0, height: 0, x: 0, y: 0, opacity: 0.8 }}
                animate={{
                  width: 360,
                  height: 360,
                  x: -180,
                  y: -180,
                  opacity: 0,
                }}
                transition={{
                  duration: 2.4,
                  delay: i * 0.8,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
              />
            ))}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="w-12 h-12 rounded-full bg-alloro-orange text-white flex items-center justify-center shadow-xl">
                <Loader2 size={20} className="animate-spin" />
              </div>
            </div>
            <div className="absolute left-1/2 bottom-10 -translate-x-1/2 z-10">
              <span className="text-[10px] font-black text-alloro-textDark/50 uppercase tracking-widest">
                Scanning Google for nearby practices…
              </span>
            </div>
          </>
        )}
      </div>
    );
  }

  const initialCenter: [number, number] = points[0];
  const radiusCenter: [number, number] | null = practiceLocation
    ? [practiceLocation.lat, practiceLocation.lng]
    : null;

  return (
    <div
      className="relative bg-gradient-to-br from-alloro-bg to-slate-50 overflow-hidden"
      style={heightStyle}
    >
      <MapContainer
        center={initialCenter}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          subdomains="abcd"
        />
        <InvalidateOnResize />
        <FitBoundsOnChange
          points={points}
          radiusCenter={radiusCenter}
          radiusMeters={radiusMeters}
        />
        <PanToSelectedPin competitor={selectedCompetitor} />
        {radiusCenter && radiusMeters && (
          <AnimatedRadiusCircle
            center={radiusCenter}
            radiusMeters={radiusMeters}
          />
        )}
        {withCoords.map((c, i) => {
          const isSelected = selectedPlaceId === c.placeId;
          return (
            <Marker
              key={c.placeId}
              position={[c.lat, c.lng]}
              icon={makeCompetitorIcon(i, isSelected)}
              zIndexOffset={isSelected ? 1000 : 0}
              eventHandlers={
                onPinClick ? { click: () => onPinClick(c.placeId) } : undefined
              }
            />
          );
        })}
        {practiceLocation && (
          <Marker
            position={[practiceLocation.lat, practiceLocation.lng]}
            icon={makePracticeIcon()}
            zIndexOffset={500}
            interactive={false}
          />
        )}
      </MapContainer>
    </div>
  );
}
