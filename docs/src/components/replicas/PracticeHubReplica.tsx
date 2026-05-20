// Copied from: frontend/src/components/dashboard/DashboardOverview.tsx + sub-components @ v0.0.82
// Sub-components inlined: FocusHeader, Hero (HeroBody), Trajectory, ActionQueue, WebsiteCard, LocalRankingCard, PMSCard
// Utility sub-components inlined: Sparkline, FactorBar, HighlightedText, DomainStrips, StatCell, etc.

import {
  ArrowRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  MapPin,
  TrendingUp,
  Inbox,
  UserPlus,
} from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { DashboardLayout } from "./DashboardLayout";
import { HotspotZone } from "../HotspotZone";

// =====================================================================
// Fake data — hardcoded happy-path
// =====================================================================

const FOCUS_MONTH_LABEL = "May 2026";
const PERIOD_LABEL = "MAY 1 - MAY 31";

const HERO_DATA = {
  title: "Close the review velocity gap with Austin Family Dental",
  rationale:
    "Smile Clinic averages 7 reviews/month while your top competitor pulls 12/month. Closing this gap directly lifts your Maps position from #3 toward #1, boosting form submissions by an estimated 18-25%.",
  urgency: "high" as const,
  domain: "review",
  highlights: ["review velocity gap", "Austin Family Dental", "#3 toward #1"],
  supporting_metrics: [
    { label: "Your velocity", value: "7/mo", sub: "avg" },
    { label: "Competitor velocity", value: "12/mo", sub: "Austin Family" },
    { label: "Maps position", value: "#3", sub: "up from #5" },
  ],
  outcome: {
    deliverables:
      "Review velocity parity (12/month target within 60 days through automated post-visit SMS sequences)",
    mechanism:
      "Automated SMS requests trigger 48h after appointments. Expected lift: 5-7 additional reviews per month based on 35% response rate.",
  },
  domain_summaries: [
    {
      domain: "review",
      heading: "Reviews",
      summary: "7/mo velocity, 4.8 avg rating",
      detail:
        "Review velocity increased from 4/mo to 7/mo over the last 90 days. Average rating is 4.8 with 94% positive sentiment. Primary gap is volume vs. top 3 competitors.",
    },
    {
      domain: "ranking",
      heading: "Local Ranking",
      summary: "#3 Maps, Practice Health 82",
      detail:
        "Position improved from #5 to #3 this month. Practice Health score moved from 74 to 82. Biggest remaining lever is review velocity.",
    },
    {
      domain: "referral",
      heading: "Referrals",
      summary: "+22% QoQ growth",
      detail:
        "Doctor referrals are up 22% quarter-over-quarter, driven primarily by Dr. Sarah Miller's expanding relationship (14 referrals this month).",
    },
  ],
};

const TRAJECTORY_DATA = {
  greeting: "Good evening, Alex.",
  trajectory:
    "Smile Clinic is on a strong upward trajectory this month. Review velocity increased to 7/month, Practice Health moved from 74 to 82, and Google Maps position improved from #5 to #3. The main growth lever is closing the review velocity gap with Austin Family Dental (12/month). PMS data shows 22% QoQ referral growth driven by Dr. Sarah Miller's expanding relationship.",
  highlights: [
    "strong upward trajectory",
    "review velocity gap",
    "Austin Family Dental",
    "Dr. Sarah Miller",
  ],
  stats: {
    production: { value: "$221,100", trend: { text: "+22%", up: true } },
    starts: { value: "187", trend: { text: "--", up: null } },
    visibility: { value: "82", trend: { text: "--", up: null } },
  },
};

const QUEUE_ROWS = [
  {
    id: 1,
    domain: "review",
    title: "Respond to 3 unread Google reviews from this week",
    urgency: "High" as const,
    due: "May 20",
    agent: "summary" as const,
  },
  {
    id: 2,
    domain: "form-submission",
    title: "Follow up on 2 flagged form submissions",
    urgency: "Med" as const,
    due: "May 22",
    agent: "re" as const,
  },
  {
    id: 3,
    domain: "gbp",
    title: "Post a GBP update with May office photos",
    urgency: "Low" as const,
    due: "May 25",
    agent: "summary" as const,
  },
];

const WEBSITE_DATA = {
  verifiedCount: 82,
  unread: 3,
  flagged: 1,
  sparkData: [12, 18, 22, 28, 24, 32, 38, 42, 48, 56, 68, 82],
  sparkLabels: { first: "Jun", middle: "Dec", last: "May" },
};

