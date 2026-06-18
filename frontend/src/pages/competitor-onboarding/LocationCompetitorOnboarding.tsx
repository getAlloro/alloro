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

import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Sparkles } from "lucide-react";
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
  type ComparisonSpecialtyOption,
  type PracticeLocationRef,
  type SelfFilterStatus,
} from "../../api/practiceRanking";
import { searchPlaces, type PlaceSuggestion } from "../../api/places";
import { type Stage } from "./locationCompetitorOnboarding.types";
import {
  DEFAULT_DISCOVERY_RADIUS_METERS,
  PULSE_DURATION_MS,
  errorMessage,
  suggestionToCuratedCompetitor,
} from "./locationCompetitorOnboarding.utils";
import { LoadingState } from "./LocationCompetitorOnboarding/LoadingState";
import { FinalizingState } from "./LocationCompetitorOnboarding/FinalizingState";
import { RefreshSuggestionsConfirmModal } from "./LocationCompetitorOnboarding/RefreshSuggestionsConfirmModal";
import { DiscoveringStage } from "./LocationCompetitorOnboarding/DiscoveringStage";
import { CuratingStage } from "./LocationCompetitorOnboarding/CuratingStage";

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
