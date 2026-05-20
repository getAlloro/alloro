/**
 * LocalRankingsReplica — visual replica of the real RankingsDashboard.
 *
 * Source: frontend/src/components/dashboard/RankingsDashboard.tsx
 * Copied: 2026-05-18
 *
 * Stripped: all query hooks, wizard demo data, URL param handling,
 * ranking job polling, callbacks, useNavigate, useSearchParams,
 * useIsWizardActive, useWizardDemoData, useLocationContext, animated
 * state transitions, CompetitorComparisonModal, framer-motion.
 *
 * Shows "data loaded" state only. No in-flight ranking banner, no loading.
 *
 * HotspotZone IDs: rank-badge, health-score, competitors-table, analysis-section
 */
import { Info, ChevronRight, Settings } from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { HotspotZone } from "../HotspotZone";

/* ── Color constants ─────────────────────────────────────────
   Only kept for values used in SVG fill/stroke attributes where
   Tailwind classes can't reach. Everything else uses Tailwind.
   ──────────────────────────────────────────────────────────── */
const C = {
  accent: "#D66853",
  green: "#22c55e",
  red: "#ef4444",
  amber: "#D9A441",
  navy: "#11151C",
} as const;

/* ── Fixture data ────────────────────────────────────────────
   Hardcoded to match the spec: Maps estimate #3, keyword
   "orthodontist near me", Practice Health 82/100, 8 factors,
   5 competitors, 3 next-move recommendation cards, star rating
   4.7 (142 reviews). "Improved from #5 to #3".
   ──────────────────────────────────────────────────────────── */

const FACTOR_LABEL: Record<string, string> = {
  category_match: "Category match",
  review_count: "Review count",
  star_rating: "Star rating",
  keyword_name: "Keyword in name",
  review_velocity: "Review velocity",
  nap_consistency: "NAP consistency",
  gbp_activity: "GBP activity",
  sentiment: "Review sentiment",
};

const FACTOR_TOOLTIP: Record<string, string> = {
  category_match:
    "How precisely your Google Business Profile primary category matches the search (e.g. 'Orthodontist' vs the more diluted 'Dentist'). A direct match is one of the strongest local signals.",
  review_count:
    "Total lifetime Google reviews on your profile. Volume compounds slowly and signals authority — the leader's review count is the long-game gap to close.",
  star_rating:
    "Your average Google review rating. Higher ratings improve clickthrough and carry weight in Google's local ranking algorithm.",
  keyword_name:
    "Whether your business name naturally contains the search keyword (e.g. 'Orthodontics' in the name). A mild relevance boost — never keyword-stuff.",
  review_velocity:
    "How many new reviews you're collecting per month. Recent inflow signals an active, engaged practice; this is usually the fastest-moving lever.",
  nap_consistency:
    "Whether your Name, Address, and Phone match exactly across Google, your website, and online directories. Mismatches reduce Google's confidence in your listing.",
  gbp_activity:
    "Frequency of GBP posts, photo uploads, and Q&A activity over the last 90 days. Active profiles (8+ posts/quarter) get a measurable lift.",
  sentiment:
    "How positive the text content of your recent reviews is. Beyond stars — Google reads review wording for relevance and quality signals.",
};

const rankingFactors = {
  category_match: { score: 95, weighted: 14.25, weight: 15 },
  review_count: { score: 72, weighted: 14.4, weight: 20, value: 142 },
  star_rating: { score: 94, weighted: 14.1, weight: 15, value: 4.7 },
  keyword_name: { score: 80, weighted: 8, weight: 10 },
  review_velocity: { score: 65, weighted: 9.75, weight: 15, value: 8 },
  nap_consistency: { score: 90, weighted: 9, weight: 10 },
  gbp_activity: { score: 70, weighted: 7, weight: 10, value: 12 },
  sentiment: { score: 88, weighted: 4.4, weight: 5 },
} as const;

/* Static cohort-comparison sub-lines matching the real component's
   computeCohortDelta() output. Only factors with reliable competitor
   data get a sub-line. */