const RANKING_DATA = {
  mapsEstimate: 3,
  practiceHealth: 82,
  category: "Orthodontist",
  city: "Austin, TX",
  googleFactors: [
    { key: "category_match", label: "Category match", score: 0.92 },
    { key: "keyword_name", label: "Keyword in name", score: 0.45 },
    { key: "gbp_activity", label: "GBP activity", score: 0.78 },
    { key: "nap_consistency", label: "NAP consistency", score: 0.88 },
  ],
  healthFactors: [
    { key: "star_rating", label: "Star rating", score: 0.96 },
    { key: "review_count", label: "Review count", score: 0.62 },
    { key: "review_velocity", label: "Review velocity", score: 0.58 },
    { key: "sentiment", label: "Sentiment", score: 0.91 },
  ],
  lowestFactor: "Review velocity",
};

const PMS_DATA = {
  production: 47000,
  productionChange: 22,
  totalReferrals: 187,
  doctorRefs: 116,
  selfRefs: 71,
  sparkData: [
    28000, 31000, 29500, 34000, 32000, 36000, 38500, 41000, 39000, 43000,
    45000, 47000,
  ],
  sparkLabels: { first: "Jun '25", middle: "Dec '25", last: "May '26" },
  topSources: [
    {
      rank: 1,
      name: "Dr. Sarah Miller",
      referrals: 14,
      production: 12800,
      trend: { dir: "up" as "up" | "down", value: "+28%" },
    },
    {
      rank: 2,
      name: "Dr. James Chen",
      referrals: 9,
      production: 8200,
      trend: { dir: "up" as "up" | "down", value: "+12%" },
    },
    {
      rank: 3,
      name: "Riverside Pediatrics",
      referrals: 7,
      production: 6400,
      trend: null,
    },
  ],
};

// =====================================================================
// Domain icon lookup (inlined from focus/icons.ts)
// =====================================================================

type DomainIconEntry = { Comp: typeof MessageSquare; cls: string };

const DOMAIN_ICONS: Record<string, DomainIconEntry> = {
  review: { Comp: MessageSquare, cls: "bg-purple-50 text-purple-500" },
  gbp: { Comp: MapPin, cls: "bg-blue-50 text-blue-500" },
  ranking: { Comp: TrendingUp, cls: "bg-emerald-50 text-emerald-500" },
  "form-submission": { Comp: Inbox, cls: "bg-amber-50 text-amber-500" },
  referral: { Comp: UserPlus, cls: "bg-rose-50 text-rose-500" },
};

const FALLBACK_ICON: DomainIconEntry = {
  Comp: TrendingUp,
  cls: "bg-emerald-50 text-emerald-500",
};

function getDomainIcon(domain: string): DomainIconEntry {
  return DOMAIN_ICONS[domain] ?? FALLBACK_ICON;
}

// =====================================================================
// Color / font constants (inlined from cards)
// =====================================================================

const CARD_BG = "#FDFDFD";
const CARD_BORDER = "#E8E4DD";
const BRAND_ORANGE = "#D66853";
const PMS_GREEN = "#4F8A5B";
const SELF_GREY = "#D6CFC2";
const MUTED = "#8E8579";
const MUTED_2 = "#A8A192";
const INK = "#1F1B16";
const INK_SOFT = "#3A342B";
const LINE_SOFT = "#F0ECE5";
const BAR_BG = "#F0ECE5";

const FRAUNCES =
  "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif";
const MONO =
  "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// =====================================================================
// Inline utility components
// =====================================================================

