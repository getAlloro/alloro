import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Globe2, Inbox } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { apiGet } from "../../../api";
import { useFormSubmissionsTimeseries } from "../../../hooks/queries/useFormSubmissionsTimeseries";
import type { TimeseriesPoint } from "../../../api/formSubmissionsTimeseries";
import SubmissionsTrendChart from "./SubmissionsTrendChart";
import { useIsWizardActive, useWizardDemoData } from "../../../contexts/OnboardingWizardContext";

/**
 * WebsiteCard — Form submissions card for the Focus dashboard.
 *
 * Reads:
 *   - useFormSubmissionsTimeseries('12m') for the 12-month sparkline series.
 *   - useFormSubmissionsStats (defined inline below) for the headline counts.
 *     Wraps the existing /user/website/form-submissions/stats endpoint that
 *     DashboardOverview.tsx:402 already calls. Kept inline per spec note.
 *
 * Spec: plans/04282026-no-ticket-focus-dashboard-frontend/spec.md (T14)
 *
 * Visual reference:
 *   - ~/Desktop/another-design/project/cards.jsx :: WebsiteCard
 *   - ~/Desktop/another-design/project/Focus Dashboard.html lines 556-712
 */

interface FormSubmissionsStats {
  allCount: number;
  unreadCount: number;
  flaggedCount: number;
  verifiedCount: number;
  blockedCount: number;
}

interface FormSubmissionsStatsResponse {
  success: boolean;
  allCount?: number;
  unreadCount?: number;
  flaggedCount?: number;
  verifiedCount?: number;
  blockedCount?: number;
  errorMessage?: string;
}

async function fetchFormSubmissionsStats(): Promise<FormSubmissionsStats> {
  const result = (await apiGet({
    path: "/user/website/form-submissions/stats",
  })) as FormSubmissionsStatsResponse;

  if (!result?.success) {
    throw new Error(
      result?.errorMessage || "Failed to load form submission stats",
    );
  }
  return {
    allCount: result.allCount ?? result.verifiedCount ?? 0,
    unreadCount: result.unreadCount ?? 0,
    flaggedCount: result.flaggedCount ?? 0,
    verifiedCount: result.verifiedCount ?? 0,
    blockedCount: result.blockedCount ?? 0,
  };
}

function useFormSubmissionsStats() {
  return useQuery<FormSubmissionsStats>({
    queryKey: ["formSubmissionsStats"],
    queryFn: fetchFormSubmissionsStats,
    staleTime: 5 * 60 * 1000,
  });
}

const CARD_BG = "#FDFDFD";
const CARD_BORDER = "#E8E4DD";
const BRAND_ORANGE = "#D66853";
const MUTED = "#8E8579";
const INK = "#1F1B16";

const FRAUNCES =
  "'Fraunces', ui-serif, Georgia, Cambria, 'Times New Roman', serif";

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <section
      data-wizard-target="dashboard-website"
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
      <Eyebrow>Website · Form submissions</Eyebrow>
      <div className="space-y-3">
        <div className="h-9 w-40 animate-pulse rounded-md bg-neutral-100" />
        <div className="h-3 w-56 animate-pulse rounded bg-neutral-100" />
      </div>
      <div className="mt-5 h-16 w-full animate-pulse rounded-md bg-neutral-100" />
      <div className="mt-4 h-12 w-full animate-pulse rounded-md bg-orange-50" />
      <div className="mt-4 flex items-center justify-between">
        <div className="h-3 w-32 animate-pulse rounded bg-neutral-100" />
        <div className="h-3 w-16 animate-pulse rounded bg-neutral-100" />
      </div>
    </CardShell>
  );
}

function CenteredState({
  icon,
  title,
  hint,
  action,
  spin,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  spin?: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center py-6">
      <div
        className="flex items-center justify-center rounded-full mb-3"
        style={{
          width: 44,
          height: 44,
          background: "#FFF7F2",
          color: BRAND_ORANGE,
        }}
      >
        <span className={spin ? "animate-spin" : undefined}>{icon}</span>
      </div>
      <p
        className="text-[13.5px] font-semibold leading-snug"
        style={{ color: INK }}
      >
        {title}
      </p>
      {hint && (
        <p
          className="text-[12px] mt-1 leading-relaxed max-w-[220px]"
          style={{ color: MUTED }}
        >
          {hint}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function ErrorShell() {
  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>
      <CenteredState
        icon={<Globe2 size={20} />}
        title="Preparing your website"
        hint="We'll email you when it's ready. This card will populate automatically once the site goes live."
      />
    </CardShell>
  );
}

function EmptyShell() {
  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>
      <CenteredState
        icon={<Inbox size={20} />}
        title="No submissions yet"
        hint="Verified leads from your website will appear here."
      />
    </CardShell>
  );
}

function NotReadyShell() {
  const navigate = useNavigate();
  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>
      <CenteredState
        icon={<Globe2 size={20} />}
        title="Website not connected"
        hint="Connect your practice website to track form submissions and leads."
        action={
          <button
            type="button"
            onClick={() => navigate("/dfy/website")}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em]"
            style={{ color: BRAND_ORANGE }}
          >
            Connect website
            <ArrowRight size={12} />
          </button>
        }
      />
    </CardShell>
  );
}

