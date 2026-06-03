import React from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, MapPin } from "lucide-react";
import { useAuth } from "../../../hooks/useAuth";
import { useLocationContext } from "../../../contexts/locationContext";
import { useDashboardMetrics } from "../../../hooks/queries/useDashboardMetrics";
import { useIsWizardActive, useWizardDemoData } from "../../../contexts/OnboardingWizardContext";

/**
 * LocalRankingCard — Local-search ranking card for the Focus dashboard.
 *
 * Reads:
 *   - useDashboardMetrics(orgId, locationId) for ranking summary metrics
 *     (position, total_competitors, score, lowest_factor).
 *   - useLatestRanking(orgId, locationId) (defined inline below) for the
 *     latest Maps estimate, Practice Health, and client-facing LLM summary.
 *     Wraps the same /api/practice-ranking/latest endpoint that the full
 *     rankings page uses.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T15)
 *
 * Visual reference:
 *   - ~/Desktop/another-design/project/cards.jsx :: LocalRankingCard
 *   - ~/Desktop/another-design/project/Focus Dashboard.html lines 556-712
 */

interface RankingResultLite {
  rankScore: number;
  rankPosition: number;
  totalCompetitors: number;
  specialty: string;
  location: string;
  rankingFactors: Record<string, unknown> | null;
  searchPosition: number | null;
  searchStatus: "ok" | "not_in_top_20" | "bias_unavailable" | "api_error" | null;
  searchQuery: string | null;
  searchCheckedAt: string | null;
  practiceHealth: number | null;
  llmAnalysis: {
    client_summary?: string | null;
    one_line_summary?: string | null;
  } | null;
}

interface LatestRankingResponse {
  success: boolean;
  rankings?: RankingResultLite | RankingResultLite[];
  errorMessage?: string;
}

async function fetchLatestRanking(
  orgId: number,
  locationId: number | null,
): Promise<RankingResultLite | null> {
  const url = `/api/practice-ranking/latest?googleAccountId=${orgId}${
    locationId ? `&locationId=${locationId}` : ""
  }`;
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to load ranking (status ${response.status})`);
  }
  const result = (await response.json()) as LatestRankingResponse;
  if (!result?.success || !result.rankings) return null;
  const rankings = Array.isArray(result.rankings)
    ? result.rankings
    : [result.rankings];
  return rankings[0] ?? null;
}

function useLatestRanking(orgId: number | null, locationId: number | null) {
  return useQuery<RankingResultLite | null>({
    queryKey: ["latestRanking", orgId, locationId],
    queryFn: () => fetchLatestRanking(orgId!, locationId),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000,
  });
}

const CARD_BG = "#FDFDFD";
const CARD_BORDER = "#E8E4DD";
const BRAND_ORANGE = "#D66853";
const MUTED = "#8E8579";
const INK = "#1F1B16";

const SPECTRAL = "'Spectral', Georgia, Cambria, 'Times New Roman', serif";

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-wizard-target="dashboard-visibility"
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

function SkeletonShell() {
  return (
    <CardShell>
      <Eyebrow>Local Visibility</Eyebrow>
      <div className="space-y-3">
        <div className="h-9 w-32 animate-pulse rounded-md bg-neutral-100" />
        <div className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="mt-5 space-y-2.5">
        <div className="h-3 w-full animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-11/12 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-neutral-100" />
      </div>
    </CardShell>
  );
}

function ErrorShell({
  onRetry,
  message,
}: {
  onRetry: () => void;
  message: string;
}) {
  return (
    <CardShell>
      <Eyebrow>Local Visibility</Eyebrow>
      <div
        className="rounded-md border px-3 py-2 text-xs"
        style={{
          borderColor: "#F3D6C4",
          background: "#FFF7F2",
          color: "#8A4A36",
        }}
      >
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex items-center gap-1.5 self-start rounded-md px-2.5 py-1 text-xs font-semibold"
        style={{ color: BRAND_ORANGE }}
      >
        <RefreshCw size={12} />
        Retry
      </button>
    </CardShell>
  );
}

function EmptyShell() {
  return (
    <CardShell>
      <Eyebrow>Local Visibility</Eyebrow>
      <div className="flex flex-col items-center justify-center text-center py-6">
        <div
          className="flex items-center justify-center rounded-full mb-3"
          style={{
            width: 44,
            height: 44,
            background: "#FFF7F2",
            color: BRAND_ORANGE,
          }}
        >
          <MapPin size={20} />
        </div>
        <p
          className="text-[13.5px] font-semibold leading-snug"
          style={{ color: INK }}
        >
          No ranking snapshot yet
        </p>
        <p
          className="text-[12px] mt-1 leading-relaxed max-w-[220px]"
          style={{ color: MUTED }}
        >
          Your local position and factor scores will appear after the first scan.
        </p>
      </div>
    </CardShell>
  );
}

const LocalRankingCard: React.FC = () => {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const { userProfile } = useAuth();
  const { selectedLocation } = useLocationContext();
  const orgId = userProfile?.organizationId ?? null;
  const locationId = selectedLocation?.id ?? null;

  const metrics = useDashboardMetrics(orgId, locationId);
  const latest = useLatestRanking(orgId, locationId);

  const isLoading = isWizardActive ? false : metrics.isLoading || latest.isLoading;
  const isError = isWizardActive ? false : metrics.isError || latest.isError;

  const retry = () => {
    metrics.refetch();
    latest.refetch();
  };

  if (isLoading) return <SkeletonShell />;

  if (isError) {
    const msg =
      (metrics.error as Error)?.message ||
      (latest.error as Error)?.message ||
      "Could not load ranking data.";
    return <ErrorShell onRetry={retry} message={msg} />;
  }

  const ranking = isWizardActive ? wizardDemoData?.dashboardMetrics?.ranking : metrics.data?.ranking;
  const latestRow = isWizardActive ? (wizardDemoData?.localRankingCardData as RankingResultLite | null | undefined) : latest.data;

  if (!latestRow) {
    return <EmptyShell />;
  }

  const mapsEstimate = latestRow.searchPosition;
  const searchStatus = latestRow.searchStatus ?? "ok";
  const rankScore =
    ranking?.score ?? latestRow.practiceHealth ?? latestRow.rankScore ?? 0;
  const summary =
    latestRow.llmAnalysis?.one_line_summary ||
    latestRow.llmAnalysis?.client_summary ||
    "Your ranking summary will appear after the next local visibility scan.";

  return (
    <CardShell>
      <Eyebrow>Local Visibility</Eyebrow>

      <div className="flex flex-wrap items-baseline gap-2">
        <span
          style={{
            fontFamily: SPECTRAL,
            fontWeight: 500,
            fontSize: 32,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: INK,
          }}
        >
          {searchStatus === "not_in_top_20"
            ? "20+"
            : mapsEstimate !== null
              ? `#${mapsEstimate}`
              : "—"}
        </span>
        <span className="font-medium" style={{ fontSize: 12, color: MUTED }}>
          Maps estimate
        </span>
      </div>

      <div
        className="mt-1.5 leading-relaxed"
        style={{ fontSize: 12, color: MUTED }}
      >
        Practice Health {Math.round(Number(rankScore))}/100
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
        {summary}
      </div>
    </CardShell>
  );
};

export default LocalRankingCard;
