/**
 * Location Competitor Onboarding (Practice Ranking v2)
 *
 * Three-stage flow per spec:
 *   1. Discovering — animated mini-map while we run Places discovery server-side
 *   2. Curating    — list with remove/add (autocomplete), capped at 10
 *   3. Finalize    — single click → POST /finalize-and-run, redirect to dashboard
 *
 * Spec: plans/04282026-no-ticket-practice-ranking-v2-user-curated-competitors/spec.md
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Plus,
  X,
  Search,
  Sparkles,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Star,
  MapPin,
  Phone,
  Globe,
  Info,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./competitor-map.css";
import {
  getLocationCompetitors,
  runCompetitorDiscovery,
  previewCompetitorDiscovery,
  previewCompetitorPlace,
  addLocationCompetitor,
  removeLocationCompetitor,
  finalizeAndRun,
  reselectAndRun,
  type CuratedCompetitor,
  type CompetitorDiscoverySuggestion,
  type ComparisonSpecialtyOption,
  type PracticeLocationRef,
  type SelfFilterStatus,
} from "../../api/practiceRanking";
import { searchPlaces, type PlaceSuggestion } from "../../api/places";
import { haversineMiles, formatDistance } from "./util.distance";

const PULSE_DURATION_MS = 2000;
const DEFAULT_DISCOVERY_RADIUS_METERS = 40234;
const RECOMMENDED_DISCOVERY_RADIUS_METERS = DEFAULT_DISCOVERY_RADIUS_METERS;
const RECOMMENDED_RADIUS_TOOLTIP =
  "Recommended default: prioritizes competitors from the local Google Maps query for your specialty and market before broader radius exploration.";
const DISCOVERY_RADIUS_OPTIONS = [
  { label: "5 mi", value: 8047 },
  { label: "10 mi", value: 16093 },
  { label: "15 mi", value: 24140 },
  {
    label: "25 mi",
    value: RECOMMENDED_DISCOVERY_RADIUS_METERS,
    recommended: true,
  },
  { label: "50 mi", value: 80467 },
  { label: "100 mi", value: 160934 },
];

type Stage = "loading" | "discovering" | "curating" | "finalizing";

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === "string") return err;
  return fallback;
}

function suggestionToCuratedCompetitor(
  suggestion: CompetitorDiscoverySuggestion,
  id: number
): CuratedCompetitor {
  return {
    id,
    placeId: suggestion.placeId,
    name: suggestion.name,
    address: suggestion.address,
    primaryType: suggestion.primaryType,
    rating: suggestion.rating,
    reviewCount: suggestion.reviewCount,
    lat: suggestion.lat,
    lng: suggestion.lng,
    phone: suggestion.phone,
    website: suggestion.website,
    photoName: suggestion.photoName,
    discoveryPosition: suggestion.discoveryPosition,
    discoveryQuery: suggestion.discoveryQuery,
    discoverySource: suggestion.discoverySource,
    discoveryCheckedAt: suggestion.discoveryCheckedAt,
    discoveryRadiusMeters: suggestion.discoveryRadiusMeters,
    profileStrengthScore: suggestion.profileStrengthScore,
    profileStrengthTier: suggestion.profileStrengthTier,
    profileStrengthFactors: suggestion.profileStrengthFactors,
    source: "initial_scrape",
    addedAt: new Date().toISOString(),
    addedByUserId: null,
  };
}

export default function LocationCompetitorOnboarding() {
  const params = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const locationId = Number(params.locationId);
  const isReselectMode = searchParams.get("mode") === "reselect";

  const [stage, setStage] = useState<Stage>("loading");
  const [competitors, setCompetitors] = useState<CuratedCompetitor[]>([]);
  const [cap, setCap] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [selectedRadiusMeters, setSelectedRadiusMeters] = useState(
    DEFAULT_DISCOVERY_RADIUS_METERS
  );
  const [selectedComparisonSpecialty, setSelectedComparisonSpecialty] =
    useState<string | null>(null);
  const [comparisonSpecialtyOptions, setComparisonSpecialtyOptions] = useState<
    ComparisonSpecialtyOption[]
  >([]);
  const [suggestedCompetitors, setSuggestedCompetitors] = useState<
    CuratedCompetitor[]
  >([]);
  const [refreshingSuggestions, setRefreshingSuggestions] = useState(false);
  const [pendingRefreshRadiusMeters, setPendingRefreshRadiusMeters] =
    useState<number | null>(null);
  // Single timeout flips Stage 1 → Stage 2 once discovery returns. Per-pin
  // staggered reveal was retired with the Leaflet swap.
  const stageTransitionTimer = useRef<number | null>(null);
  const [practiceLocation, setPracticeLocation] =
    useState<PracticeLocationRef | null>(null);
  const [selfFilterStatus, setSelfFilterStatus] =
    useState<SelfFilterStatus>("resolved");

  // Bidirectional click sync between map pins and list rows.
  // `selectionSource` tracks which side fired so the effect knows which side
  // to scroll into view.
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [selectionSource, setSelectionSource] = useState<"list" | "pin" | null>(
    null
  );
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const mapWrapperRef = useRef<HTMLDivElement | null>(null);
  const pulseTimer = useRef<number | null>(null);

  const selectFromList = useCallback((placeId: string) => {
    setSelectionSource("list");
    setSelectedPlaceId(placeId);
  }, []);
  const selectFromPin = useCallback((placeId: string) => {
    setSelectionSource("pin");
    setSelectedPlaceId(placeId);
  }, []);

  useEffect(() => {
    if (!selectedPlaceId) return;
    if (selectionSource === "list") {
      mapWrapperRef.current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
    } else if (selectionSource === "pin") {
      rowRefs.current
        .get(selectedPlaceId)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => {
      setSelectedPlaceId(null);
      setSelectionSource(null);
      pulseTimer.current = null;
    }, PULSE_DURATION_MS);
    return () => {
      if (pulseTimer.current) {
        window.clearTimeout(pulseTimer.current);
        pulseTimer.current = null;
      }
    };
  }, [selectedPlaceId, selectionSource]);

  const registerRowRef = useCallback(
    (placeId: string, el: HTMLLIElement | null) => {
      if (el) rowRefs.current.set(placeId, el);
      else rowRefs.current.delete(placeId);
    },
    []
  );

  // Search dropdown state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingPlaceId, setAddingPlaceId] = useState<string | null>(null);
  const searchDebounce = useRef<NodeJS.Timeout | null>(null);

  // Validate locationId param
  const validLocationId =
    Number.isFinite(locationId) && locationId > 0 && Number.isInteger(locationId);

  // ──────────────────────────────────────────────────────────
  // Initial load: figure out what stage to land in
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!validLocationId) {
      setError("Invalid location.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await getLocationCompetitors(locationId);
        if (cancelled) return;
        if (!res?.success) {
          setError("Could not load competitor list.");
          return;
        }
        setCap(res.cap);
        setPracticeLocation(res.practiceLocation);
        setSelfFilterStatus(res.selfFilterStatus);
        const initialRadiusMeters = isReselectMode
          ? DEFAULT_DISCOVERY_RADIUS_METERS
          : res.competitorDiscoveryRadiusMeters ||
            DEFAULT_DISCOVERY_RADIUS_METERS;
        setSelectedRadiusMeters(initialRadiusMeters);
        setSelectedComparisonSpecialty(res.comparisonSpecialty?.value ?? null);
        setComparisonSpecialtyOptions(res.comparisonSpecialtyOptions ?? []);

        if (res.onboarding.status === "finalized" && !isReselectMode) {
          // Already done — bounce to dashboard unless this is competitor management.
          navigate("/rankings", { replace: true });
          return;
        }

        if (res.competitors.length === 0 && !isReselectMode) {
          // No discovery yet — kick it off
          setStage("discovering");
          await runDiscovery(initialRadiusMeters);
        } else {
          // Existing list — straight to curating
          setCompetitors(res.competitors);
          setStage("curating");
        }
      } catch (err) {
        if (!cancelled) setError(errorMessage(err, "Failed to load"));
      }
    })();
    return () => {
      cancelled = true;
      if (stageTransitionTimer.current) {
        window.clearTimeout(stageTransitionTimer.current);
        stageTransitionTimer.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, isReselectMode]);

  // ──────────────────────────────────────────────────────────
  // Stage 1 — Discovery
  // ──────────────────────────────────────────────────────────
  async function runDiscovery(radiusMeters = selectedRadiusMeters) {
    try {
      const result = await runCompetitorDiscovery(
        locationId,
        radiusMeters,
        selectedComparisonSpecialty
      );
      if (!result?.success) {
        setError("Discovery failed. Please try again.");
        return;
      }
      setSelectedRadiusMeters(result.radiusMeters || radiusMeters);
      setSelectedComparisonSpecialty(
        result.comparisonSpecialty?.value ?? selectedComparisonSpecialty
      );
      // Reload the list to render the freshly-scraped competitors. The
      // discovery call resolves the practice's own placeId/lat/lng (writes
      // them to `locations`), so the GET that follows picks them up.
      const list = await getLocationCompetitors(locationId);
      if (!list?.success) return;
      setCompetitors(list.competitors);
      setPracticeLocation(list.practiceLocation);
      setSelfFilterStatus(list.selfFilterStatus);
      setSelectedRadiusMeters(
        list.competitorDiscoveryRadiusMeters || result.radiusMeters || radiusMeters
      );
      setComparisonSpecialtyOptions(list.comparisonSpecialtyOptions ?? []);
      // Brief pause so the user registers the discovery view before the curate
      // stage takes over.
      stageTransitionTimer.current = window.setTimeout(
        () => setStage("curating"),
        1200
      );
    } catch (err) {
      setError(errorMessage(err, "Discovery failed."));
    }
  }

  async function handleRefreshSuggestions(
    radiusMeters = selectedRadiusMeters,
    clearCurrentList = false
  ) {
    const previousCompetitors = competitors;
    if (clearCurrentList) {
      setCompetitors([]);
      setSuggestedCompetitors([]);
    }
    setRefreshingSuggestions(true);
    setError(null);
    try {
      if (isReselectMode) {
        const result = await previewCompetitorDiscovery(
          locationId,
          radiusMeters,
          selectedComparisonSpecialty
        );
        const refreshedCompetitors = result.suggestions
          .slice(0, cap)
          .map((suggestion, index) =>
            suggestionToCuratedCompetitor(suggestion, -Date.now() - index)
          );
        setSelectedRadiusMeters(result.radiusMeters || radiusMeters);
        setSelectedComparisonSpecialty(
          result.comparisonSpecialty?.value ?? selectedComparisonSpecialty
        );
        setCompetitors(refreshedCompetitors);
        setSuggestedCompetitors([]);
        return;
      }

      const result = await runCompetitorDiscovery(
        locationId,
        radiusMeters,
        selectedComparisonSpecialty
      );
      setSelectedRadiusMeters(result.radiusMeters || radiusMeters);
      setSelectedComparisonSpecialty(
        result.comparisonSpecialty?.value ?? selectedComparisonSpecialty
      );
      const list = await getLocationCompetitors(locationId);
      if (list?.success) {
        setCompetitors(list.competitors);
        setPracticeLocation(list.practiceLocation);
        setSelfFilterStatus(list.selfFilterStatus);
        setSelectedRadiusMeters(
          list.competitorDiscoveryRadiusMeters ||
            result.radiusMeters ||
            radiusMeters
        );
        setComparisonSpecialtyOptions(list.comparisonSpecialtyOptions ?? []);
      }
    } catch (err) {
      if (clearCurrentList) setCompetitors(previousCompetitors);
      setError(errorMessage(err, "Could not refresh competitor suggestions."));
    } finally {
      setRefreshingSuggestions(false);
    }
  }

  function requestRefreshSuggestions(radiusMeters = selectedRadiusMeters) {
    setPendingRefreshRadiusMeters(radiusMeters);
  }

  function requestRadiusChange(radiusMeters: number) {
    if (radiusMeters === selectedRadiusMeters) return;
    setSelectedRadiusMeters(radiusMeters);
  }

  async function confirmRefreshSuggestions() {
    const radiusMeters = selectedRadiusMeters;
    setSelectedRadiusMeters(radiusMeters);
    await handleRefreshSuggestions(radiusMeters, true);
    setPendingRefreshRadiusMeters(null);
  }

  // ──────────────────────────────────────────────────────────
  // Stage 2 — Curating: search + add + remove
  // ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchInput || searchInput.trim().length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await searchPlaces(searchInput.trim());
        setSearchResults(res?.suggestions ?? []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchInput]);

  async function handleAdd(suggestion: PlaceSuggestion) {
    try {
      if (isReselectMode) {
        if (competitors.some((c) => c.placeId === suggestion.placeId)) {
          setSearchInput("");
          setSearchResults([]);
          setSearchOpen(false);
          return;
        }
        if (competitors.length >= cap) {
          setError(`Competitor cap reached (${cap}). Remove one before adding another.`);
          return;
        }
        setAddingPlaceId(suggestion.placeId);
        const preview = await previewCompetitorPlace(
          locationId,
          suggestion.placeId,
          selectedRadiusMeters,
          selectedComparisonSpecialty
        );
        if (!preview?.success) {
          const msg =
            (preview as { message?: string })?.message ||
            "Could not measure this competitor before adding.";
          setError(msg);
          return;
        }
        const added = {
          ...suggestionToCuratedCompetitor(preview.competitor, -Date.now()),
          source: "user_added" as const,
          addedAt: new Date().toISOString(),
        };
        setCompetitors((prev) =>
          prev.some((c) => c.placeId === added.placeId) ? prev : [...prev, added]
        );
        setSelectionSource("list");
        setSelectedPlaceId(added.placeId);
        setSearchInput("");
        setSearchResults([]);
        setSearchOpen(false);
        setError(null);
        return;
      }

      const res = await addLocationCompetitor(locationId, suggestion.placeId);
      if (!res?.success) {
        const msg =
          (res as { message?: string })?.message ||
          "Could not add this competitor.";
        setError(msg);
        return;
      }
      // Re-fetch so we have the canonical row (handles revival of soft-deleted)
      const list = await getLocationCompetitors(locationId);
      if (list?.success) {
        setCompetitors(list.competitors);
        setPracticeLocation(list.practiceLocation);
        setSelfFilterStatus(list.selfFilterStatus);
        setComparisonSpecialtyOptions(list.comparisonSpecialtyOptions ?? []);
      }
      setSearchInput("");
      setSearchResults([]);
      setSearchOpen(false);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, "Could not add competitor."));
    } finally {
      setAddingPlaceId(null);
    }
  }

  function handleAddSuggestedCompetitor(competitor: CuratedCompetitor) {
    if (competitors.some((c) => c.placeId === competitor.placeId)) return;
    if (competitors.length >= cap) {
      setError(`Competitor cap reached (${cap}). Remove one before adding another.`);
      return;
    }
    const added = {
      ...competitor,
      id: -Date.now(),
      discoveryRadiusMeters: selectedRadiusMeters,
      addedAt: new Date().toISOString(),
    };
    setCompetitors((prev) => [...prev, added]);
    setSelectionSource("list");
    setSelectedPlaceId(added.placeId);
    setError(null);
  }

  async function handleRemove(placeId: string) {
    if (selectedPlaceId === placeId) {
      setSelectedPlaceId(null);
      setSelectionSource(null);
    }
    if (isReselectMode) {
      setCompetitors((c) => c.filter((x) => x.placeId !== placeId));
      return;
    }

    // Optimistic
    const prev = competitors;
    setCompetitors((c) => c.filter((x) => x.placeId !== placeId));
    try {
      const res = await removeLocationCompetitor(locationId, placeId);
      if (!res?.success) {
        setCompetitors(prev);
        setError("Could not remove competitor.");
      }
    } catch {
      setCompetitors(prev);
      setError("Could not remove competitor.");
    }
  }

  // ──────────────────────────────────────────────────────────
  // Stage 3 — Finalize and run
  // ──────────────────────────────────────────────────────────
  async function handleFinalizeAndRun() {
    setStage("finalizing");
    try {
      const res = isReselectMode
        ? await reselectAndRun(
            locationId,
            competitors.map((c) => c.placeId),
            selectedRadiusMeters
          )
        : await finalizeAndRun(locationId);
      if (!res?.success) {
        setError(
          isReselectMode
            ? "Could not rerun ranking. Please try again."
            : "Could not start your first ranking. Please try again."
        );
        setStage("curating");
        return;
      }
      // Redirect to rankings dashboard with batch context
      navigate(`/rankings?batchId=${encodeURIComponent(res.batchId)}`, {
        replace: true,
      });
    } catch (err) {
      setError(
        errorMessage(
          err,
          isReselectMode ? "Could not rerun ranking." : "Finalize failed."
        )
      );
      setStage("curating");
    }
  }

  // ──────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────
  if (!validLocationId) {
    return (
      <div className="min-h-screen bg-alloro-bg flex items-center justify-center px-6">
        <div className="text-center">
          <p className="text-alloro-textDark/60 text-sm">Invalid location.</p>
          <button
            onClick={() => navigate("/dashboard")}
            className="mt-4 text-alloro-orange font-bold text-sm"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white">
      {!isReselectMode && (
        <header className="glass-header border-b border-black/5">
          <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 py-5 flex items-center gap-5">
            <div className="w-10 h-10 bg-alloro-orange text-white rounded-xl flex items-center justify-center shadow-lg">
              <Sparkles size={20} />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-[11px] font-black font-heading uppercase tracking-[0.25em] leading-none">
                Competitor Setup
              </h1>
              <span className="text-[9px] font-bold text-alloro-textDark/40 uppercase tracking-widest mt-1.5">
                Practice Ranking v2
              </span>
            </div>
          </div>
        </header>
      )}

      <main className="w-full max-w-[960px] mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-red-700 text-sm font-medium">
            {error}
          </div>
        )}

        {stage === "loading" && <LoadingState />}

        {stage === "discovering" && (
          <DiscoveringStage
            competitors={competitors}
            practiceLocation={practiceLocation}
            radiusMeters={selectedRadiusMeters}
          />
        )}

        {stage === "curating" && (
          <CuratingStage
            competitors={competitors}
            cap={cap}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            searchInput={searchInput}
            setSearchInput={setSearchInput}
            searchResults={searchResults}
            searching={searching}
            addingPlaceId={addingPlaceId}
            onAdd={handleAdd}
            onRemove={handleRemove}
            onFinalize={handleFinalizeAndRun}
            practiceLocation={practiceLocation}
            selfFilterStatus={selfFilterStatus}
            selectedPlaceId={selectedPlaceId}
            onSelectFromList={selectFromList}
            onSelectFromPin={selectFromPin}
            registerRowRef={registerRowRef}
            mapWrapperRef={mapWrapperRef}
            radiusMeters={selectedRadiusMeters}
            onRadiusChange={requestRadiusChange}
            onRefreshSuggestions={requestRefreshSuggestions}
            refreshingSuggestions={refreshingSuggestions}
            comparisonSpecialty={selectedComparisonSpecialty}
            comparisonSpecialtyOptions={comparisonSpecialtyOptions}
            onComparisonSpecialtyChange={setSelectedComparisonSpecialty}
            suggestedCompetitors={suggestedCompetitors}
            onAddSuggested={handleAddSuggestedCompetitor}
            isReselectMode={isReselectMode}
            onCancel={() => navigate("/rankings")}
          />
        )}

        {stage === "finalizing" && (
          <FinalizingState isReselectMode={isReselectMode} />
        )}
      </main>
      <RefreshSuggestionsConfirmModal
        open={pendingRefreshRadiusMeters !== null}
        onCancel={() => setPendingRefreshRadiusMeters(null)}
        onConfirm={confirmRefreshSuggestions}
        loading={refreshingSuggestions}
      />
    </div>
  );
}

// =====================================================================
// Stage components
// =====================================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="w-10 h-10 text-alloro-orange animate-spin" />
      <p className="mt-4 text-sm text-alloro-textDark/60 font-medium">
        Loading your competitor list…
      </p>
    </div>
  );
}

function FinalizingState({
  isReselectMode,
}: {
  isReselectMode: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Loader2 className="w-10 h-10 text-alloro-orange animate-spin" />
      <h2 className="mt-6 text-2xl font-black font-heading text-alloro-navy">
        {isReselectMode
          ? "Saving your comparison set and reranking…"
          : "Locking your list and starting analysis…"}
      </h2>
      <p className="mt-2 text-sm text-alloro-textDark/60 font-medium max-w-md text-center">
        {isReselectMode
          ? "This starts a ranking rerun only and usually takes around 5-10 minutes. Your current dashboard stays visible until the new snapshot finishes."
          : "Hang tight — this typically takes 60–90 seconds. We'll redirect you to the dashboard once it's queued."}
      </p>
    </div>
  );
}

function RefreshSuggestionsConfirmModal({
  open,
  onCancel,
  onConfirm,
  loading,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-alloro-navy/55 px-6 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="refresh-suggestions-title"
            className="w-full max-w-md rounded-[14px] border border-white/10 bg-alloro-bg p-6 shadow-premium"
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-alloro-orange/10 text-alloro-orange">
                <Info size={18} />
              </div>
              <div>
                <h2
                  id="refresh-suggestions-title"
                  className="font-display text-xl font-medium tracking-tight text-alloro-navy"
                >
                  refreshing suggestions will clear the current list, proceed?
                </h2>
                <p className="mt-2 text-sm font-medium leading-relaxed text-slate-500">
                  Your saved comparison set will not change until you save and
                  rerun ranking.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-black text-alloro-navy transition hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl bg-alloro-orange px-4 py-2 text-sm font-black text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading && <Loader2 size={15} className="animate-spin" />}
                Proceed
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DiscoveringStage({
  competitors,
  practiceLocation,
  radiusMeters,
}: {
  competitors: CuratedCompetitor[];
  practiceLocation: PracticeLocationRef | null;
  radiusMeters: number;
}) {
  return (
    <section className="bg-white rounded-3xl border border-black/5 shadow-premium overflow-hidden">
      <div className="px-8 py-8 border-b border-black/5 text-left">
        <div className="px-2 py-0.5 inline-flex items-center gap-2 bg-alloro-orange/10 rounded-md text-alloro-orange text-[10px] font-black uppercase tracking-widest mb-3">
          <Loader2 className="w-3 h-3 animate-spin" />
          Step 1 of 3
        </div>
        <h2 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-2">
          Discovering competitors near you
        </h2>
        <p className="text-base text-slate-500 font-medium leading-relaxed">
          We're scanning your area for the practices that show up next to you in
          Google. You'll get to choose which ones count.
        </p>
      </div>

      <CompetitorMap
        competitors={competitors}
        practiceLocation={practiceLocation}
        radiusMeters={radiusMeters}
        height={480}
        showLoadingFallback
      />

      <div className="px-8 py-6 bg-white border-t border-black/5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 font-medium">
            {competitors.length === 0
              ? "Searching Google Places…"
              : `Found ${competitors.length} practices nearby`}
          </span>
          <span className="text-alloro-textDark/40 text-xs font-bold uppercase tracking-widest">
            {competitors.length === 0 ? "" : "Locking in your list"}
          </span>
        </div>
      </div>
    </section>
  );
}

function MapsEstimateChip({ competitor }: { competitor: CuratedCompetitor }) {
  const hasEstimate =
    typeof competitor.discoveryPosition === "number" &&
    competitor.discoveryPosition > 0;
  const wasSampled =
    competitor.discoverySource === "places_text" &&
    Boolean(competitor.discoveryCheckedAt);
  const label = hasEstimate
    ? `#${competitor.discoveryPosition}`
    : wasSampled
      ? "not in top 20"
      : "not measured";
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest bg-slate-50 text-slate-600 border-slate-100"
      title={
        hasEstimate
          ? "Estimated from the sampled discovery search that found this competitor. Actual Google Maps results can vary by location, device, and personalization."
          : wasSampled
            ? "We sampled Google Maps for the selected radius, but this competitor did not appear in the top 20 results."
            : "No sampled Maps position has been measured for this competitor yet."
      }
    >
      Maps estimate {label}
    </span>
  );
}

function RadiusControl({
  value,
  onChange,
  onRefresh,
  refreshing,
  comparisonSpecialty,
  comparisonSpecialtyOptions,
  onComparisonSpecialtyChange,
}: {
  value: number;
  onChange: (value: number) => void;
  onRefresh: (value?: number) => void;
  refreshing: boolean;
  comparisonSpecialty: string | null;
  comparisonSpecialtyOptions: ComparisonSpecialtyOption[];
  onComparisonSpecialtyChange: (value: string | null) => void;
}) {
  const hasSelectedSpecialty = comparisonSpecialtyOptions.some(
    (option) => option.value === comparisonSpecialty
  );
  return (
    <div className="rounded-[14px] border border-line-soft bg-white p-4 shadow-premium">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <label className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-black/5 bg-slate-50 px-3 py-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Type
            </span>
            <select
              value={comparisonSpecialty ?? ""}
              onChange={(event) =>
                onComparisonSpecialtyChange(event.target.value || null)
              }
              className="bg-transparent text-xs font-black text-alloro-textDark outline-none"
            >
              {!comparisonSpecialty && (
                <option value="">Practice specialty</option>
              )}
              {comparisonSpecialty && !hasSelectedSpecialty && (
                <option value={comparisonSpecialty}>
                  {comparisonSpecialty.replace(/_/g, " ")}
                </option>
              )}
              {comparisonSpecialtyOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="inline-flex shrink-0 overflow-visible rounded-xl border border-black/5 bg-slate-50 p-1">
            {DISCOVERY_RADIUS_OPTIONS.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onChange(option.value)}
                  className={`group relative min-w-12 rounded-lg px-2.5 py-2 text-xs font-black transition lg:min-w-14 lg:px-3 ${
                    active
                      ? "bg-alloro-navy text-white shadow-sm"
                      : "text-slate-500 hover:bg-white"
                  }`}
                  aria-describedby={
                    option.recommended ? "recommended-radius-tooltip" : undefined
                  }
                >
                  {option.label}
                  {option.recommended && (
                    <>
                      <span className="absolute -right-1.5 -top-2 rounded-full border border-white bg-alloro-orange px-1.5 py-0.5 text-[7px] font-black uppercase tracking-wider text-white shadow-sm">
                        Rec
                      </span>
                      <span
                        id="recommended-radius-tooltip"
                        role="tooltip"
                        className="pointer-events-none absolute left-1/2 top-full z-30 mt-2 hidden w-64 -translate-x-1/2 rounded-xl border border-black/5 bg-alloro-navy px-3 py-2 text-left text-[10px] font-semibold leading-relaxed text-white shadow-xl group-hover:block group-focus-visible:block"
                      >
                        {RECOMMENDED_RADIUS_TOOLTIP}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => onRefresh(value)}
            disabled={refreshing}
            className="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-alloro-orange px-4 py-2 text-sm font-black text-white shadow-md transition hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {refreshing ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Sparkles size={16} />
            )}
            Refresh suggestions
          </button>
      </div>
    </div>
  );
}

function CuratingStage({
  competitors,
  cap,
  searchOpen,
  setSearchOpen,
  searchInput,
  setSearchInput,
  searchResults,
  searching,
  addingPlaceId,
  onAdd,
  onRemove,
  onFinalize,
  practiceLocation,
  selfFilterStatus,
  selectedPlaceId,
  onSelectFromList,
  onSelectFromPin,
  registerRowRef,
  mapWrapperRef,
  radiusMeters,
  onRadiusChange,
  onRefreshSuggestions,
  refreshingSuggestions,
  comparisonSpecialty,
  comparisonSpecialtyOptions,
  onComparisonSpecialtyChange,
  suggestedCompetitors,
  onAddSuggested,
  isReselectMode,
  onCancel,
}: {
  competitors: CuratedCompetitor[];
  cap: number;
  searchOpen: boolean;
  setSearchOpen: (v: boolean) => void;
  searchInput: string;
  setSearchInput: (v: string) => void;
  searchResults: PlaceSuggestion[];
  searching: boolean;
  addingPlaceId: string | null;
  onAdd: (s: PlaceSuggestion) => void;
  onRemove: (placeId: string) => void;
  onFinalize: () => void;
  practiceLocation: PracticeLocationRef | null;
  selfFilterStatus: SelfFilterStatus;
  selectedPlaceId: string | null;
  onSelectFromList: (placeId: string) => void;
  onSelectFromPin: (placeId: string) => void;
  registerRowRef: (placeId: string, el: HTMLLIElement | null) => void;
  mapWrapperRef: React.RefObject<HTMLDivElement | null>;
  radiusMeters: number;
  onRadiusChange: (radiusMeters: number) => void;
  onRefreshSuggestions: (radiusMeters?: number) => void;
  refreshingSuggestions: boolean;
  comparisonSpecialty: string | null;
  comparisonSpecialtyOptions: ComparisonSpecialtyOption[];
  onComparisonSpecialtyChange: (value: string | null) => void;
  suggestedCompetitors: CuratedCompetitor[];
  onAddSuggested: (competitor: CuratedCompetitor) => void;
  isReselectMode: boolean;
  onCancel: () => void;
}) {
  const atCap = competitors.length >= cap;
  const placeIds = useMemo(
    () => new Set(competitors.map((c) => c.placeId)),
    [competitors]
  );

  return (
    <section className="space-y-8">
      <div className="text-left">
        {isReselectMode ? (
          <button
            type="button"
            onClick={onCancel}
            className="mb-3 inline-flex items-center gap-2 rounded-md bg-transparent text-[11px] font-black uppercase tracking-widest text-alloro-orange transition-colors hover:text-alloro-orange/80"
          >
            <ArrowLeft size={14} />
            Go back to Rankings Dashboard
          </button>
        ) : (
          <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-alloro-navy/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-alloro-navy">
            Step 2 of 3
          </div>
        )}
        <h2 className="font-display text-2xl md:text-3xl font-medium text-alloro-navy tracking-tight mb-2">
          {isReselectMode ? "Manage comparison set" : "Your competitor list"}
        </h2>
        <p className="text-base text-slate-500 font-medium leading-relaxed">
          {isReselectMode
            ? "Changing competitors starts a new ranking run. Your current dashboard stays visible until the rerank finishes."
            : "Remove any practices that aren't local competitors. Add any we missed."}{" "}
          Up to <strong>{cap}</strong> competitors.
        </p>
      </div>

      {selfFilterStatus === "unresolved" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <Info size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-900 font-medium leading-relaxed">
            We couldn't automatically detect your practice in this market. If
            your own listing appears below, remove it manually — it'll skew
            your ranking.
          </p>
        </div>
      )}

      <RadiusControl
        value={radiusMeters}
        onChange={onRadiusChange}
        onRefresh={onRefreshSuggestions}
        refreshing={refreshingSuggestions}
        comparisonSpecialty={comparisonSpecialty}
        comparisonSpecialtyOptions={comparisonSpecialtyOptions}
        onComparisonSpecialtyChange={onComparisonSpecialtyChange}
      />

      {/* Default grid alignment (stretch) lets the map column match the
          competitor-list column's height; min-h keeps it usable when the
          list is short. */}
      <div className="lg:grid lg:grid-cols-[0.82fr_1.18fr] lg:gap-6">
        <div
          ref={mapWrapperRef}
          className="mb-5 h-[240px] overflow-hidden rounded-2xl border border-black/5 lg:mb-0 lg:h-auto lg:min-h-[320px]"
        >
          <CompetitorMap
            competitors={competitors}
            practiceLocation={practiceLocation}
            radiusMeters={radiusMeters}
            selectedPlaceId={selectedPlaceId}
            onPinClick={onSelectFromPin}
          />
        </div>

        <div className="min-w-0 rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-bold text-alloro-textDark">
              {competitors.length} of {cap} selected
            </span>
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              disabled={atCap}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-alloro-orange text-white text-sm font-bold shadow-md hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Add competitor
            </button>
          </div>

          {searchOpen && (
            <div className="mb-4 rounded-2xl border border-black/10 bg-slate-50 p-4">
              <div className="flex items-center gap-3 bg-white rounded-xl border border-black/5 px-3 py-2 shadow-sm">
                <Search size={16} className="text-slate-400" />
                <input
                  autoFocus
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search by business name…"
                  className="flex-1 bg-transparent outline-none text-sm font-medium"
                />
                {searching && (
                  <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
                )}
              </div>
              <div className="mt-3 max-h-72 overflow-y-auto space-y-2">
                {searchResults.map((s) => {
                  const already = placeIds.has(s.placeId);
                  const isAdding = addingPlaceId === s.placeId;
                  return (
                    <button
                      key={s.placeId}
                      disabled={already || atCap || isAdding}
                      onClick={() => onAdd(s)}
                      className="w-full text-left px-4 py-3 rounded-xl bg-white border border-black/5 hover:border-alloro-orange/50 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="font-bold text-sm text-alloro-textDark">
                          {s.mainText}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {s.secondaryText}
                        </div>
                      </div>
                      {already ? (
                        <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                      ) : isAdding ? (
                        <Loader2
                          size={18}
                          className="text-alloro-orange flex-shrink-0 mt-0.5 animate-spin"
                        />
                      ) : (
                        <Plus size={18} className="text-alloro-orange flex-shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })}
                {!searching &&
                  searchInput.trim().length >= 2 &&
                  searchResults.length === 0 && (
                    <p className="text-xs text-slate-500 text-center py-4">
                      No matches. Try a different search term.
                    </p>
                  )}
              </div>
            </div>
          )}

          {isReselectMode && suggestedCompetitors.length > 0 && (
            <div className="mb-4 rounded-2xl border border-alloro-orange/15 bg-alloro-orange/5 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.18em] text-alloro-orange">
                    Automated suggestions
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    Add candidates from the selected radius to your comparison set.
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {suggestedCompetitors.length}
                </span>
              </div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {suggestedCompetitors.map((candidate) => {
                  const already = placeIds.has(candidate.placeId);
                  return (
                    <button
                      key={candidate.placeId}
                      type="button"
                      disabled={already || atCap}
                      onClick={() => onAddSuggested(candidate)}
                      className="flex w-full items-start justify-between gap-3 rounded-xl border border-black/5 bg-white px-4 py-3 text-left transition hover:border-alloro-orange/50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-alloro-textDark">
                          {candidate.name}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          {typeof candidate.discoveryPosition === "number" && (
                            <span className="font-bold text-alloro-orange">
                              Maps estimate #{candidate.discoveryPosition}
                            </span>
                          )}
                          {typeof candidate.rating === "number" && (
                            <span>{candidate.rating.toFixed(1)} rating</span>
                          )}
                          {typeof candidate.reviewCount === "number" && (
                            <span>
                              {candidate.reviewCount.toLocaleString()} reviews
                            </span>
                          )}
                        </div>
                        {candidate.address && (
                          <div className="mt-1 truncate text-xs text-slate-400">
                            {candidate.address}
                          </div>
                        )}
                      </div>
                      {already ? (
                        <CheckCircle2
                          size={18}
                          className="mt-0.5 flex-shrink-0 text-green-500"
                        />
                      ) : (
                        <Plus
                          size={18}
                          className="mt-0.5 flex-shrink-0 text-alloro-orange"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <ul className="max-h-[430px] divide-y divide-black/5 overflow-y-auto overscroll-contain pr-2">
            <AnimatePresence initial={false}>
              {competitors.map((c) => {
                const distanceMi =
                  practiceLocation &&
                  typeof c.lat === "number" &&
                  typeof c.lng === "number"
                    ? haversineMiles(
                        { lat: practiceLocation.lat, lng: practiceLocation.lng },
                        { lat: c.lat, lng: c.lng }
                      )
                    : null;
                const websiteHost = c.website
                  ? (() => {
                      try {
                        return new URL(c.website).host.replace(/^www\./, "");
                      } catch {
                        return c.website;
                      }
                    })()
                  : null;
                return (
                <motion.li
                  key={c.placeId}
                  ref={(el) => registerRowRef(c.placeId, el)}
                  data-selected={selectedPlaceId === c.placeId}
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  onClick={() => onSelectFromList(c.placeId)}
                  className="competitor-row flex items-center justify-between gap-3 py-4 px-2 cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  {c.photoName && (
                    <img
                      src={`/api/practice-ranking/photo?name=${encodeURIComponent(c.photoName)}`}
                      alt=""
                      loading="lazy"
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-slate-100"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display =
                          "none";
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mb-0.5">
                      <a
                        href={`https://www.google.com/maps/place/?q=place_id:${c.placeId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="font-bold text-sm text-alloro-textDark hover:text-alloro-orange truncate"
                        title={`Open ${c.name} on Google Maps`}
                      >
                        {c.name}
                      </a>
                      {typeof c.rating === "number" && c.rating > 0 && (
                        <span className="flex items-center gap-1 text-xs font-bold text-alloro-textDark whitespace-nowrap">
                          <Star
                            size={12}
                            className="fill-yellow-400 text-yellow-400"
                          />
                          {c.rating.toFixed(1)}
                          {typeof c.reviewCount === "number" &&
                            c.reviewCount > 0 && (
                              <span className="font-medium text-slate-500">
                                ({c.reviewCount.toLocaleString()})
                              </span>
                            )}
                        </span>
                      )}
                      {c.primaryType && (
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {c.primaryType.replace(/_/g, " ")}
                        </span>
                      )}
                      <MapsEstimateChip competitor={c} />
                    </div>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      {distanceMi !== null && (
                        <span className="flex items-center gap-1 text-slate-500">
                          <MapPin size={11} className="text-slate-400" />
                          {formatDistance(distanceMi)}
                        </span>
                      )}
                      {c.phone && (
                        <a
                          href={`tel:${c.phone.replace(/\s+/g, "")}`}
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-slate-500 hover:text-alloro-orange"
                        >
                          <Phone size={11} className="text-slate-400" />
                          {c.phone}
                        </a>
                      )}
                      {websiteHost && c.website && (
                        <a
                          href={c.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-slate-500 hover:text-alloro-orange truncate max-w-[180px]"
                        >
                          <Globe size={11} className="text-slate-400" />
                          {websiteHost}
                        </a>
                      )}
                      {c.address && (
                        <span className="truncate text-slate-500">
                          {c.address}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md whitespace-nowrap ${
                      c.source === "user_added"
                        ? "bg-alloro-navy/10 text-alloro-navy"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {c.source === "user_added" ? "You added" : "Auto"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(c.placeId);
                    }}
                    className="w-8 h-8 rounded-lg bg-slate-50 hover:bg-red-50 hover:text-red-600 text-slate-400 flex items-center justify-center transition flex-shrink-0"
                    aria-label={`Remove ${c.name}`}
                  >
                    <X size={14} />
                  </button>
                </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>

          {competitors.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">
              Add at least one competitor before rerunning. A comparison set is
              required for a useful ranking snapshot.
            </p>
          )}
        </div>
      </div>

      <div className="sticky bottom-4 z-20 bg-alloro-navy rounded-2xl px-6 py-5 shadow-premium flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          {!isReselectMode && (
            <div className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">
              Step 3 of 3
            </div>
          )}
          <h3 className="text-xl font-black font-heading text-white">
            {isReselectMode ? "Save and rerun ranking" : "Run your first ranking"}
          </h3>
          <p className="text-sm text-white/70 font-medium mt-1">
            {isReselectMode
              ? "This reruns the ranking only. It does not create tasks."
              : "Lock your list and start the analysis. You can re-run on the 1st & 15th of each month."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {isReselectMode && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 bg-white/10 text-white px-5 py-3 rounded-2xl font-black text-sm hover:bg-white/15 transition"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onFinalize}
            disabled={competitors.length === 0}
            className="inline-flex items-center gap-2 bg-alloro-orange text-white px-6 py-3 rounded-2xl font-black text-sm shadow-lg hover:shadow-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReselectMode ? "Save & rerun ranking" : "Run ranking"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}

// =====================================================================
// Shared map component (used by Stage 1 reveal animation + Stage 2 static)
// =====================================================================

function makeCompetitorIcon(index: number, isSelected: boolean): L.DivIcon {
  return L.divIcon({
    className: "alloro-marker-wrapper",
    html: `<div class="alloro-pin alloro-pin-competitor${isSelected ? " is-selected" : ""}">${index + 1}</div>`,
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

function getRadiusBounds(
  center: [number, number],
  radiusMeters: number
): L.LatLngBounds {
  const [lat, lng] = center;
  const latDelta = radiusMeters / 111320;
  const lngMetersPerDegree = Math.max(
    1,
    111320 * Math.cos((lat * Math.PI) / 180)
  );
  const lngDelta = radiusMeters / lngMetersPerDegree;
  return L.latLngBounds(
    [lat - latDelta, lng - lngDelta],
    [lat + latDelta, lng + lngDelta]
  );
}

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

function CompetitorMap({
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
