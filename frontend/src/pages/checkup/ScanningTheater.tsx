import { useEffect, useState, useRef, useCallback } from "react";
import { useLocation, useNavigate, Navigate } from "react-router-dom";
import { Check, Loader2, Star, MessageSquare, Globe, Camera, MapPin as MapPinIcon, Quote } from "lucide-react";
import type { PlaceReview, PlacePhoto } from "../../api/places";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { PlaceDetails } from "../../api/places";
import { analyzeCheckup } from "../../api/checkup";
import type { CheckupAnalysis, CheckupCompetitor } from "../../api/checkup";
import type { CheckupResults } from "./ResultsScreen";
import { trackEvent } from "../../api/tracking";
import {
  isConferenceMode,
  isOfflineConference,
  withTimeout,
  CONFERENCE_ANALYSIS,
  personalizeConferenceFallback,
} from "./conferenceFallback";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TERRACOTTA = "#D56753";
const NAVY = "#212D40";
const MIN_THEATER_MS = 10000; // minimum 10s theater (was 15s, reduced to respect user's time)
const SKIP_VISIBLE_MS = 15000; // show skip button after 15s regardless of API status
const ITEM_INTERVAL_MS = 1800; // ~1.8s per checklist item (snappier progression)

function getChecklistItems(category?: string | null): string[] {
  // Use the detected specialty to personalize the scanning language
  const term = category?.toLowerCase() || "";
  const plural =
    term.includes("barber") ? "barber shops"
    : term.includes("salon") ? "salons"
    : term.includes("spa") ? "med spas"
    : term.includes("ortho") ? "orthodontists"
    : term.includes("endo") ? "endodontists"
    : term.includes("dentist") ? "dental practices"
    : term.includes("chiro") ? "chiropractors"
    : term.includes("vet") ? "veterinary clinics"
    : term.includes("attorney") || term.includes("law") ? "law firms"
    : term.includes("plumb") ? "plumbing companies"
    : term.includes("garden") || term.includes("landscape") ? "landscape designers"
    : term.includes("oculofacial") || term.includes("oculoplastic") ? "oculofacial surgeons"
    : term.includes("photo") ? "photographers"
    : "competitors";

  return [
    "Finding your business...",
    "Scanning Google Business Profile",
    `Finding ${plural} near you`,
    "Counting their reviews",
    "Checking local search results",
    "Measuring online presence",
    "Building your report...",
  ];
}

// ---------------------------------------------------------------------------
// Custom map markers -- SVG-based, no external images
// ---------------------------------------------------------------------------

function createPinIcon(color: string) {
  // 44px minimum tap target for mobile (WCAG 2.5.8)
  return L.divIcon({
    className: "",
    iconSize: [40, 50],
    iconAnchor: [20, 50],
    popupAnchor: [0, -50],
    html: `<svg width="40" height="50" viewBox="0 0 40 50" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 0C8.954 0 0 8.954 0 20c0 15 20 30 20 30s20-15 20-30C40 8.954 31.046 0 20 0z" fill="${color}"/>
      <circle cx="20" cy="20" r="8" fill="white" opacity="0.9"/>
    </svg>`,
  });
}

const practiceIcon = createPinIcon(TERRACOTTA);
const competitorIcon = createPinIcon(NAVY);

function createHighlightedPinIcon(color: string) {
  return L.divIcon({
    className: "",
    iconSize: [48, 58],
    iconAnchor: [24, 58],
    popupAnchor: [0, -58],
    html: `<svg width="48" height="58" viewBox="0 0 48 58" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="24" cy="24" r="22" fill="${color}" opacity="0.15"/>
      <path d="M24 4C14.059 4 6 12.059 6 22c0 16 18 32 18 32s18-16 18-32C42 12.059 33.941 4 24 4z" fill="${color}"/>
      <circle cx="24" cy="22" r="8" fill="white" opacity="0.9"/>
    </svg>`,
  });
}

const highlightedCompetitorIcon = createHighlightedPinIcon(NAVY);

// ---------------------------------------------------------------------------
// Map Animator -- cinematic camera for the scanning theater
// ---------------------------------------------------------------------------

