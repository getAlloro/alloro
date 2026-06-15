import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Plus,
  X,
  Search,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Star,
  MapPin,
  Phone,
  Globe,
  Info,
} from "lucide-react";
import {
  type CuratedCompetitor,
  type ComparisonSpecialtyOption,
  type PracticeLocationRef,
  type SelfFilterStatus,
} from "../../../api/practiceRanking";
import { type PlaceSuggestion } from "../../../api/places";
import { haversineMiles, formatDistance } from "../util.distance";
import { RadiusControl } from "./RadiusControl";
import { CompetitorMap } from "./CompetitorMap";
import { MapsEstimateChip } from "./MapsEstimateChip";

export function CuratingStage({
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