/**
 * Heuristic: backend returns 404 with `{ error: "No website found" }` when
 * the org has no website project. apiGet throws Error(message). We match on
 * a substring so future copy tweaks don't break the detection silently.
 */
function isNoWebsiteError(err: unknown): boolean {
  if (!err) return false;
  const msg = String((err as Error)?.message || "").toLowerCase();
  return (
    msg.includes("no website") ||
    msg.includes("project not found") ||
    msg.includes("website not found")
  );
}

function pctDelta(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

function lastVsPrior(points: TimeseriesPoint[]): {
  current: number;
  prior: number;
} {
  if (points.length === 0) return { current: 0, prior: 0 };
  if (points.length === 1) return { current: pointTotal(points[0]), prior: 0 };
  const current = pointTotal(points[points.length - 1]);
  const prior = pointTotal(points[points.length - 2]);
  return { current, prior };
}

function pointTotal(point: TimeseriesPoint): number {
  return point.total ?? point.verified + point.flagged;
}

function pointBlocked(point: TimeseriesPoint): number {
  return point.blocked ?? 0;
}

function TrendPill({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  return (
    <span
      className="ml-auto flex flex-wrap items-baseline justify-end gap-x-1 font-bold"
      style={{ fontSize: 11, color: up ? "#4F8A5B" : "#B3503E" }}
    >
      <span>
        {up ? "▲" : "▼"} {up ? "+" : ""}
        {delta}%
      </span>
      <span className="font-medium" style={{ color: MUTED }}>
        compared to last month
      </span>
    </span>
  );
}

const WebsiteCard: React.FC = () => {
  const isWizardActive = useIsWizardActive();
  const wizardDemoData = useWizardDemoData();
  const navigate = useNavigate();
  const stats = useFormSubmissionsStats();
  const series = useFormSubmissionsTimeseries("12m");

  const isLoading = isWizardActive ? false : stats.isLoading || series.isLoading;
  const isError = isWizardActive ? false : stats.isError || series.isError;

  if (isLoading) return <SkeletonShell />;

  if (isError) {
    // Distinguish "website not connected" (expected) from a real fetch error.
    // Any other error path is shown as the friendly "preparing" shell — most
    // commonly the project exists but its site isn't built/live yet, in which
    // case the form-submissions endpoint errors. React-query auto-retries.
    if (isNoWebsiteError(stats.error) || isNoWebsiteError(series.error)) {
      return <NotReadyShell />;
    }
    return <ErrorShell />;
  }

  const wizardStats = wizardDemoData?.websiteCardData?.stats as FormSubmissionsStats | undefined;
  const wizardTimeseries = wizardDemoData?.websiteCardData?.timeseries as TimeseriesPoint[] | undefined;

  const points = isWizardActive ? (wizardTimeseries ?? []) : (series.data ?? []);
  const fallbackTotal = isWizardActive
    ? (wizardStats?.allCount ?? wizardStats?.verifiedCount ?? 0)
    : (stats.data?.allCount ?? stats.data?.verifiedCount ?? 0);
  const currentPoint = points[points.length - 1] ?? null;
  const currentTotal = currentPoint ? pointTotal(currentPoint) : fallbackTotal;
  const currentSpam = currentPoint
    ? currentPoint.flagged
    : isWizardActive
      ? (wizardStats?.flaggedCount ?? 0)
      : (stats.data?.flaggedCount ?? 0);
  const currentBlocked = currentPoint
    ? pointBlocked(currentPoint)
    : isWizardActive
      ? (wizardStats?.blockedCount ?? 0)
      : (stats.data?.blockedCount ?? 0);

  if (points.length === 0 && currentTotal === 0) {
    return <EmptyShell />;
  }

  const { current, prior } = lastVsPrior(points);
  const delta = pctDelta(current, prior);

  return (
    <CardShell>
      <Eyebrow>Website · Form submissions</Eyebrow>

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
          {currentTotal}
        </span>
        <span className="font-medium" style={{ fontSize: 12, color: MUTED }}>
          submissions this month
        </span>
        <TrendPill delta={delta} />
      </div>

      <div
        className="mt-1.5 leading-relaxed"
        style={{ fontSize: 12, color: MUTED }}
      >
        {currentTotal} total submissions · {currentSpam} spam · {currentBlocked} blocked
      </div>

      <div className="mt-4">
        <SubmissionsTrendChart points={points} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <button
          type="button"
          onClick={() => navigate("/dfy/website?view=submissions")}
          className="inline-flex items-center gap-1.5 bg-transparent font-semibold"
          style={{ color: BRAND_ORANGE, fontSize: 12 }}
        >
          View submissions
          <ArrowRight size={11} />
        </button>
        <span style={{ fontSize: 11, color: MUTED }}>Last 12 mo</span>
      </div>
    </CardShell>
  );
};

export default WebsiteCard;