const COHORT_DELTA: Record<string, string> = {
  review_count: "You: 142 · Cohort median: 129",
  star_rating: "You: 4.7★ · Cohort median: 4.6★",
  review_velocity: "You: 8 in 30d · Cohort median: 10",
  category_match: '4 of 5 share your "Orthodontist" primary category',
  keyword_name: "2 of 5 competitors carry a specialty keyword in their name",
};

const factorRows = Object.entries(rankingFactors)
  .map(([key, v]) => ({ key, ...v }))
  .sort((a, b) => b.weighted - a.weighted);

const competitors = [
  {
    placeId: "c1",
    name: "Smile Orthodontics",
    position: 1,
    rating: 4.9,
    reviewCount: 186,
    isClient: false,
    address: "125 Market St, Austin, TX 78701",
  },
  {
    placeId: "c2",
    name: "Perfect Teeth Ortho",
    position: 2,
    rating: 4.8,
    reviewCount: 157,
    isClient: false,
    address: "410 Congress Ave, Austin, TX 78701",
  },
  {
    placeId: "client",
    name: "Garrison Orthodontics",
    position: 3,
    rating: 4.7,
    reviewCount: 142,
    isClient: true,
    address: "800 W 5th St, Austin, TX 78703",
  },
  {
    placeId: "c3",
    name: "City Orthodontics",
    position: 4,
    rating: 4.6,
    reviewCount: 98,
    isClient: false,
    address: "220 E 6th St, Austin, TX 78701",
  },
  {
    placeId: "c4",
    name: "Austin Braces & Aligners",
    position: 5,
    rating: 4.5,
    reviewCount: 73,
    isClient: false,
    address: "1500 S Lamar Blvd, Austin, TX 78704",
  },
] as const;

const recommendations = [
  {
    priority: 1,
    title: "Increase review velocity",
    description:
      "Your current pace is 8 reviews/month vs. Smile Orthodontics at 14/month. Automate review requests after appointments to close the gap.",
  },
  {
    priority: 2,
    title: "Post to GBP weekly",
    description:
      "GBP Activity (70) is your weakest factor. Posting photos, updates, or offers once a week lifts this score measurably within 90 days.",
  },
  {
    priority: 3,
    title: "Add service-area pages",
    description:
      "Content targeting surrounding neighborhoods (e.g. 'orthodontist in Westlake') strengthens relevance signals for broader queries.",
  },
] as const;

const drivers = [
  { factor: "star_rating", weight: 15, direction: "positive", insight: "Your 4.7 average is above the cohort median of 4.6. Maintaining quality responses to reviews compounds this advantage." },
  { factor: "category_match", weight: 15, direction: "positive", insight: "Your primary category is 'Orthodontist' — a direct match to the search. This is one of the strongest local signals." },
  { factor: "nap_consistency", weight: 10, direction: "positive", insight: "Name, address, and phone number match across Google, your website, and major directories." },
  { factor: "review_velocity", weight: 15, direction: "negative", insight: "8 reviews in the last 30 days vs. 14 for the leader. This is usually the fastest lever to improve." },
  { factor: "gbp_activity", weight: 10, direction: "negative", insight: "Low GBP post frequency over the past 90 days. Active profiles (8+ posts/quarter) get a measurable lift." },
] as const;

const gaps = [
  { type: "review_velocity", impact: "high" as const, reason: "Your review velocity (8/month) is below Smile Orthodontics (14/month). Automating post-visit review requests would close this gap fastest." },
  { type: "gbp_activity", impact: "medium" as const, reason: "Your GBP activity score is 70 — well below the leader. Weekly GBP posts with photos lift this score within one quarter." },
] as const;

const practiceHealthScore = 82;
const previousHealthScore = 74;
const searchPosition = 3;
const searchQuery = "orthodontist near me";
const clientStarRating = 4.7;
const clientReviewCount = 142;
const clientReviewsLast30d = 8;
const marketAvgRating = 4.6;
const locationName = "Garrison Orthodontics";
const checkedDate = "May 15";

/* ── Small utility components ────────────────────────────────
   Mirrors the real RankingsDashboard's helper components with
   framer-motion and hook dependencies removed.
   ──────────────────────────────────────────────────────────── */