function MapAnimator({
  center,
  competitors,
  highlightIndex,
  scanComplete,
}: {
  center: [number, number];
  competitors: CheckupCompetitor[];
  highlightIndex: number | null;
  scanComplete: boolean;
}) {
  const map = useMap();
  const lastFlyRef = useRef<number>(-1);
  const hasZoomedIn = useRef(false);

  // Phase 1: Cinematic zoom into the practice pin
  useEffect(() => {
    if (hasZoomedIn.current) return;
    hasZoomedIn.current = true;
    map.setView(center, 11, { animate: false });
    setTimeout(() => {
      map.flyTo(center, 14.5, { duration: 3 });
    }, 600);
    // Pull back to neighborhood after close-up
    setTimeout(() => {
      map.flyTo(center, 12.5, { duration: 2.5 });
    }, 5000);
  }, [map, center]);

  // Phase 2: Fly to each competitor as it's revealed
  useEffect(() => {
    if (highlightIndex === null || highlightIndex === lastFlyRef.current) return;
    const comp = competitors[highlightIndex];
    if (!comp?.location) return;
    lastFlyRef.current = highlightIndex;

    // Fly to the competitor
    map.flyTo([comp.location.lat, comp.location.lng], 13.5, { duration: 1.5 });

    // Pull back to show all revealed pins
    const timer = setTimeout(() => {
      if (competitors.length > 1) {
        const allPoints = [
          center,
          ...competitors
            .slice(0, highlightIndex + 1)
            .filter((c) => c.location)
            .map((c) => [c.location!.lat, c.location!.lng] as [number, number]),
        ];
        const bounds = L.latLngBounds(allPoints);
        map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 13, duration: 2 });
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [highlightIndex, competitors, map, center]);

  // Phase 3: Final pull-back to show full market
  useEffect(() => {
    if (!scanComplete || competitors.length === 0) return;
    const timer = setTimeout(() => {
      const allPoints = [
        center,
        ...competitors
          .filter((c) => c.location)
          .map((c) => [c.location!.lat, c.location!.lng] as [number, number]),
      ];
      const bounds = L.latLngBounds(allPoints);
      map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 12, duration: 2.5 });
    }, 800);
    return () => clearTimeout(timer);
  }, [scanComplete, competitors, map, center]);

  return null;
}

// ---------------------------------------------------------------------------
// Checklist Item
// ---------------------------------------------------------------------------