function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights?: string[];
}) {
  if (!highlights || highlights.length === 0) return <>{text}</>;
  const sorted = highlights
    .filter((h): h is string => Boolean(h && h.length))
    .sort((a, b) => b.length - a.length);
  if (sorted.length === 0) return <>{text}</>;
  const escaped = sorted.map((s) =>
    s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const re = new RegExp(`(${escaped.join("|")})`, "g");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        sorted.includes(part) ? (
          <mark key={i} className="hl">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function Sparkline({
  data,
  color,
  fillId,
  height = 64,
  width = 240,
}: {
  data: number[];
  color: string;
  fillId: string;
  height?: number;
  width?: number;
}) {
  const safeData = data.length > 0 ? data : [0, 0];
  const min = Math.min(...safeData);
  const max = Math.max(...safeData);
  const pad = (max - min) * 0.15 || 1;
  const lo = min - pad;
  const hi = max + pad;
  const w = width;
  const h = height;
  const stepX = safeData.length > 1 ? w / (safeData.length - 1) : w;

  const points: Array<[number, number]> = safeData.map((v, i) => {
    const x = i * stepX;
    const y = h - ((v - lo) / (hi - lo)) * h;
    return [x, y];
  });

  const linePath = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
  const last = points[points.length - 1];

  return (
    <svg
      className="w-full h-16 block"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${fillId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="3" fill={color} />
          <circle
            cx={last[0]}
            cy={last[1]}
            r="6"
            fill={color}
            opacity="0.18"
          />
        </>
      )}
    </svg>
  );
}

function FactorBar({ label, score }: { label: string; score: number }) {
  const clamped = Math.max(0, Math.min(1, score));
  const pct = clamped * 100;
  const fillColor =
    clamped >= 0.7 ? "#4F8A5B" : clamped >= 0.5 ? "#D66853" : "#B3503E";

  return (
    <div
      className="grid items-center gap-2.5 py-[5px]"
      style={{ gridTemplateColumns: "28% 1fr 32px" }}
    >
      <div
        className="font-medium text-neutral-700"
        style={{ fontSize: "11.5px" }}
      >
        {label}
      </div>
      <div
        className="relative overflow-hidden rounded-full"
        style={{ height: 6, background: BAR_BG }}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: fillColor }}
        />
      </div>
      <div
        className="text-right font-medium text-neutral-400"
        style={{ fontFamily: MONO, fontSize: 11 }}
      >
        {clamped.toFixed(2)}
      </div>
    </div>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col"
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        borderRadius: 14,
        padding: "24px 24px 22px",
      }}
    >
      {children}
    </section>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="mb-2.5 flex items-center gap-2 font-bold uppercase"
      style={{ color: MUTED, fontSize: 10, letterSpacing: "0.16em" }}
    >
      <span
        className="inline-block rounded-full"
        style={{ width: 6, height: 6, background: INK }}
      />
      {children}
    </div>
  );
}

// =====================================================================
// Hero helpers (inlined from focus/Hero.tsx)
// =====================================================================

function urgencyPillClasses(urgency: string): string {
  switch (urgency) {
    case "high":
      return "bg-[rgba(179,80,62,0.18)] text-[#F0A98E] border border-[rgba(179,80,62,0.28)]";
    case "medium":
      return "bg-[rgba(214,160,80,0.16)] text-[#E8C792] border border-[rgba(214,160,80,0.24)]";
    case "low":
    default:
      return "bg-white/5 text-[#C5BEB1] border border-white/10";
  }
}

function urgencyLabel(urgency: string): string {
  switch (urgency) {
    case "high":
      return "URGENT";
    case "medium":
      return "MEDIUM PRIORITY";
    case "low":
      return "STEADY";
    default:
      return "PRIORITY";
  }
}

const DOMAIN_LABELS: Record<string, string> = {
  review: "Reviews",
  gbp: "Google Business",
  ranking: "Local Ranking",
  "form-submission": "Form Submissions",
  "pms-data-quality": "PMS Data",
  referral: "Referrals",
};

function splitDeliverables(deliverables: string): {
  head: string;
  tail: string;
} {
  const idx = deliverables.indexOf(" (");
  if (idx === -1) return { head: deliverables, tail: "" };
  return {
    head: deliverables.slice(0, idx),
    tail: deliverables.slice(idx),
  };
}

// =====================================================================
// ActionQueue helpers (inlined from focus/ActionQueue.tsx)
// =====================================================================

const URGENCY_TEXT_CLASS: Record<string, string> = {
  High: "text-[#C0392B] font-bold",
  Med: "text-[#B7791F] font-bold",
  Low: "text-[#6B7280] font-semibold",
};

// =====================================================================
// Main component
// =====================================================================