function MonoSlug({
  children,
  className = "text-alloro-textDark/40",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] font-bold uppercase tracking-[0.18em] ${className}`}
    >
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="font-display text-[15px] lg:text-base font-medium text-alloro-navy tracking-tight leading-tight">
      {children}
    </h3>
  );
}

function InfoTip({
  content,
  align = "center",
  placement = "bottom",
}: {
  content: string;
  align?: "center" | "left";
  placement?: "top" | "bottom";
}) {
  const tooltipPos =
    align === "left" ? "left-0" : "left-1/2 -translate-x-1/2";
  const arrowPos =
    align === "left" ? "left-3" : "left-1/2 -translate-x-1/2";
  const placementCls =
    placement === "top"
      ? "bottom-full mb-2 translate-y-1 group-hover/tip:translate-y-0 group-focus/tip:translate-y-0"
      : "top-full mt-2 -translate-y-1 group-hover/tip:translate-y-0 group-focus/tip:translate-y-0";
  const arrowEdgeCls =
    placement === "top"
      ? "top-full border-t-alloro-navy"
      : "bottom-full border-b-alloro-navy";
  return (
    <span
      className="relative inline-flex group/tip cursor-help shrink-0 outline-none"
      tabIndex={0}
      role="button"
      aria-label="More info"
    >
      <Info
        size={13}
        className="text-alloro-navy/35 hover:text-alloro-navy group-focus/tip:text-alloro-navy transition-colors"
      />
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 ${placementCls} ${tooltipPos} w-64 bg-alloro-navy text-white text-[11px] font-medium leading-relaxed rounded-lg px-3 py-2 shadow-lg opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible group-focus/tip:opacity-100 group-focus/tip:visible transition-[opacity,transform,visibility] duration-150 ease-out`}
      >
        <span
          className={`absolute ${arrowEdgeCls} ${arrowPos} w-0 h-0 border-[5px] border-transparent`}
        />
        {content}
      </span>
    </span>
  );
}

function StarIcon({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path
        d="M10 1.5l2.6 5.46 6.02.7-4.43 4.18 1.13 5.94L10 14.93 4.68 17.78l1.13-5.94L1.38 7.66l6.02-.7L10 1.5z"
        fill={C.amber}
      />
    </svg>
  );
}

function normalizeFactorPct(v: number | string | undefined): number {
  if (v === undefined || v === null) return 0;
  const n = typeof v === "string" ? parseFloat(v.replace("%", "")) : v;
  if (Number.isNaN(n)) return 0;
  return n > 1 ? n : n * 100;
}

function Delta({
  delta,
  suffix = "",
}: {
  delta: number | null | undefined;
  suffix?: string;
}) {
  if (delta === 0 || delta === null || delta === undefined) {
    return (
      <span className="text-[10px] font-bold text-alloro-navy/30 tabular-nums">
        —
      </span>
    );
  }
  const improved = delta > 0;
  const arrow = improved ? "▲" : "▼";
  const colorCls = improved ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums ${colorCls}`}
    >
      <span className="text-[9px]">{arrow}</span>
      {Math.abs(delta)}
      {suffix}
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  adornment,
}: {
  label: string;
  value: string;
  sub?: string;
  adornment?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <MonoSlug>{label}</MonoSlug>
      <div className="flex items-baseline gap-1.5">
        <span className="font-display text-[28px] font-medium tabular-nums leading-none">
          {value}
        </span>
        {adornment}
      </div>
      {sub && (
        <span className="text-[11px] font-semibold tabular-nums text-alloro-textDark/45">
          {sub}
        </span>
      )}
    </div>
  );
}

function HealthGauge({ value, prev }: { value: number; prev?: number | null }) {
  const v = Math.max(0, Math.min(100, value));
  const pathProgress = v / 100;
  const tone = v >= 80 ? C.green : v >= 60 ? C.accent : C.red;
  const delta =
    prev !== null && prev !== undefined ? Math.round(value - prev) : null;

  /* Half-arc gauge — strokeDasharray simulates the progress fill. The arc
     path length for "M 26 90 A 64 64 0 0 1 154 90" is ~201. */
  const arcLen = 201;
  const fillLen = arcLen * pathProgress;
  const gapLen = arcLen - fillLen;

  return (
    <div className="flex flex-col items-center text-center">
      <svg
        width="180"
        height="106"
        viewBox="0 0 180 106"
        className="overflow-visible"
      >
        <path
          d="M 26 90 A 64 64 0 0 1 154 90"
          fill="none"
          stroke="rgba(17,21,28,0.08)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 26 90 A 64 64 0 0 1 154 90"
          fill="none"
          stroke={tone}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${fillLen} ${gapLen}`}
        />
        <text
          x="90"
          y="76"
          textAnchor="middle"
          fontFamily="var(--font-display)"
          fontWeight="500"
          fontSize="34"
          fill={C.navy}
          className="tabular-nums"
        >
          {Math.round(v)}
        </text>
        <text
          x="90"
          y="96"
          textAnchor="middle"
          className="font-mono"
          fontSize="10"
          letterSpacing="0.16em"
          fill="rgba(17,21,28,0.40)"
        >
          / 100
        </text>
      </svg>
      {delta !== null && (
        <div className="mt-2">
          <Delta delta={delta} />
        </div>
      )}
    </div>
  );
}