function ChecklistItem({
  text,
  state,
}: {
  text: string;
  state: "pending" | "active" | "done";
}) {
  return (
    <div
      className={`flex items-center gap-3 transition-all duration-500 ${
        state === "pending" ? "opacity-30" : "opacity-100"
      }`}
    >
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-500 ${
          state === "done"
            ? "bg-[#D56753]"
            : state === "active"
              ? "bg-[#D56753]/20 ring-2 ring-[#D56753]/40"
              : "bg-slate-200"
        }`}
      >
        {state === "done" && <Check className="w-3.5 h-3.5 text-white" />}
        {state === "active" && (
          <Loader2 className="w-3.5 h-3.5 text-[#D56753] animate-spin" />
        )}
      </div>
      <span
        className={`text-sm transition-all duration-500 ${
          state === "done"
            ? "text-slate-900 font-medium"
            : state === "active"
              ? "text-slate-900 font-medium"
              : "text-slate-400"
        }`}
      >
        {text}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unified Discovery Feed -- business data first, then competitors with map pins
// ---------------------------------------------------------------------------

interface FeedItem {
  type: "data" | "competitor" | "oz";
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  competitorIndex?: number; // index into competitors array
}

const OZ_TEASER_LINES = [
  "Analyzing review response patterns...",
  "Scanning competitor posting activity...",
  "Checking Saturday availability across market...",
];

function buildBusinessDataItems(place: PlaceDetails): FeedItem[] {
  const items: FeedItem[] = [];
  if (place.rating) {
    items.push({ type: "data", icon: Star, label: "Rating found", value: `${place.rating}★` });
  }
  if (place.reviewCount > 0) {
    items.push({ type: "data", icon: MessageSquare, label: "Reviews detected", value: `${place.reviewCount} reviews` });
  }
  if (place.websiteUri) {
    let hostname = place.websiteUri;
    try { hostname = new URL(place.websiteUri).hostname; } catch { /* malformed URL, show raw */ }
    items.push({ type: "data", icon: Globe, label: "Website found", value: hostname });
  } else {
    items.push({ type: "data", icon: Globe, label: "Website", value: "Not found" });
  }
  if (place.category) {
    items.push({ type: "data", icon: Camera, label: "Category", value: place.category });
  }
  return items;
}

function buildCompetitorItems(competitors: CheckupCompetitor[]): FeedItem[] {
  return competitors.slice(0, 5).map((c, i) => ({
    type: "competitor" as const,
    icon: MapPinIcon,
    label: c.name,
    value: `${c.rating}★ · ${c.reviewCount} reviews`,
    competitorIndex: i,
  }));
}

function DiscoveryFeed({
  place,
  competitors,
  apiDone,
  onRevealCompetitor,
  highlightedCompetitorIndex,
}: {
  place: PlaceDetails;
  competitors: CheckupCompetitor[];
  apiDone: boolean;
  onRevealCompetitor: (index: number) => void;
  highlightedCompetitorIndex: number | null;
}) {
  const [visibleBusinessItems, setVisibleBusinessItems] = useState(0);
  const [visibleCompetitorItems, setVisibleCompetitorItems] = useState(0);
  const [visibleOzLines, setVisibleOzLines] = useState(0);
  const businessItems = useRef(buildBusinessDataItems(place)).current;
  const competitorItems = useRef<FeedItem[]>([]);

  // Update competitor items when API returns
  useEffect(() => {
    if (apiDone && competitors.length > 0) {
      competitorItems.current = buildCompetitorItems(competitors);
    }
  }, [apiDone, competitors]);

  // Reveal business data items progressively
  useEffect(() => {
    const timers = businessItems.map((_, i) =>
      setTimeout(() => setVisibleBusinessItems(i + 1), 2000 + i * 2000)
    );
    return () => timers.forEach(clearTimeout);
  }, [businessItems]);

  // Reveal competitor items progressively once API is done and business data shown
  useEffect(() => {
    if (!apiDone || competitors.length === 0) return;
    const compItems = buildCompetitorItems(competitors);
    competitorItems.current = compItems;

    // Start after business data is mostly revealed
    const timers = compItems.map((_, i) =>
      setTimeout(() => {
        setVisibleCompetitorItems(i + 1);
        onRevealCompetitor(i);
      }, 1200 * (i + 1))
    );
    return () => timers.forEach(clearTimeout);
  }, [apiDone, competitors, businessItems.length, onRevealCompetitor]);

  // Reveal Oz teaser lines after competitors are shown (or after business data if no competitors)
  useEffect(() => {
    if (!apiDone) return;
    // Wait for competitors to finish revealing, or if none, after business data
    const compCount = competitors.length > 0 ? Math.min(5, competitors.length) : 0;
    const baseDelay = compCount > 0 ? compCount * 1200 + 800 : businessItems.length * 2000 + 800;
    const timers = OZ_TEASER_LINES.map((_, i) =>
      setTimeout(() => setVisibleOzLines(i + 1), baseDelay + i * 2500)
    );
    return () => timers.forEach(clearTimeout);
  }, [apiDone, competitors.length, businessItems.length]);

  return (
    <div className="space-y-1.5 mt-5 pt-5 border-t border-slate-100 max-h-[220px] overflow-y-auto">
      {/* Business data section */}
      <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">
        Your Profile
      </p>
      {businessItems.slice(0, visibleBusinessItems).map((item, i) => (
        <div
          key={`biz-${i}`}
          className="flex items-center gap-2.5 text-xs py-1 animate-in fade-in slide-in-from-left-2 duration-300"
        >
          <item.icon className="w-3.5 h-3.5 text-[#D56753] shrink-0" />
          <span className="text-slate-500">{item.label}</span>
          <span className="ml-auto font-semibold text-[#1A1D23] text-right break-words max-w-[160px]">{item.value}</span>
        </div>
      ))}
      {visibleBusinessItems === 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Scanning profile data...
        </div>
      )}

      {/* Competitors section */}
      {visibleCompetitorItems > 0 && (
        <>
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mt-3 mb-2">
            Competitors Found
          </p>
          {competitorItems.current.slice(0, visibleCompetitorItems).map((item, i) => {
            const isHighlighted = highlightedCompetitorIndex === i;
            return (
              <div
                key={`comp-${i}`}
                className={`flex items-center gap-2.5 text-xs py-1.5 px-2 -mx-2 rounded-lg transition-all duration-500 animate-in fade-in slide-in-from-left-2 ${
                  isHighlighted ? "bg-[#212D40]/5" : ""
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                  isHighlighted ? "bg-[#212D40]" : "bg-[#212D40]/20"
                }`}>
                  <span className="text-xs font-semibold text-white leading-none">{i + 1}</span>
                </div>
                <span className={`font-semibold break-words max-w-[140px] ${isHighlighted ? "text-[#1A1D23]" : "text-slate-600"}`}>
                  {item.label}
                </span>
                <span className="ml-auto text-slate-400 text-right break-words max-w-[120px]">{item.value}</span>
              </div>
            );
          })}
        </>
      )}

      {/* Searching for competitors indicator */}
      {apiDone && visibleCompetitorItems === 0 && competitors.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-1 mt-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Mapping competitors...
        </div>
      )}

      {/* Oz teaser findings -- build anticipation for the results page */}
      {visibleOzLines > 0 && (
        <>
          <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mt-3 mb-2">
            Deep Analysis
          </p>
          {OZ_TEASER_LINES.slice(0, visibleOzLines).map((line, i) => (
            <div
              key={`oz-${i}`}
              className="flex items-center gap-2.5 text-xs py-1 animate-in fade-in slide-in-from-left-2 duration-500"
            >
              <Loader2 className={`w-3.5 h-3.5 shrink-0 ${i < visibleOzLines - 1 ? "text-emerald-500" : "text-[#D56753] animate-spin"}`} />
              <span className={`${i < visibleOzLines - 1 ? "text-slate-600" : "text-slate-500"}`}>
                {line}
              </span>
              {i < visibleOzLines - 1 && (
                <Check className="w-3 h-3 text-emerald-500 ml-auto shrink-0" />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Review Ticker -- real reviews scroll through during scan
// ---------------------------------------------------------------------------

function ReviewTicker({ reviews }: { reviews: PlaceReview[] }) {
  const [visibleIndex, setVisibleIndex] = useState(-1);

  useEffect(() => {
    if (reviews.length === 0) return;
    // Show first review after 3s, then rotate every 3s
    const timers = reviews.slice(0, 4).map((_, i) =>
      setTimeout(() => setVisibleIndex(i), 3000 + i * 3500)
    );
    return () => timers.forEach(clearTimeout);
  }, [reviews]);

  if (reviews.length === 0 || visibleIndex < 0) return null;
  const review = reviews[visibleIndex];
  if (!review) return null;

  return (
    <div
      key={visibleIndex}
      className="mt-3 bg-slate-50 rounded-lg p-3 animate-in fade-in slide-in-from-bottom-1 duration-500"
    >
      <div className="flex items-start gap-2">
        <Quote className="w-3 h-3 text-[#D56753] shrink-0 mt-0.5 rotate-180" />
        <div className="min-w-0">
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
            {review.text || `${review.rating}-star review`}
          </p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="flex">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star
                  key={i}
                  className={`w-2.5 h-2.5 ${i < review.rating ? "text-amber-400 fill-amber-400" : "text-slate-200"}`}
                />
              ))}
            </div>
            <span className="text-xs text-slate-400">{review.authorName}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photo Strip -- real GBP photos appear during scan
// ---------------------------------------------------------------------------

function PhotoStrip({ photos }: { photos: PlacePhoto[] }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (photos.length === 0) return;
    // Reveal photos one by one starting at 5s
    const timers = photos.slice(0, 4).map((_, i) =>
      setTimeout(() => setVisibleCount(i + 1), 5000 + i * 2000)
    );
    return () => timers.forEach(clearTimeout);
  }, [photos]);

  if (photos.length === 0 || visibleCount === 0) return null;

  return (
    <div className="mt-3">
      <p className="text-xs font-semibold tracking-widest text-slate-400 uppercase mb-2">
        Your Google Photos
      </p>
      <div className="flex gap-1.5 overflow-hidden">
        {photos.slice(0, visibleCount).map((photo, i) => (
          <div
            key={i}
            className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-slate-100 animate-in fade-in zoom-in-90 duration-500"
          >
            <img
              src={photo.url}
              alt=""
              className="w-full h-full object-cover"
              loading="eager"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Radar Pulse -- CSS overlay on the map that pulses from center
// ---------------------------------------------------------------------------

function RadarPulse({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-[500] flex items-center justify-center">
      <div className="relative">
        <div className="absolute -inset-4 w-32 h-32 rounded-full border-2 border-[#D56753]/20 animate-[radar_2s_ease-out_infinite]" />
        <div className="absolute -inset-4 w-32 h-32 rounded-full border-2 border-[#D56753]/15 animate-[radar_2s_ease-out_infinite_0.7s]" />
        <div className="absolute -inset-4 w-32 h-32 rounded-full border-2 border-[#D56753]/10 animate-[radar_2s_ease-out_infinite_1.4s]" />
      </div>
      <style>{`
        @keyframes radar {
          0% { transform: scale(0.3); opacity: 1; }
          100% { transform: scale(3); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ScanningTheater() {
  const location = useLocation();
  const navigate = useNavigate();
  const stateData = location.state as { place?: PlaceDetails; refCode?: string; intent?: string; userQuestion?: string } | undefined;
  const place = stateData?.place;
  const refCode = stateData?.refCode;
  const intent = stateData?.intent;
  const userQuestion = stateData?.userQuestion;

  // Build specialty-aware checklist items
  const CHECKLIST_ITEMS = getChecklistItems(place?.category);

  // Checklist progress (index of the currently active item, -1 = not started)
  const [activeIndex, setActiveIndex] = useState(-1);

  // Competitors revealed on map so far
  const [visibleCompetitors, setVisibleCompetitors] = useState<
    CheckupCompetitor[]
  >([]);
  // Index of the competitor currently being highlighted (just revealed)
  const [highlightedCompetitorIndex, setHighlightedCompetitorIndex] = useState<number | null>(null);

  // API result (stored until theater finishes)
  const analysisRef = useRef<CheckupAnalysis | null>(null);
  const [apiDone, setApiDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [skipVisible, setSkipVisible] = useState(false);

  // Theater timing
  const theaterStartRef = useRef(Date.now());
  const hasNavigated = useRef(false);

  // Navigate to results when both API and theater are ready (or user skips)
  const goToResults = useCallback(() => {
    if (hasNavigated.current || !place) return;
    hasNavigated.current = true;

    const result = analysisRef.current;

    // If API hasn't finished yet, navigate with partial/empty data.
    // The results page will handle missing data gracefully (loading state).
    const emptyScore = { composite: 0, trustSignal: 0, firstImpression: 0, responsiveness: 0, competitiveEdge: 0, localVisibility: 0, onlinePresence: 0, reviewHealth: 0 };
    const resultsState: CheckupResults = {
      place,
      score: result ? {
        composite: result.score.composite,
        // New First Impression sub-scores
        trustSignal: result.score.trustSignal ?? result.score.visibility,
        firstImpression: result.score.firstImpression ?? result.score.reputation,
        responsiveness: result.score.responsiveness ?? result.score.competitive,
        competitiveEdge: result.score.competitiveEdge ?? 10,
        // Legacy aliases for backward compatibility
        localVisibility: result.score.visibility ?? result.score.trustSignal,
        onlinePresence: result.score.reputation ?? result.score.firstImpression,
        reviewHealth: result.score.competitive ?? result.score.responsiveness,
      } : emptyScore,
      scoreLabel: result ? ((result as any).scoreLabel || undefined) : undefined,
      competitiveDataLimited: result ? ((result as any).competitiveDataLimited || false) : true,
      topCompetitor: result?.topCompetitor || null,
      competitors: result?.competitors || [],
      findings: result?.findings || [],
      totalImpact: result?.totalImpact || 0,
      market: result?.market || { city: place.city || "", totalCompetitors: 0, avgRating: 0, avgReviews: 0, rank: 0 },
      gaps: result ? ((result as any).gaps || []) : [],
      ozMoments: result ? ((result as any).ozMoments || undefined) : undefined,
      refCode,
      intent,
      userQuestion,
      partial: !result, // flag so results page knows data may be incomplete
    };
    navigate("/checkup/results", { state: resultsState, replace: true });
  }, [place, navigate, refCode, intent, userQuestion]);

  // --- Fire API call on mount ---
  useEffect(() => {
    if (!place) return;
    let cancelled = false;

    // Track: checkup.started
    trackEvent("checkup.started", {
      practice_name: place.name,
      city: place.city,
      specialty: place.category,
    });

    async function analyze() {
      if (!place) return;
      const conferenceActive = isConferenceMode();
      const timeoutMs = conferenceActive ? 5000 : 45000;
      // Personalize fallback with real practice data so every attendee sees unique results
      const fallback = conferenceActive ? personalizeConferenceFallback(place) : CONFERENCE_ANALYSIS;

      try {
        // Offline at a conference? Skip the API call entirely, use fallback now
        if (isOfflineConference()) {
          if (cancelled) return;
          analysisRef.current = fallback;
          setApiDone(true);
          trackEvent("checkup.scan_completed", {
            score: fallback.score.composite,
            competitor_count: fallback.competitors.length,
            top_competitor_name: fallback.topCompetitor?.name || null,
            conference_fallback: true,
          });
          return;
        }

        // In conference mode: race API against 5s timeout, fallback to personalized data
        const apiCall = analyzeCheckup({
          name: place.name,
          city: place.city,
          state: place.state,
          category: place.category,
          types: place.types,
          rating: place.rating,
          reviewCount: place.reviewCount,
          placeId: place.placeId,
          location: place.location,
          // Oz reveals: every public data point compounds the "how did they know?" moment
          photosCount: place.photos?.length ?? 0,
          hasHours: !!(place.regularOpeningHours?.periods?.length),
          regularOpeningHours: place.regularOpeningHours || undefined,
          websiteUri: place.websiteUri,
          phone: place.phone,
          editorialSummary: place.editorialSummary,
          openingDate: place.openingDate,
          businessStatus: place.businessStatus,
          reviews: place.reviews?.map((r) => ({ text: r.text, rating: r.rating, author: r.authorName, time: r.relativeTime })) || [],
        });

        const result = conferenceActive
          ? await withTimeout(apiCall, timeoutMs)
          : await apiCall;

        if (cancelled) return;

        // Card 8-A: use the real result when the scan succeeded. The seeded
        // conference fallback (Valley Endodontics and fictional competitors) is
        // for conference mode ONLY. A non-conference prospect whose scan resolves
        // without success is routed to the honest error, never to fabricated data.
        if (result && result.success) {
          analysisRef.current = result;
          setApiDone(true);
          trackEvent("checkup.scan_completed", {
            score: result.score.composite,
            competitor_count: result.competitors.length,
            top_competitor_name: result.topCompetitor?.name || null,
            conference_fallback: false,
          });
        } else if (conferenceActive) {
          analysisRef.current = fallback;
          setApiDone(true);
          trackEvent("checkup.scan_completed", {
            score: fallback.score.composite,
            competitor_count: fallback.competitors.length,
            top_competitor_name: fallback.topCompetitor?.name || null,
            conference_fallback: true,
          });
        } else {
          setError("We couldn't reach our analysis servers. Check your connection and try again.");
        }
      } catch {
        if (cancelled) return;

        // On any error in conference mode: use personalized fallback seamlessly
        if (conferenceActive) {
          analysisRef.current = fallback;
          setApiDone(true);
        } else {
          setError("We couldn't reach our analysis servers. Check your connection and try again.");
        }
      }
    }

    analyze();
    return () => {
      cancelled = true;
    };
    // retryCount triggers re-analysis on "Try again"
  }, [place, retryCount]);

  // --- Animate checklist items in sequence ---
  useEffect(() => {
    // Start first item immediately
    setActiveIndex(0);

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= CHECKLIST_ITEMS.length; i++) {
      timers.push(
        setTimeout(() => {
          setActiveIndex(i);
        }, ITEM_INTERVAL_MS * i)
      );
    }

    return () => timers.forEach(clearTimeout);
  }, []);

  // Competitor reveal is now driven by the DiscoveryFeed via onRevealCompetitor
  const handleRevealCompetitor = useCallback((index: number) => {
    if (!analysisRef.current) return;
    const comp = analysisRef.current.competitors[index];
    if (comp) {
      setVisibleCompetitors((prev) => {
        if (prev.some((c) => c.placeId === comp.placeId)) return prev;
        return [...prev, comp];
      });
      setHighlightedCompetitorIndex(index);
      // Clear highlight after 2s
      setTimeout(() => setHighlightedCompetitorIndex((prev) => prev === index ? null : prev), 2000);
    }
  }, []);

  // --- Show skip button after 5 seconds (for conference booth speed) ---
  useEffect(() => {
    const timer = setTimeout(() => setSkipVisible(true), SKIP_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  // --- Transition when both checklist done AND API done AND min time elapsed ---
  useEffect(() => {
    if (!apiDone || activeIndex < CHECKLIST_ITEMS.length) return;

    const elapsed = Date.now() - theaterStartRef.current;
    const remaining = Math.max(0, MIN_THEATER_MS - elapsed);

    const timer = setTimeout(goToResults, remaining + 500);
    return () => clearTimeout(timer);
  }, [apiDone, activeIndex, goToResults]);

  // --- Redirect if no place data ---
  if (!place) {
    return <Navigate to="/checkup" replace />;
  }

  // --- Error state with retry ---
  if (error) {
    return (
      <div className="w-full max-w-md mt-4 sm:mt-12 text-center px-4">
        <p className="text-base font-medium text-[#1A1D23]">
          We hit a snag analyzing your market.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          This usually resolves in a few seconds.
        </p>
        <div className="flex flex-col gap-3 mt-6">
          <button
            onClick={() => {
              setError(null);
              setApiDone(false);
              analysisRef.current = null;
              theaterStartRef.current = Date.now();
              hasNavigated.current = false;
              setActiveIndex(-1);
              setVisibleCompetitors([]);
              setRetryCount((c) => c + 1);
            }}
            className="px-6 py-2.5 bg-[#D56753] text-white rounded-lg font-medium hover:bg-[#c45a48] transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => navigate("/checkup")}
            className="text-sm text-gray-400 underline"
          >
            Start over with a different business
          </button>
        </div>
      </div>
    );
  }

  // Map center from practice location
  const center: [number, number] = place.location
    ? [place.location.latitude, place.location.longitude]
    : [44.0582, -121.3153]; // Bend, OR fallback

  // Track whether all competitors have been revealed for final camera move
  const allCompetitors = analysisRef.current?.competitors || [];
  const allRevealed = apiDone && visibleCompetitors.length >= Math.min(5, allCompetitors.length) && allCompetitors.length > 0;

  return (
    <div className="w-full max-w-4xl mt-2 sm:mt-6">
      {/* Header -- dramatic, branded */}
      <div className="text-center mb-8">
        <p className="text-xs font-semibold tracking-widest text-[#D56753] uppercase mb-2">
          Market Analysis
        </p>
        <h2 className="text-2xl sm:text-3xl font-semibold text-[#1A1D23] tracking-tight">
          Scanning {place.name}
        </h2>
        <p className="text-sm text-slate-500 mt-2">
          Analyzing {place.city ? `the ${place.city} market` : "your market"} in real time
        </p>
      </div>

      {/* Two-panel layout -- map first on mobile, checklist first on desktop */}
      <div className="flex flex-col lg:flex-row gap-5">
        {/* Left panel -- Animated Checklist (second on mobile, first on desktop) */}
        <div className="order-last lg:order-first lg:w-[340px] shrink-0 bg-white border border-slate-200 rounded-2xl p-7 shadow-[0_4px_20px_rgba(0,0,0,0.06)] lg:max-h-[520px] lg:overflow-y-auto">
          <div className="space-y-4">
            {CHECKLIST_ITEMS.map((text, i) => (
              <ChecklistItem
                key={i}
                text={text}
                state={
                  i < activeIndex
                    ? "done"
                    : i === activeIndex
                      ? "active"
                      : "pending"
                }
              />
            ))}
          </div>

          {/* Unified Discovery Feed -- business data + competitors synced to map */}
          <DiscoveryFeed
            place={place}
            competitors={analysisRef.current?.competitors || []}
            apiDone={apiDone}
            onRevealCompetitor={handleRevealCompetitor}
            highlightedCompetitorIndex={highlightedCompetitorIndex}
          />

          {/* Real reviews scrolling through */}
          {place.reviews && place.reviews.length > 0 && (
            <ReviewTicker reviews={place.reviews} />
          )}

          {/* Real GBP photos appearing */}
          {place.photos && place.photos.length > 0 && (
            <PhotoStrip photos={place.photos} />
          )}

          {/* Progress indicator */}
          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#D56753] rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${Math.min(100, (Math.max(0, activeIndex) / CHECKLIST_ITEMS.length) * 100)}%`,
                }}
              />
            </div>
            <p className="text-xs font-medium text-slate-400 mt-2.5 text-center">
              {activeIndex < CHECKLIST_ITEMS.length
                ? `Step ${Math.max(1, activeIndex + 1)} of ${CHECKLIST_ITEMS.length}`
                : "Analysis complete"}
            </p>
            {skipVisible && (
              <button
                onClick={goToResults}
                className="w-full mt-4 flex items-center justify-center gap-2 rounded-xl border border-[#D56753]/30 bg-[#D56753]/5 px-4 py-2.5 text-sm font-semibold text-[#D56753] hover:bg-[#D56753]/10 active:scale-[0.98] transition-all"
              >
                {apiDone ? "Show my results" : "Skip to results"}
              </button>
            )}
          </div>
        </div>

        {/* Right panel -- Live Map with radar (first on mobile, second on desktop) */}
        <div className="order-first lg:order-last relative flex-1 min-h-[300px] lg:min-h-0 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
          <RadarPulse active={activeIndex < CHECKLIST_ITEMS.length} />
          <MapContainer
            center={center}
            zoom={12}
            scrollWheelZoom={false}
            className="w-full h-full min-h-[300px] lg:min-h-[420px]"
            zoomControl={false}
            attributionControl={true}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
            />
            <MapAnimator
              center={center}
              competitors={visibleCompetitors}
              highlightIndex={highlightedCompetitorIndex}
              scanComplete={allRevealed}
            />

            {/* Practice pin -- Terracotta */}
            <Marker position={center} icon={practiceIcon}>
              <Popup>
                <div className="text-center">
                  <p className="font-semibold text-sm">{place.name}</p>
                  <p className="text-xs text-slate-500">Your business</p>
                </div>
              </Popup>
            </Marker>

            {/* Competitor pins -- Navy, synced with discovery feed */}
            {visibleCompetitors.map((comp, i) => {
              const isHighlighted = highlightedCompetitorIndex === i;
              return (
                comp.location && (
                  <Marker
                    key={comp.placeId}
                    position={[comp.location.lat, comp.location.lng]}
                    icon={isHighlighted ? highlightedCompetitorIcon : competitorIcon}
                  >
                    <Popup>
                      <div className="text-center">
                        <p className="font-semibold text-sm">{comp.name}</p>
                        <p className="text-xs text-slate-500">
                          {comp.rating}★ · {comp.reviewCount} reviews
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                )
              );
            })}
          </MapContainer>
        </div>
      </div>

      {/* Competitor count badge */}
      {visibleCompetitors.length > 0 && (
        <div className="mt-4 text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-3 py-1">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: NAVY }}
            />
            {visibleCompetitors.length} competitor
            {visibleCompetitors.length !== 1 ? "s" : ""} found
          </span>
        </div>
      )}
    </div>
  );
}