export function PracticeHubReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  const { head: delivHead, tail: delivTail } = splitDeliverables(
    HERO_DATA.outcome.deliverables,
  );

  const DomainIcon = getDomainIcon(HERO_DATA.domain).Comp;
  const domainLabel = DOMAIN_LABELS[HERO_DATA.domain] ?? "Reviews";

  const doctorPct =
    PMS_DATA.totalReferrals > 0
      ? Math.round(
          (PMS_DATA.doctorRefs / PMS_DATA.totalReferrals) * 100,
        )
      : 0;
  const selfPct = PMS_DATA.totalReferrals > 0 ? 100 - doctorPct : 0;

  const googleAvg = Math.round(
    (RANKING_DATA.googleFactors.reduce((s, f) => s + f.score, 0) /
      RANKING_DATA.googleFactors.length) *
      100,
  );
  const healthAvg = Math.round(
    (RANKING_DATA.healthFactors.reduce((s, f) => s + f.score, 0) /
      RANKING_DATA.healthFactors.length) *
      100,
  );

  return (
    <DashboardLayout activeItem="practice-hub">
      <div className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-16 space-y-6">
        {/* === Focus Header Section === */}
        <HotspotZone
          id="focus-header"
          hotspot={findHotspot("focus-header")}
          isActive={activeHotspotId === "focus-header"}
          onHotspotClick={onHotspotClick}
        >
          <div className="flex items-end justify-between gap-6 mb-6">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6B7280] mb-2">
                The month at a glance
              </div>
              <h2 className="font-display text-[28px] font-normal tracking-tight text-[#1A1A1A]">
                Focus — {FOCUS_MONTH_LABEL}
              </h2>
              <p className="mt-1.5 text-[13px] text-[#6B7280] max-w-[540px] leading-relaxed">
                One priority. Everything else, in order.
              </p>
            </div>
            <div className="hidden md:flex flex-col items-end gap-3">
              <div className="flex items-center gap-3.5 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[#6B7280]">
                <span>Period</span>
                <span className="font-display text-[22px] font-medium text-[#1A1A1A] tracking-tight">
                  {PERIOD_LABEL}
                </span>
              </div>
            </div>
          </div>
        </HotspotZone>

        {/* === Hero Section === */}
        <HotspotZone
          id="hero-card"
          hotspot={findHotspot("hero-card")}
          isActive={activeHotspotId === "hero-card"}
          onHotspotClick={onHotspotClick}
        >
          <section
            className="focus-card-dark relative overflow-hidden rounded-[14px] border border-[#2A2722] text-[#F5F1EA]"
            style={{
              background:
                "radial-gradient(60% 50% at 88% -10%, rgba(201,118,94,0.18), rgba(201,118,94,0) 60%), radial-gradient(40% 60% at 0% 110%, rgba(201,118,94,0.08), rgba(201,118,94,0) 70%), linear-gradient(180deg, #1A1A18 0%, #0F0F0E 100%)",
            }}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent, rgba(201,118,94,0.5), transparent)",
              }}
            />
            <div className="grid gap-10 px-10 py-9 lg:grid-cols-[minmax(0,1fr)_460px] xl:grid-cols-[minmax(0,1fr)_500px]">
              {/* LEFT */}
              <div className="min-w-0">
                {/* Pills row */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(201,118,94,0.18)] px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#F0A98E]">
                    <span className="h-[5px] w-[5px] rounded-full bg-[#F0A98E]" />
                    This month &middot; 1 thing that matters
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] ${urgencyPillClasses(HERO_DATA.urgency)}`}
                  >
                    {urgencyLabel(HERO_DATA.urgency)}
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-[5px] text-[10px] font-bold uppercase tracking-[0.1em] text-[#D6CFC2]">
                    <DomainIcon size={11} className="text-[#D6CFC2]" />
                    {domainLabel}
                  </span>
                </div>

                {/* Headline */}
                <h1 className="font-display mt-[22px] mb-[22px] max-w-[620px] text-[40px] font-medium leading-[1.04] tracking-[-0.02em] text-[#F5F1EA] lg:text-[44px]">
                  <HighlightedText
                    text={HERO_DATA.title}
                    highlights={HERO_DATA.highlights}
                  />
                </h1>

                {/* Rationale */}
                <p className="mb-5 max-w-[580px] text-[14.5px] leading-[1.65] text-[#C5BEB1]">
                  <HighlightedText
                    text={HERO_DATA.rationale}
                    highlights={HERO_DATA.highlights}
                  />
                </p>

                {/* Domain summary strips */}
                <div className="mt-4 divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.03] px-4">
                  {HERO_DATA.domain_summaries.map((ds) => {
                    const { Comp, cls } = getDomainIcon(ds.domain);
                    return (
                      <div key={ds.domain} className="w-full text-left">
                        <div className="flex items-center gap-3 py-2.5">
                          <span
                            className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md ${cls}`}
                            aria-hidden="true"
                          >
                            <Comp size={12} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-[#F5F1EA]">
                              {ds.heading}
                            </span>
                            <span className="ml-2 text-[12px] text-[#8E8579]">
                              {ds.summary}
                            </span>
                          </span>
                          <ChevronDown
                            size={13}
                            className="shrink-0 text-[#8E8579]"
                            aria-hidden="true"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT - Why panel */}
              <aside className="self-start rounded-xl border border-white/10 bg-black/30 p-[22px]">
                <div className="mb-[18px]">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8579]">
                    Why this first
                  </span>
                </div>

                <div className="grid gap-3">
                  {HERO_DATA.supporting_metrics.slice(0, 3).map((stat, i) => {
                    const accent = i === 0;
                    return (
                      <div
                        key={i}
                        className="rounded-[10px] border border-white/10 bg-white/[0.035] px-4 py-3"
                      >
                        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#C5BEB1]">
                            {stat.label}
                          </div>
                          <div
                            className={`font-display max-w-full break-words text-left text-[24px] font-medium leading-[1.05] tracking-[-0.02em] sm:max-w-[58%] sm:text-right ${
                              accent
                                ? "text-alloro-orange"
                                : "text-[#F5F1EA]"
                            }`}
                          >
                            {stat.value}
                            {stat.sub && (
                              <span
                                className={`ml-1 text-[13px] font-normal ${
                                  accent
                                    ? "text-[rgba(201,118,94,0.65)]"
                                    : "text-[#8E8579]"
                                }`}
                              >
                                {stat.sub}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="my-[18px] border-t border-white/10" />

                <div className="mb-2.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#8E8579]">
                    What this does
                  </span>
                </div>
                <p className="text-[13px] leading-[1.6] text-[#E5DFD3]">
                  <strong className="font-semibold text-[#B5D89C]">
                    {delivHead}
                  </strong>
                  {delivTail}
                </p>
                <p className="mt-2.5 text-[12px] leading-[1.55] text-[#8E8579]">
                  {HERO_DATA.outcome.mechanism}
                </p>
              </aside>
            </div>
          </section>
        </HotspotZone>

        {/* === Trajectory + Action Queue Row === */}
        <div className="grid gap-6 grid-cols-1 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* === Trajectory Section === */}
          <HotspotZone
            id="trajectory-timeline"
            hotspot={findHotspot("trajectory-timeline")}
            isActive={activeHotspotId === "trajectory-timeline"}
            onHotspotClick={onHotspotClick}
          >
            <section className="rounded-[14px] bg-white p-8 shadow-sm ring-1 ring-slate-100">
              {/* Pills row */}
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                  Trajectory &middot; Latest update
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Growth looks good
                </span>
              </div>

              {/* Salutation headline */}
              <h2 className="mt-[14px] font-display text-[30px] font-medium leading-tight tracking-[-0.02em] text-slate-900">
                {TRAJECTORY_DATA.greeting}
              </h2>

              {/* Body paragraph */}
              <p className="mt-[14px] max-w-[680px] text-[15px] leading-[1.65] text-slate-600">
                <HighlightedText
                  text={TRAJECTORY_DATA.trajectory}
                  highlights={TRAJECTORY_DATA.highlights}
                />
              </p>

              {/* Footer row */}
              <div className="mt-[22px] flex items-center gap-[18px]">
                <span className="inline-flex items-center gap-1.5 bg-transparent text-[13px] font-semibold text-[#D66853]">
                  Read full explanation
                  <ArrowRight size={11} strokeWidth={2.5} />
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                  Updated 1d ago
                </span>
              </div>

              {/* Mini-stats row */}
              <div className="mt-[22px] grid grid-cols-3 gap-6 border-t border-slate-100 pt-[22px]">
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Production MTD
                  </span>
                  <span className="font-display text-[22px] font-medium tracking-[-0.02em] text-slate-900">
                    {TRAJECTORY_DATA.stats.production.value}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                    <ArrowUpRight size={11} strokeWidth={2.5} />
                    {TRAJECTORY_DATA.stats.production.trend.text}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    New patient starts
                  </span>
                  <span className="font-display text-[22px] font-medium tracking-[-0.02em] text-slate-900">
                    {TRAJECTORY_DATA.stats.starts.value}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                    {TRAJECTORY_DATA.stats.starts.trend.text}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    Visibility score
                  </span>
                  <span className="font-display text-[22px] font-medium tracking-[-0.02em] text-slate-900">
                    {TRAJECTORY_DATA.stats.visibility.value}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                    {TRAJECTORY_DATA.stats.visibility.trend.text}
                  </span>
                </div>
              </div>
            </section>
          </HotspotZone>

          {/* === Action Queue Section === */}
          <HotspotZone
            id="action-queue"
            hotspot={findHotspot("action-queue")}
            isActive={activeHotspotId === "action-queue"}
            onHotspotClick={onHotspotClick}
          >
            <section className="flex flex-col rounded-[14px] border border-[#EDE8DE] bg-white p-[22px_22px_18px] shadow-[0_1px_2px_rgba(20,18,12,0.04)]">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#6B7280]">
                  Queue &middot; {QUEUE_ROWS.length} more
                </span>
                <span className="inline-flex items-center gap-1.5 bg-transparent text-[12px] font-semibold text-alloro-orange">
                  Open tasks
                  <ArrowRight size={11} aria-hidden="true" />
                </span>
              </div>

              <div className="flex flex-1 flex-col">
                {QUEUE_ROWS.map((row, i) => {
                  const { Comp, cls } = getDomainIcon(row.domain);
                  const isRe = row.agent === "re";
                  const agentLabel = isRe ? "Referral Engine" : "Summary";
                  const agentCls = isRe
                    ? "bg-[#F7E1D6] text-[#8A4A36]"
                    : "bg-[#F0ECE5] text-[#8E8579]";
                  const isLast = i === QUEUE_ROWS.length - 1;

                  return (
                    <div
                      key={row.id}
                      className={`group -mx-1.5 flex w-full items-center gap-3 rounded-md px-1.5 py-3 text-left ${
                        isLast ? "" : "border-b border-[#F0ECE5]"
                      }`}
                    >
                      <span
                        className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg ${cls}`}
                        aria-hidden="true"
                      >
                        <Comp size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold leading-[1.35] text-alloro-textDark">
                          {row.title}
                        </span>
                        <span className="mt-[3px] flex flex-wrap items-center gap-1.5 text-[11px] text-[#6B7280]">
                          <span className={URGENCY_TEXT_CLASS[row.urgency]}>
                            {row.urgency}
                          </span>
                          <span
                            className="inline-block h-[2.5px] w-[2.5px] rounded-full bg-[#C9C2B5]"
                            aria-hidden="true"
                          />
                          <span>Due {row.due}</span>
                          <span
                            className="inline-block h-[2.5px] w-[2.5px] rounded-full bg-[#C9C2B5]"
                            aria-hidden="true"
                          />
                          <span
                            className={`inline-flex items-center rounded-[4px] px-1.5 py-[2px] text-[9.5px] font-bold uppercase tracking-[0.06em] ${agentCls}`}
                          >
                            {agentLabel}
                          </span>
                        </span>
                      </span>
                      <ChevronRight
                        size={15}
                        className="shrink-0 text-[#C9C2B5]"
                        aria-hidden="true"
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          </HotspotZone>
        </div>

        {/* === Bottom Status Row (3-col grid) === */}
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          {/* === Website Card Section === */}
          <HotspotZone
            id="website-card"
            hotspot={findHotspot("website-card")}
            isActive={activeHotspotId === "website-card"}
            onHotspotClick={onHotspotClick}
          >
            <CardShell>
              <Eyebrow>Website &middot; Form submissions</Eyebrow>

              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  style={{
                    fontFamily: FRAUNCES,
                    fontWeight: 500,
                    fontSize: 32,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                    color: INK,
                  }}
                >
                  {WEBSITE_DATA.verifiedCount}
                </span>
                <span
                  className="font-medium"
                  style={{ fontSize: 12, color: MUTED }}
                >
                  verified leads
                </span>
                <span
                  className="ml-auto font-bold"
                  style={{ fontSize: 11, color: PMS_GREEN }}
                >
                  &#9650; +18%
                </span>
              </div>

              <div
                className="mt-1.5 leading-relaxed"
                style={{ fontSize: 12, color: MUTED }}
              >
                {WEBSITE_DATA.unread} unread &middot; {WEBSITE_DATA.flagged}{" "}
                flagged &middot; vs last 30 days
              </div>

              <div className="mt-4">
                <Sparkline
                  data={WEBSITE_DATA.sparkData}
                  color={BRAND_ORANGE}
                  fillId="ws-grad"
                />
                <div
                  className="mt-1 grid font-semibold uppercase"
                  style={{
                    gridTemplateColumns: "1fr 1fr 1fr",
                    fontSize: 9.5,
                    letterSpacing: "0.1em",
                    color: MUTED,
                  }}
                >
                  <span>{WEBSITE_DATA.sparkLabels.first}</span>
                  <span style={{ textAlign: "center" }}>
                    {WEBSITE_DATA.sparkLabels.middle}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {WEBSITE_DATA.sparkLabels.last}
                  </span>
                </div>
              </div>

              <div
                className="mt-3.5 rounded-[10px] border px-3 py-2.5 leading-relaxed"
                style={{
                  background: "#FFF7F2",
                  borderColor: "#F3D6C4",
                  color: "#8A4A36",
                  fontSize: 12,
                }}
              >
                <strong style={{ color: BRAND_ORANGE, fontWeight: 700 }}>
                  Coming soon:
                </strong>{" "}
                sessions, bounce rate, avg session duration via Rybbit.
              </div>

              <div className="mt-4 flex items-center justify-between">
                <span
                  className="inline-flex items-center gap-1.5 bg-transparent font-semibold"
                  style={{ color: BRAND_ORANGE, fontSize: 12 }}
                >
                  View submissions
                  <ArrowRight size={11} />
                </span>
                <span style={{ fontSize: 11, color: MUTED }}>Last 12 mo</span>
              </div>
            </CardShell>
          </HotspotZone>

          {/* === Local Ranking Card Section === */}
          <HotspotZone
            id="local-ranking-card"
            hotspot={findHotspot("local-ranking-card")}
            isActive={activeHotspotId === "local-ranking-card"}
            onHotspotClick={onHotspotClick}
          >
            <CardShell>
              <Eyebrow>Local Visibility</Eyebrow>

              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  style={{
                    fontFamily: FRAUNCES,
                    fontWeight: 500,
                    fontSize: 32,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                    color: INK,
                  }}
                >
                  #{RANKING_DATA.mapsEstimate}
                </span>
                <span
                  className="font-medium"
                  style={{ fontSize: 12, color: MUTED }}
                >
                  Maps estimate
                </span>
              </div>

              <div
                className="mt-1.5 leading-relaxed"
                style={{ fontSize: 12, color: MUTED }}
              >
                Practice Health {RANKING_DATA.practiceHealth}/100 &middot;{" "}
                {RANKING_DATA.category} &middot; {RANKING_DATA.city}
              </div>

              {/* Google Maps signals */}
              <div className="mt-4">
                <div className="mb-2.5 flex items-center justify-between">
                  <span
                    className="font-bold uppercase"
                    style={{
                      fontSize: 10.5,
                      letterSpacing: "0.14em",
                      color: INK_SOFT,
                    }}
                  >
                    Google Maps signals
                  </span>
                  <span
                    style={{
                      fontFamily: FRAUNCES,
                      fontWeight: 500,
                      fontSize: 18,
                      color: INK,
                    }}
                  >
                    {googleAvg}
                  </span>
                </div>
                {RANKING_DATA.googleFactors.map((f) => (
                  <FactorBar key={f.key} label={f.label} score={f.score} />
                ))}
              </div>

              {/* Practice Health */}
              <div
                className="mt-4 pt-4 border-t"
                style={{ borderColor: LINE_SOFT }}
              >
                <div className="mb-2.5 flex items-center justify-between">
                  <span
                    className="font-bold uppercase"
                    style={{
                      fontSize: 10.5,
                      letterSpacing: "0.14em",
                      color: INK_SOFT,
                    }}
                  >
                    Practice Health
                  </span>
                  <span
                    style={{
                      fontFamily: FRAUNCES,
                      fontWeight: 500,
                      fontSize: 18,
                      color: INK,
                    }}
                  >
                    {healthAvg}
                  </span>
                </div>
                {RANKING_DATA.healthFactors.map((f) => (
                  <FactorBar key={f.key} label={f.label} score={f.score} />
                ))}
              </div>

              <div
                className="mt-4 rounded-[10px] border px-3 py-2.5 leading-relaxed"
                style={{
                  background: "#FFF7F2",
                  borderColor: "#F3D6C4",
                  color: "#8A4A36",
                  fontSize: 12,
                }}
              >
                Lowest factor:{" "}
                <strong style={{ color: BRAND_ORANGE, fontWeight: 700 }}>
                  {RANKING_DATA.lowestFactor}
                </strong>
                . Focused effort on this factor yields the largest gain.
              </div>
            </CardShell>
          </HotspotZone>

          {/* === PMS Card Section === */}
          <HotspotZone
            id="pms-card"
            hotspot={findHotspot("pms-card")}
            isActive={activeHotspotId === "pms-card"}
            onHotspotClick={onHotspotClick}
          >
            <CardShell>
              <Eyebrow>PMS &middot; May</Eyebrow>

              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  style={{
                    fontFamily: FRAUNCES,
                    fontWeight: 500,
                    fontSize: 32,
                    letterSpacing: "-0.02em",
                    lineHeight: 1,
                    color: INK,
                  }}
                >
                  ${PMS_DATA.production.toLocaleString()}
                </span>
                <span
                  className="font-medium"
                  style={{ fontSize: 12, color: MUTED }}
                >
                  current period
                </span>
                <span
                  className="ml-auto font-bold"
                  style={{ fontSize: 11, color: PMS_GREEN }}
                >
                  &#9650; +{PMS_DATA.productionChange}%
                </span>
              </div>

              <div
                className="mt-1.5 leading-relaxed"
                style={{ fontSize: 12, color: MUTED }}
              >
                {PMS_DATA.totalReferrals} total referrals &middot;{" "}
                {PMS_DATA.doctorRefs} doctor / {PMS_DATA.selfRefs} self
              </div>

              <div className="mt-4">
                <Sparkline
                  data={PMS_DATA.sparkData}
                  color={PMS_GREEN}
                  fillId="pms-grad"
                />
                <div
                  className="mt-1 grid font-semibold uppercase"
                  style={{
                    gridTemplateColumns: "1fr 1fr 1fr",
                    fontSize: 9.5,
                    letterSpacing: "0.1em",
                    color: MUTED,
                  }}
                >
                  <span>{PMS_DATA.sparkLabels.first}</span>
                  <span style={{ textAlign: "center" }}>
                    {PMS_DATA.sparkLabels.middle}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    {PMS_DATA.sparkLabels.last}
                  </span>
                </div>
              </div>

              {/* Referral mix bar */}
              <div className="mt-4">
                <div
                  className="mb-1.5 flex items-center justify-between font-semibold uppercase"
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.06em",
                    color: MUTED,
                  }}
                >
                  <span>Referral mix</span>
                  <span style={{ color: INK_SOFT, fontFamily: MONO }}>
                    {PMS_DATA.doctorRefs} / {PMS_DATA.selfRefs}
                  </span>
                </div>
                <div
                  className="flex overflow-hidden rounded-full"
                  style={{ height: 6, background: LINE_SOFT }}
                >
                  <div
                    style={{
                      width: `${doctorPct}%`,
                      background: BRAND_ORANGE,
                    }}
                  />
                  <div
                    style={{ width: `${selfPct}%`, background: SELF_GREY }}
                  />
                </div>
                <div
                  className="mt-2 flex gap-4 font-semibold uppercase"
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.1em",
                    color: MUTED,
                  }}
                >
                  <span className="inline-flex items-center">
                    <span
                      className="mr-1.5 inline-block align-middle"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        background: BRAND_ORANGE,
                      }}
                    />
                    Doctor
                  </span>
                  <span className="inline-flex items-center">
                    <span
                      className="mr-1.5 inline-block align-middle"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        background: SELF_GREY,
                      }}
                    />
                    Self / walk-in
                  </span>
                </div>
              </div>

              {/* Top sources */}
              <div
                className="mt-4 pt-3.5 border-t"
                style={{ borderColor: LINE_SOFT }}
              >
                <div
                  className="mb-1.5 font-bold uppercase"
                  style={{
                    fontSize: 9.5,
                    letterSpacing: "0.14em",
                    color: MUTED,
                  }}
                >
                  Top sources this month
                </div>
                {PMS_DATA.topSources.map((s) => (
                  <div
                    key={s.rank}
                    className="flex items-center gap-2.5 py-1.5"
                  >
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 10,
                        color: MUTED_2,
                        width: 16,
                      }}
                    >
                      {s.rank}.
                    </span>
                    <span
                      className="flex-1 truncate font-medium"
                      style={{ fontSize: 12.5, color: INK_SOFT }}
                    >
                      {s.name}
                    </span>
                    <span
                      style={{ fontFamily: MONO, fontSize: 11, color: MUTED }}
                    >
                      {s.referrals} &middot; ${s.production.toLocaleString()}
                    </span>
                    {s.trend && (
                      <span
                        className="ml-1.5 rounded-full px-1.5 py-0.5 font-bold"
                        style={{
                          fontSize: 9,
                          color:
                            s.trend.dir === "down" ? "#B3503E" : PMS_GREEN,
                          background:
                            s.trend.dir === "down" ? "#FCEAE3" : "#E6F0E7",
                        }}
                      >
                        {s.trend.dir === "down" ? "▼" : "▲"}{" "}
                        {s.trend.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </CardShell>
          </HotspotZone>
        </div>
      </div>
    </DashboardLayout>
  );
}