/* ── Main replica ────────────────────────────────────────────── */

export function LocalRankingsReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  const verdictHint =
    practiceHealthScore >= 80
      ? "Excellent — protect what's working."
      : practiceHealthScore >= 60
        ? "Good. Clear path to climb."
        : "Needs improvement. Focus on velocity.";

  const positiveDrivers = drivers.filter((d) => d.direction === "positive");
  const negativeDrivers = drivers.filter((d) => d.direction !== "positive");

  return (
    <DashboardLayout activeItem="local-rankings">
      <div
        className="min-h-screen bg-alloro-bg font-body text-alloro-textDark pb-32 selection:bg-alloro-orange selection:text-white"
      >
        <main className="w-full max-w-[1320px] mx-auto px-6 lg:px-10 py-8 lg:py-10 space-y-6">
          {/* Page header */}
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] mb-2 text-alloro-textDark/45">
                Market Intelligence
              </div>
              <h1 className="font-display text-[28px] font-medium tracking-tight text-alloro-navy">
                Local Rankings
              </h1>
              <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-alloro-textDark/55">
                How you compare to competitors in your area.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-[14px] bg-white px-5 py-4 sm:flex-row sm:items-center border border-alloro-textDark/[0.06] shadow-premium">
              <div className="flex items-center gap-3">
                <span
                  className="text-[10px] font-black uppercase tracking-widest text-slate-400"
                >
                  Latest snapshot:
                </span>
                <span className="text-[12px] font-black text-alloro-navy">
                  {locationName} • {checkedDate}
                </span>
              </div>
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-[10px] bg-alloro-navy px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white"
              >
                <Settings size={13} />
                Manage competitors
              </button>
            </div>
          </div>

          {/* Practice Insight banner */}
          <section>
            <div className="rounded-[14px] px-5 py-4 lg:px-6 lg:py-5 bg-[#FCFAED] border border-[#EDE5C0]">
              <div className="flex items-center gap-1.5 mb-2 text-[#8A7A4A]">
                <Info size={12} />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em]">
                  Practice insight
                </span>
              </div>
              <p className="font-display text-[14px] leading-[1.65] text-[#2C2A26]">
                Strong position (#3/18) with room to grow via review velocity
                and GBP posts
              </p>
            </div>
          </section>

          {/* ── HERO — Maps Estimate + Practice Health ─────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-4 lg:gap-5">
            {/* LEFT — Google Maps estimate */}
            <HotspotZone
              id="rank-badge"
              hotspot={findHotspot("rank-badge")}
              isActive={activeHotspotId === "rank-badge"}
              onHotspotClick={onHotspotClick}
            >
              <div className="bg-white rounded-[14px] p-7 lg:p-9 border border-alloro-textDark/[0.06] shadow-premium">
                <div className="flex items-center justify-between mb-6 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#D66853]" />
                    <SectionTitle>Google Maps estimate</SectionTitle>
                    <InfoTip content="A sampled Google Maps position for the selected query and location. Results can vary by device, searcher location, and personalization, so treat this as an estimate, not a guaranteed exact rank." />
                  </div>
                  <span className="font-mono text-[10px] tracking-widest uppercase shrink-0 text-alloro-textDark/40">
                    checked {checkedDate}
                  </span>
                </div>

                {/* Big rank number */}
                <div className="flex items-end gap-5 lg:gap-7">
                  <div className="leading-[0.85]">
                    <div className="flex items-baseline">
                      <span className="font-display text-[110px] lg:text-[140px] font-medium tracking-tight tabular-nums text-[#D66853] leading-[0.85]">
                        #{searchPosition}
                      </span>
                    </div>
                  </div>

                  <div className="pb-6 min-w-0">
                    <div className="text-[13px] font-medium leading-relaxed max-w-[26ch] text-alloro-textDark/75">
                      for{" "}
                      <span className="font-bold text-alloro-navy">
                        {searchQuery}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Metric strip — Star rating + Reviews */}
                <div className="mt-7 pt-5 grid grid-cols-2 gap-4 border-t border-alloro-textDark/[0.06]">
                  <Metric
                    label="Star rating"
                    value={clientStarRating.toFixed(1)}
                    adornment={<StarIcon size={14} />}
                    sub={`Market avg ${marketAvgRating.toFixed(1)}`}
                  />
                  <Metric
                    label="Reviews"
                    value={clientReviewCount.toLocaleString()}
                    sub={`+${clientReviewsLast30d} in 30d`}
                  />
                </div>
              </div>
            </HotspotZone>

            {/* RIGHT — Practice Health gauge */}
            <HotspotZone
              id="health-score"
              hotspot={findHotspot("health-score")}
              isActive={activeHotspotId === "health-score"}
              onHotspotClick={onHotspotClick}
            >
              <div className="bg-white rounded-[14px] p-7 lg:p-9 flex flex-col border border-alloro-textDark/[0.06] shadow-premium">
                <div className="flex items-center mb-2 gap-2.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-green-500" />
                  <SectionTitle>Practice Health</SectionTitle>
                  <InfoTip content="Alloro's diagnostic score (0-100) for your local SEO fundamentals: review velocity, rating, profile completeness, NAP consistency, sentiment. Independent of your sampled Maps estimate." />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center pt-2">
                  <HealthGauge
                    value={practiceHealthScore}
                    prev={previousHealthScore}
                  />
                  <p className="mt-3 text-[12px] font-medium max-w-[28ch] text-center leading-relaxed text-alloro-textDark/65">
                    {verdictHint}
                  </p>
                </div>

                {/* CTA */}
                <div className="mt-5 flex justify-center pt-4 border-t border-alloro-textDark/[0.06]">
                  <button
                    type="button"
                    className="mx-auto inline-flex items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.12em] text-alloro-orange border border-[#D66853]/20 bg-[#D66853]/10"
                  >
                    See how I perform against competitors
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </HotspotZone>
          </section>

          {/* ── BODY — 2-col grid ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-5 lg:gap-6">
            {/* Left column */}
            <div className="space-y-5 lg:space-y-6 min-w-0">
              {/* Competitors table */}
              <HotspotZone
                id="competitors-table"
                hotspot={findHotspot("competitors-table")}
                isActive={activeHotspotId === "competitors-table"}
                onHotspotClick={onHotspotClick}
              >
                <section className="bg-white rounded-[14px] overflow-hidden border border-alloro-textDark/[0.06] shadow-premium">
                  <header className="px-6 lg:px-7 py-4 flex items-center justify-between gap-3 border-b border-alloro-textDark/[0.06]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#D66853]" />
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2">
                          <SectionTitle>
                            Top {competitors.length} on Google Maps
                          </SectionTitle>
                          <InfoTip content="The top results Google Maps shows for this search in your area. Your row is highlighted." />
                        </div>
                        <span className="text-[11.5px] font-medium truncate mt-0.5 text-alloro-textDark/45">
                          {searchQuery}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] tracking-widest uppercase shrink-0 text-alloro-textDark/35">
                      snapshot • {checkedDate}
                    </span>
                  </header>
                  <div>
                    {competitors.map((row) => {
                      const isYou = row.isClient;
                      return (
                        <div
                          key={row.placeId}
                          className={`grid grid-cols-[44px_1fr_auto] items-center gap-4 px-6 lg:px-7 py-3.5 transition-colors hover:bg-alloro-textDark/[0.025] border-b border-alloro-textDark/[0.06] ${isYou ? "bg-[#D66853]/[0.04]" : ""}`}
                        >
                          <div className="flex items-center justify-center">
                            <span
                              className={`font-extrabold text-[20px] tabular-nums ${row.position <= 3 ? "text-[#D66853]" : "text-alloro-textDark/[0.32]"}`}
                            >
                              #{row.position}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`font-bold truncate text-[15px] ${isYou ? "text-[#D66853]" : "text-alloro-textDark"}`}
                            >
                              {row.name}
                            </span>
                            {isYou && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-[0.16em] uppercase text-white shrink-0 bg-[#D66853]">
                                You
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-5 shrink-0">
                            <div className="flex items-center gap-1.5 tabular-nums text-[13px] font-bold text-alloro-navy/80">
                              <StarIcon size={12} /> {row.rating.toFixed(1)}
                            </div>
                            <div className="text-[13px] font-bold tabular-nums text-alloro-navy min-w-[52px] text-right">
                              {row.reviewCount.toLocaleString()}
                              <span className="ml-1 text-[10px] font-semibold text-alloro-navy/35 uppercase tracking-wider">
                                rev
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              </HotspotZone>

              {/* Drivers panel — What's driving visibility */}
              <section className="bg-white rounded-[14px] overflow-hidden border border-alloro-textDark/[0.06] shadow-premium">
                <header className="px-6 lg:px-7 py-4 flex items-center justify-between gap-3 border-b border-alloro-textDark/[0.06]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-alloro-textDark" />
                    <SectionTitle>What's driving visibility</SectionTitle>
                    <InfoTip content="The factors moving your local visibility most. Green is working for you; red is holding you back. Click a factor for the specific insight." />
                  </div>
                  <span className="font-mono text-[10px] tracking-widest uppercase shrink-0 text-alloro-textDark/40">
                    {drivers.length} factors
                  </span>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2">
                  {/* Working for you */}
                  <div>
                    <div className="px-6 lg:px-7 pt-5 pb-3 flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />
                      <span className="text-[12px] font-extrabold tracking-tight text-alloro-navy">
                        Working for you
                      </span>
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-widest tabular-nums text-alloro-textDark/35">
                        {positiveDrivers.length}
                      </span>
                    </div>
                    <ul className="px-3 lg:px-4 pb-3">
                      {positiveDrivers.map((d, i) => (
                        <li key={i}>
                          <details className="group rounded-xl px-3 lg:px-4 py-3 hover:bg-alloro-textDark/[0.025] transition-colors">
                            <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                className="shrink-0 text-alloro-textDark/35 transition-transform group-open:rotate-90"
                                aria-hidden
                              >
                                <path
                                  d="M3 1l4 4-4 4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span className="text-[13px] font-bold flex-1 truncate text-alloro-navy">
                                {FACTOR_LABEL[d.factor] || d.factor}
                              </span>
                              <span className="font-mono text-[10px] tracking-widest tabular-nums shrink-0 text-alloro-textDark/40">
                                weight {Math.round(normalizeFactorPct(d.weight))}
                              </span>
                            </summary>
                            {d.insight && (
                              <p className="mt-2 ml-[22px] text-[12.5px] leading-relaxed text-alloro-navy/70 max-w-[58ch]">
                                {d.insight}
                              </p>
                            )}
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {/* Holding you back */}
                  <div className="border-l border-alloro-textDark/[0.06]">
                    <div className="px-6 lg:px-7 pt-5 pb-3 flex items-center gap-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />
                      <span className="text-[12px] font-extrabold tracking-tight text-alloro-navy">
                        Holding you back
                      </span>
                      <span className="ml-auto font-mono text-[10px] uppercase tracking-widest tabular-nums text-alloro-textDark/35">
                        {negativeDrivers.length}
                      </span>
                    </div>
                    <ul className="px-3 lg:px-4 pb-3">
                      {negativeDrivers.map((d, i) => (
                        <li key={i}>
                          <details className="group rounded-xl px-3 lg:px-4 py-3 hover:bg-alloro-textDark/[0.025] transition-colors">
                            <summary className="flex items-center gap-3 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                              <svg
                                width="10"
                                height="10"
                                viewBox="0 0 10 10"
                                className="shrink-0 text-alloro-textDark/35 transition-transform group-open:rotate-90"
                                aria-hidden
                              >
                                <path
                                  d="M3 1l4 4-4 4"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.6"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                              <span className="text-[13px] font-bold flex-1 truncate text-alloro-navy">
                                {FACTOR_LABEL[d.factor] || d.factor}
                              </span>
                              <span className="font-mono text-[10px] tracking-widest tabular-nums shrink-0 text-alloro-textDark/40">
                                weight {Math.round(normalizeFactorPct(d.weight))}
                              </span>
                            </summary>
                            {d.insight && (
                              <p className="mt-2 ml-[22px] text-[12.5px] leading-relaxed text-alloro-navy/70 max-w-[58ch]">
                                {d.insight}
                              </p>
                            )}
                          </details>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            </div>

            {/* Right column */}
            <div className="space-y-5 lg:space-y-6 min-w-0">
              {/* Next Moves — top recommendations */}
              <HotspotZone
                id="analysis-section"
                hotspot={findHotspot("analysis-section")}
                isActive={activeHotspotId === "analysis-section"}
                onHotspotClick={onHotspotClick}
              >
                <section className="bg-white rounded-[14px] overflow-hidden border border-alloro-textDark/[0.06] shadow-premium">
                  <header className="px-6 lg:px-7 py-4 flex items-center justify-between gap-3 border-b border-alloro-textDark/[0.06]">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#D66853]" />
                      <SectionTitle>Top moves to climb</SectionTitle>
                      <InfoTip content="Highest-impact actions to improve local visibility, ordered by priority. Click any move to see why it matters and how to do it." />
                    </div>
                    <span className="font-mono text-[10px] tracking-widest uppercase shrink-0 text-alloro-textDark/40">
                      {recommendations.length} actions
                    </span>
                  </header>
                  <ol>
                    {recommendations.map((rec) => (
                      <li
                        key={rec.priority}
                        className="border-b border-alloro-textDark/[0.06]"
                      >
                        <details className="group">
                          <summary className="grid grid-cols-[36px_1fr_auto] gap-4 items-start px-6 lg:px-7 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-alloro-textDark/[0.025] transition-colors">
                            <div className="pt-0.5">
                              <div className="w-7 h-7 rounded-full flex items-center justify-center font-extrabold text-[12px] tabular-nums text-[#D66853] bg-[#D66853]/[0.06] border border-alloro-textDark/10">
                                {rec.priority}
                              </div>
                            </div>
                            <div className="min-w-0 pt-1">
                              <div className="font-bold text-[14.5px] tracking-tight text-alloro-navy">
                                {rec.title}
                              </div>
                            </div>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 10 10"
                              className="shrink-0 mt-2 text-alloro-textDark/35 transition-transform group-open:rotate-90"
                              aria-hidden
                            >
                              <path
                                d="M3 1l4 4-4 4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </summary>
                          {rec.description && (
                            <p className="px-6 lg:px-7 pb-5 pl-[60px] lg:pl-[64px] -mt-1 text-[12.5px] leading-relaxed text-alloro-navy/65 max-w-[64ch]">
                              {rec.description}
                            </p>
                          )}
                        </details>
                      </li>
                    ))}
                  </ol>
                </section>
              </HotspotZone>

              {/* Opportunities / Gaps */}
              <section className="bg-white rounded-[14px] overflow-hidden border border-alloro-textDark/[0.06] shadow-premium">
                <header className="px-6 lg:px-7 py-4 flex items-center justify-between gap-3 border-b border-alloro-textDark/[0.06]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#D9A441]" />
                    <SectionTitle>Opportunities</SectionTitle>
                    <InfoTip content="Specific gaps where competitors outperform you. High-impact gaps are the fastest path to climbing — click any gap for the details." />
                  </div>
                  <span className="font-mono text-[10px] tracking-widest uppercase shrink-0 text-alloro-textDark/40">
                    {gaps.length}
                  </span>
                </header>
                <ul>
                  {gaps.map((g, i) => {
                    const isHigh = g.impact === "high";
                    const toneCls = isHigh
                      ? "text-red-500 bg-red-500/10"
                      : "text-[#D9A441] bg-[#D9A441]/[0.14]";
                    return (
                      <li
                        key={i}
                        className="border-b border-alloro-textDark/[0.06]"
                      >
                        <details className="group">
                          <summary className="flex items-center gap-3 px-6 lg:px-7 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:bg-alloro-textDark/[0.025] transition-colors">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold tracking-[0.18em] uppercase shrink-0 ${toneCls}`}
                            >
                              {g.impact}
                            </span>
                            <span className="font-bold text-[13.5px] text-alloro-navy flex-1 truncate">
                              {FACTOR_LABEL[g.type] || g.type}
                            </span>
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 10 10"
                              className="shrink-0 text-alloro-textDark/35 transition-transform group-open:rotate-90"
                              aria-hidden
                            >
                              <path
                                d="M3 1l4 4-4 4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </summary>
                          <p className="px-6 lg:px-7 pb-4 -mt-1 text-[12.5px] leading-relaxed text-alloro-navy/65 max-w-[62ch]">
                            {g.reason}
                          </p>
                        </details>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Factor breakdown */}
              <section className="bg-white rounded-[14px] overflow-hidden border border-alloro-textDark/[0.06] shadow-premium">
                <header className="px-6 lg:px-7 py-4 flex items-center justify-between gap-3 border-b border-alloro-textDark/[0.06]">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-alloro-textDark" />
                    <SectionTitle>Ranking factor breakdown</SectionTitle>
                    <InfoTip content="Each ranking factor's score (0-100) and its weight in your Practice Health calculation. Sorted by weighted impact. Where data is available, each row shows your value and the cohort median for comparison." />
                  </div>
                  <span className="font-mono text-[10px] tracking-widest uppercase shrink-0 text-alloro-textDark/40">
                    weighted score
                  </span>
                </header>
                <ul className="px-6 lg:px-7 py-5 space-y-4">
                  {factorRows.map((row, idx) => {
                    const pct = Math.max(
                      0,
                      Math.min(100, normalizeFactorPct(row.score)),
                    );
                    const weightPct = Math.round(
                      normalizeFactorPct(row.weight),
                    );
                    const tone =
                      pct >= 80 ? C.green : pct >= 60 ? C.accent : C.red;
                    const tooltip = FACTOR_TOOLTIP[row.key];
                    const tipPlacement =
                      idx === factorRows.length - 1 ? "top" as const : "bottom" as const;
                    const cohortDelta = COHORT_DELTA[row.key] ?? null;
                    return (
                      <li
                        key={row.key}
                        className="grid grid-cols-[140px_1fr_60px_60px] sm:grid-cols-[180px_1fr_60px_60px] items-start gap-x-4 gap-y-1.5"
                      >
                        <span className="flex items-center gap-1.5 min-w-0 pt-0.5">
                          {tooltip && (
                            <InfoTip
                              content={tooltip}
                              align="left"
                              placement={tipPlacement}
                            />
                          )}
                          <span className="text-[12.5px] font-bold truncate text-alloro-navy">
                            {FACTOR_LABEL[row.key] || row.key}
                          </span>
                        </span>
                        <div className="min-w-0 flex flex-col gap-1.5 pt-1.5">
                          <div className="h-1.5 rounded-full overflow-hidden bg-alloro-textDark/[0.06]">
                            <div
                              className="h-full rounded-full transition-[width] duration-500 ease-out"
                              style={{
                                width: `${pct}%`,
                                background: tone,
                              }}
                            />
                          </div>
                          {cohortDelta && (
                            <span className="text-[10.5px] font-medium text-alloro-textDark/55 leading-snug whitespace-nowrap overflow-hidden text-ellipsis">
                              {cohortDelta}
                            </span>
                          )}
                        </div>
                        <span className="text-[12px] font-bold tabular-nums text-right text-alloro-navy pt-0.5">
                          {Math.round(pct)}
                          <span className="text-alloro-navy/30 font-semibold">
                            {" "}
                            /100
                          </span>
                        </span>
                        <span className="font-mono text-[10px] uppercase tracking-widest text-right tabular-nums pt-1 text-alloro-textDark/40">
                          w {weightPct}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
