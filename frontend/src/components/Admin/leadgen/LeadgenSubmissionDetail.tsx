/**
 * LeadgenSubmissionDetail
 *
 * Right-side slide-in drawer for a single leadgen session. Hand-rolled using
 * framer-motion AnimatePresence (no existing drawer component in this repo).
 * Fetches full detail via getSubmission() on open, shows session summary,
 * event timeline, and a compact audit snapshot.
 */

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Globe,
  Building2,
  Clock,
  FileText,
  Activity,
  CheckCircle2,
  AlertOctagon,
  MousePointerClick,
  Eye,
  ShieldQuestion,
  Rocket,
  Trash2,
  UserPlus,
  Calendar,
  AlertCircle,
  MousePointer,
  Link2,
  ChevronUp,
  RefreshCw,
} from "lucide-react";
import {
  deleteSubmission,
  getSubmission,
  rerunSubmission,
} from "../../api/leadgenSubmissions";
import { useConfirm } from "../ui/ConfirmModal";
import type {
  FinalStage,
  LeadgenEventName,
  SubmissionDetail,
  LeadgenEvent,
} from "../../types/leadgen";
import { STAGE_LABEL, STAGE_TONE, STAGE_CLASSES } from "./LeadgenSubmissionsTable";
import { logger } from "../../lib/logger";

interface Props {
  submissionId: string | null;
  onClose: () => void;
  onDeleted?: () => void;
  /**
   * Fires every time the drawer's live-polling loop receives a fresh detail
   * snapshot. Parent uses this to update the matching row in the list so
   * final_stage / last_seen_at stay in sync while the drawer is open.
   */
  onDetailUpdate?: (detail: SubmissionDetail) => void;
}

const EVENT_ICONS: Partial<Record<LeadgenEventName, typeof Mail>> = {
  landed: MousePointerClick,
  input_started: MousePointerClick,
  input_submitted: FileText,
  audit_started: Rocket,
  stage_viewed_1: Eye,
  stage_viewed_2: Eye,
  stage_viewed_3: Eye,
  stage_viewed_4: Eye,
  stage_viewed_5: Eye,
  email_gate_shown: ShieldQuestion,
  email_submitted: Mail,
  results_viewed: CheckCircle2,
  account_created: UserPlus,
  account_linked: UserPlus,
  abandoned: AlertOctagon,
  // CTA / interaction events — do not advance final_stage, enrich timeline only.
  cta_clicked_strategy_call: Calendar,
  cta_clicked_create_account: UserPlus,
  email_field_focused: MousePointer,
  email_field_blurred_empty: AlertCircle,
};

/**
 * Human label map for events that are NOT in `STAGE_LABEL` (i.e. CTA /
 * interaction events). For real funnel stages we fall back to `STAGE_LABEL`.
 */
const CTA_EVENT_LABEL: Record<string, string> = {
  cta_clicked_strategy_call: "Clicked 'Book Strategy Call'",
  cta_clicked_create_account: "Clicked 'Create Account'",
  email_field_focused: "Focused email field",
  email_field_blurred_empty: "Left email field empty",
};

function eventLabel(name: LeadgenEventName): string {
  return (
    (STAGE_LABEL as Record<string, string>)[name] ??
    CTA_EVENT_LABEL[name] ??
    name
  );
}

function formatAbsolute(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Time-only variant used by individual timeline rows. The date is
 * printed once at the top of the timeline (see TimelineDateHeader) so
 * we don't repeat "Apr 16, 2026" on every single row.
 */
function formatTimeOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Date-only (no time) — used for the single header above the timeline
 * so the per-event rows don't have to repeat the date.
 */
function formatDateOnly(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Compact duration label for the "time gap" pill that sits on the
 * connector between two consecutive events.
 *   < 1s   -> "<1s"
 *   < 1m   -> "Ns"
 *   < 1h   -> "Xm Ys"  (Ys dropped when 0)
 *   else   -> "Xh Ym"  (Ym dropped when 0)
 */
function formatGapShort(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.floor(ms / 1000);
  if (sec < 1) return "<1s";
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return remSec > 0 ? `${min}m ${remSec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

function StagePillInline({ stage }: { stage: FinalStage }) {
  const tone = STAGE_TONE[stage] ?? "gray";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${STAGE_CLASSES[tone]}`}
    >
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}

/**
 * Pulsing green dot + "LIVE TRACKING" label shown in the drawer header
 * while the detail drawer is open. Dot is static green between poll ticks
 * and pulses brighter during the in-flight request so the admin can see
 * that new data is actively being pulled (not just stale).
 */
function LiveIndicator({ fetching }: { fetching: boolean }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-50 border border-green-100 shrink-0">
      <span className="relative flex h-2 w-2">
        {fetching && (
          <motion.span
            className="absolute inline-flex h-full w-full rounded-full bg-green-500"
            initial={{ opacity: 0.7, scale: 1 }}
            animate={{ opacity: 0, scale: 2.6 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeOut" }}
          />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-green-700">
        Live Tracking
      </span>
    </div>
  );
}

export default function LeadgenSubmissionDetail({
  submissionId,
  onClose,
  onDeleted,
  onDetailUpdate,
}: Props) {
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [rerunning, setRerunning] = useState(false);
  const [rerunNotice, setRerunNotice] = useState<string | null>(null);
  const [payloadOpen, setPayloadOpen] = useState(false);
  // `fetching` is true during the in-flight request of a live-poll tick;
  // drives the LIVE indicator's pulse. Distinct from `loading`, which only
  // gates the initial skeleton state.
  const [fetching, setFetching] = useState(false);
  const confirm = useConfirm();

  // Keep the latest onDetailUpdate in a ref so the polling loop's closure
  // always calls the current parent callback without needing to restart.
  const onDetailUpdateRef = useRef(onDetailUpdate);
  onDetailUpdateRef.current = onDetailUpdate;

  const handleDelete = async () => {
    if (!submissionId) return;
    const ok = await confirm({
      title: "Delete session",
      message:
        "Delete this session and all its events? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      setDeleting(true);
      await deleteSubmission(submissionId);
      onDeleted?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete submission";
      setError(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Admin rerun — bypasses the 3-retry cap the public endpoint enforces and
  // does NOT increment retry_count. Optimistically flips the local audit
  // status to "pending" so the UI reflects the new state before the next
  // live-poll tick lands.
  const handleRerun = async () => {
    if (!submissionId || !detail?.audit) return;
    if (detail.audit.status !== "failed") return;
    const ok = await confirm({
      title: "Rerun audit",
      message:
        "Re-enqueue this failed audit? This bypasses the 3-retry cap and does not increment retry_count.",
      confirmLabel: "Rerun",
    });
    if (!ok) return;
    try {
      setRerunning(true);
      setRerunNotice(null);
      await rerunSubmission(submissionId);
      setDetail((prev) =>
        prev && prev.audit
          ? {
              ...prev,
              audit: {
                ...prev.audit,
                status: "pending",
                error_message: null,
              },
            }
          : prev
      );
      setRerunNotice("Rerun queued");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to rerun audit";
      setRerunNotice(msg);
    } finally {
      setRerunning(false);
    }
  };

  // Live polling — request-after-response with a 500ms delay between ticks.
  // Runs for the lifetime of the drawer (same submissionId). Pauses while the
  // tab is hidden so a backgrounded admin doesn't hammer the API. Stops
  // cleanly when submissionId changes or the component unmounts.
  useEffect(() => {
    if (!submissionId) {
      setDetail(null);
      setError(null);
      setPayloadOpen(false);
      return;
    }
    // Different session opened — reset the payload sheet so it doesn't
    // carry over visible state from the previous row.
    setPayloadOpen(false);

    let cancelled = false;
    const POLL_GAP_MS = 500;

    setLoading(true);
    setError(null);

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        const t = window.setTimeout(resolve, ms);
        // If cancelled mid-wait, still let the timer clear naturally — the
        // cancelled flag gates the next iteration so no fetch actually fires.
        void t;
      });

    const waitForVisible = async () => {
      if (typeof document === "undefined") return;
      while (!cancelled && document.visibilityState === "hidden") {
        await new Promise<void>((resolve) => {
          const handler = () => {
            document.removeEventListener("visibilitychange", handler);
            resolve();
          };
          document.addEventListener("visibilitychange", handler);
        });
      }
    };

    (async () => {
      let isFirst = true;
      while (!cancelled) {
        await waitForVisible();
        if (cancelled) break;

        setFetching(true);
        try {
          const d = await getSubmission(submissionId);
          if (cancelled) break;
          setDetail(d);
          onDetailUpdateRef.current?.(d);
          setError(null);
          if (isFirst) {
            setLoading(false);
            isFirst = false;
          }
        } catch (err: unknown) {
          if (cancelled) break;
          const msg =
            err instanceof Error ? err.message : "Failed to load submission";
          // Only surface the error on the INITIAL fetch — polling glitches
          // shouldn't replace a rendered drawer with a red banner. Log and
          // try again next tick.
          if (isFirst) {
            setError(msg);
            setLoading(false);
            isFirst = false;
          } else {
            logger.warn("[LeadgenDetail] poll tick failed:", msg);
          }
        } finally {
          if (!cancelled) setFetching(false);
        }

        if (cancelled) break;
        await wait(POLL_GAP_MS);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [submissionId]);

  // ESC to close
  useEffect(() => {
    if (!submissionId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [submissionId, onClose]);

  const isOpen = !!submissionId;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer"
            className="fixed top-0 right-0 z-50 h-full w-full max-w-xl bg-white shadow-2xl overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white/95 backdrop-blur px-6 py-4 gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <h2 className="text-base font-bold text-alloro-navy shrink-0">
                  Submission detail
                </h2>
                <LiveIndicator fetching={fetching} />
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {detail?.audit?.status === "failed" && (
                  <button
                    onClick={handleRerun}
                    disabled={rerunning}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-alloro-navy hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                    title="Re-enqueue this failed audit (bypasses 3-retry cap)"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`}
                    />
                    {rerunning ? "Rerunning..." : "Rerun"}
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  disabled={deleting || !detail}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 hover:border-red-200 disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
                  title="Delete session"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {deleting ? "Deleting..." : "Delete"}
                </button>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-6 py-5 space-y-6">
              {rerunNotice && (
                <div
                  className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                    rerunNotice === "Rerun queued"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-red-200 bg-red-50 text-red-700"
                  }`}
                >
                  {rerunNotice}
                </div>
              )}

              {loading && (
                <div className="space-y-3">
                  <div className="h-24 animate-pulse rounded-xl bg-gray-100" />
                  <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
                </div>
              )}

              {!loading && error && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  {error}
                </div>
              )}

              {!loading && !error && detail && (
                <>
                  <SummaryCard detail={detail} />
                  <EventTimeline
                    events={detail.events}
                    anchorIso={detail.session.last_seen_at}
                  />
                  {detail.audit && !payloadOpen && (
                    <AuditPayloadBar
                      audit={detail.audit}
                      onOpen={() => setPayloadOpen(true)}
                    />
                  )}
                </>
              )}
            </div>
            {/* Slide-up dark payload deck — only mounts when opened so
                the motion enter animation plays each time. */}
            <AnimatePresence>
              {payloadOpen && detail?.audit && (
                <AuditPayloadSheet
                  audit={detail.audit}
                  onClose={() => setPayloadOpen(false)}
                />
              )}
            </AnimatePresence>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function SummaryCard({ detail }: { detail: SubmissionDetail }) {
  const s = detail.session;
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-gray-400 shrink-0" />
            <p className="text-sm font-semibold text-gray-900 truncate">
              {s.email || (
                <span className="italic text-gray-400">anonymous</span>
              )}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
            <Globe className="h-4 w-4 text-gray-400" />
            <span>{s.domain || "—"}</span>
          </div>
          {s.practice_search_string && (
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-600">
              <Building2 className="h-4 w-4 text-gray-400" />
              <span className="truncate">{s.practice_search_string}</span>
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          {/* Keyed on stage so any time the live poll flips final_stage the
              pill remounts and the initial scale/flash plays — visible
              signal that the funnel advanced. */}
          <motion.div
            key={s.final_stage}
            initial={{ scale: 1.18, boxShadow: "0 0 0 6px rgba(34,197,94,0.25)" }}
            animate={{ scale: 1, boxShadow: "0 0 0 0 rgba(34,197,94,0)" }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="rounded-md"
          >
            <StagePillInline stage={s.final_stage} />
          </motion.div>
          {s.completed && (
            <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              <CheckCircle2 className="h-3 w-3" /> completed
            </span>
          )}
          {s.abandoned && (
            <span className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              <AlertOctagon className="h-3 w-3" /> abandoned
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-gray-500">
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>First: {formatAbsolute(s.first_seen_at)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>Last: {formatAbsolute(s.last_seen_at)}</span>
        </div>
      </div>

      {s.audit_id && (
        <div className="mt-3 text-xs text-gray-500 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-gray-600">Audit:</span>
            <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 break-all">
              {s.audit_id}
            </code>
            <a
              href={`https://audit.getalloro.com?audit_id=${encodeURIComponent(s.audit_id)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold text-alloro-orange hover:underline"
            >
              Open report ↗
            </a>
          </div>
          {/* Google Places place_id — lifted out of the audit's
              step_self_gbp payload so admins can cross-reference against
              organizations.business_data without opening the raw payload
              deck. Only renders when the audit actually ran (GBP step
              populated). */}
          {(() => {
            const gbp = detail.audit?.step_self_gbp as
              | { placeId?: unknown }
              | null
              | undefined;
            const placeId =
              gbp && typeof gbp.placeId === "string" ? gbp.placeId : null;
            if (!placeId) return null;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-600">Place ID:</span>
                <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700 break-all">
                  {placeId}
                </code>
              </div>
            );
          })()}
        </div>
      )}
      {(s.user_agent || s.browser || s.os || s.device_type) && (
        <div className="mt-2 text-xs text-gray-500">
          <span className="font-medium text-gray-600">Device:</span>{" "}
          <span className="break-words">{friendlyDeviceLabel(s)}</span>
        </div>
      )}

      <SourceBlock session={s} />
    </section>
  );
}

/**
 * Prefer the parsed browser/os/device_type triple (populated by the tracking
 * controller from `user-agent` on ingest) over the raw user-agent string.
 * Falls back to the raw UA when parsed fields are missing (legacy rows).
 */
function friendlyDeviceLabel(s: SubmissionDetail["session"]): string {
  const parts: string[] = [];
  if (s.browser) parts.push(s.browser);
  if (s.os) parts.push(s.os);
  if (s.device_type) parts.push(s.device_type);
  if (parts.length > 0) return parts.join(" · ");
  return s.user_agent ?? "—";
}

/**
 * "Source" block — referrer + UTM breakdown. Hidden entirely when every
 * source field is null (most direct-traffic sessions). Referrer is
 * displayed as its hostname to avoid swallowing the panel with long URLs.
 */
function SourceBlock({ session: s }: { session: SubmissionDetail["session"] }) {
  const hasAny =
    s.referrer ||
    s.utm_source ||
    s.utm_medium ||
    s.utm_campaign ||
    s.utm_term ||
    s.utm_content;
  if (!hasAny) return null;

  const referrerDomain = (() => {
    if (!s.referrer) return null;
    try {
      return new URL(s.referrer).hostname;
    } catch {
      return s.referrer;
    }
  })();

  const rows: Array<[string, string]> = [];
  if (referrerDomain)
    rows.push(["Referrer", referrerDomain]);
  if (s.utm_source) rows.push(["UTM source", s.utm_source]);
  if (s.utm_medium) rows.push(["UTM medium", s.utm_medium]);
  if (s.utm_campaign) rows.push(["UTM campaign", s.utm_campaign]);
  if (s.utm_term) rows.push(["UTM term", s.utm_term]);
  if (s.utm_content) rows.push(["UTM content", s.utm_content]);

  return (
    <div className="mt-3 pt-3 border-t border-gray-100">
      <div className="flex items-center gap-1.5 mb-1.5 text-xs font-medium text-gray-600">
        <Link2 className="h-3.5 w-3.5" />
        <span>Source</span>
      </div>
      <dl className="text-xs text-gray-500 space-y-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="font-medium text-gray-600 shrink-0">{label}:</dt>
            <dd
              className="break-all"
              title={label === "Referrer" && s.referrer ? s.referrer : undefined}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EventTimeline({
  events,
}: {
  events: LeadgenEvent[];
  anchorIso?: string;
}) {
  // For every event we compute "time spent on this step" = gap from THIS
  // event to the NEXT event. The last event has no next, so we show
  // "current" there (latest known pipeline state). Pre-computed into an
  // array so the map below stays readable.
  const stepDurations: string[] = events.map((ev, i) => {
    const next = i < events.length - 1 ? events[i + 1] : null;
    if (!next) return "current";
    try {
      const ms =
        new Date(next.created_at).getTime() -
        new Date(ev.created_at).getTime();
      return formatGapShort(ms);
    } catch {
      return "—";
    }
  });

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <Activity className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">Event timeline</h3>
        <span className="ml-1 text-xs text-gray-400">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
        {events.length > 0 && (
          <span
            className="ml-auto text-[10px] text-gray-400 font-mono whitespace-nowrap"
            title="Date of the first event in this session — per-row labels show time only"
          >
            {formatDateOnly(events[0].created_at)}
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">
          No events recorded for this session.
        </div>
      ) : (
        <ol className="relative border-l border-gray-200 pl-5 space-y-7 pt-2">
          <AnimatePresence initial={false}>
            {events.map((ev, i) => {
              const Icon = EVENT_ICONS[ev.event_name] ?? Activity;
              // CTA events have no funnel tone — fall back to gray.
              const tone =
                (STAGE_TONE as Record<string, "green" | "blue" | "red" | "amber" | "gray">)[
                  ev.event_name
                ] ?? "gray";
              const toneClass = STAGE_CLASSES[tone];

              // Gap pill sits on the connector line ABOVE this item, showing
              // how long it took for the user/pipeline to advance from the
              // previous event to this one. Skipped for the first event.
              const prev = i > 0 ? events[i - 1] : null;
              let gapMs: number | null = null;
              if (prev) {
                try {
                  gapMs =
                    new Date(ev.created_at).getTime() -
                    new Date(prev.created_at).getTime();
                  if (!Number.isFinite(gapMs) || gapMs < 0) gapMs = null;
                } catch {
                  gapMs = null;
                }
              }

              return (
                <motion.li
                  key={ev.id}
                  layout
                  initial={{ opacity: 0, x: -12, scale: 0.98 }}
                  animate={{ opacity: 1, x: 0, scale: 1 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ type: "spring", stiffness: 260, damping: 26 }}
                  className="relative"
                >
                  {gapMs !== null && (
                    <motion.span
                      layout
                      // Center on the connector line both axes:
                      //  - left -20px = the ol's border-l position (pl-5 padding)
                      //  - top -14px = halfway into the 28px gap (space-y-7)
                      //  - translate -50/-50 centers the pill on that point
                      className="absolute -top-[14px] -left-[20px] -translate-x-1/2 -translate-y-1/2 inline-flex items-center rounded-full bg-white text-[10px] font-medium text-gray-500 px-1.5 py-0.5 border border-gray-200 shadow-sm whitespace-nowrap"
                      title={`${Math.round(gapMs / 1000)}s between events`}
                    >
                      {formatGapShort(gapMs)}
                    </motion.span>
                  )}
                  <span
                    className={`absolute -left-[30px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ring-2 ring-white ${toneClass}`}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-800">
                      {eventLabel(ev.event_name)}
                    </p>
                    <div className="flex flex-col items-end shrink-0 leading-tight">
                      <span
                        className={`text-xs font-semibold ${
                          stepDurations[i] === "current"
                            ? "text-emerald-600"
                            : "text-gray-700"
                        }`}
                        title={
                          stepDurations[i] === "current"
                            ? "This is the latest event — still in progress"
                            : "Time spent on this step (until the next event)"
                        }
                      >
                        {stepDurations[i]}
                      </span>
                      <span
                        className="text-[10px] text-gray-400 font-mono"
                        title={formatAbsolute(ev.created_at)}
                      >
                        {formatTimeOnly(ev.created_at)}
                      </span>
                    </div>
                  </div>
                  {ev.event_data && Object.keys(ev.event_data).length > 0 && (
                    <pre className="mt-1.5 overflow-x-auto rounded-md bg-gray-50 p-2 text-[11px] text-gray-600 border border-gray-100">
                      {JSON.stringify(ev.event_data, null, 2)}
                    </pre>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      )}
    </section>
  );
}

/**
 * Dark sticky bottom bar — one-line tag for the audit payload. Click flips
 * a slide-up deck (`AuditPayloadSheet`) that renders the raw JSON in a
 * dark-mode viewer with light syntax highlighting. Replaces the old
 * cluttered score-pluck snapshot — power users want the raw data, casual
 * admins don't need a dashboard here.
 */
function AuditPayloadBar({
  audit,
  onOpen,
}: {
  audit: NonNullable<SubmissionDetail["audit"]>;
  onOpen: () => void;
}) {
  const status = audit.status || "unknown";
  const statusColor =
    status === "completed"
      ? "text-emerald-300"
      : status === "failed"
        ? "text-red-300"
        : "text-amber-300";
  const retryCount = typeof audit.retry_count === "number" ? audit.retry_count : 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="sticky bottom-0 -mx-6 mt-6 block w-[calc(100%+3rem)] bg-slate-900 text-white px-6 py-4 text-left shadow-[0_-8px_24px_rgba(15,23,42,0.2)] hover:bg-slate-800 active:bg-slate-900 transition-colors border-t border-slate-800"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Audit payload
            </span>
            <span className="text-sm text-white truncate">
              Status:{" "}
              <span className={`font-semibold ${statusColor}`}>{status}</span>
              <span className="text-slate-500 ml-2">
                · Retries: {retryCount}/3
              </span>
              <span className="text-slate-500 ml-2">— tap to view raw JSON</span>
            </span>
          </div>
        </div>
        <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
      </div>
    </button>
  );
}

/**
 * Dark slide-up deck for the raw audit payload. Positioned absolutely
 * inside the drawer aside so it covers only the drawer (not the whole
 * viewport). Framer-motion handles the slide-up animation.
 *
 * JSON is colorized by tokenizing the string and rendering each token as
 * its own <span>. No dangerouslySetInnerHTML, no new dependency, no XSS
 * surface even if a step payload contains raw HTML-looking text.
 */
function AuditPayloadSheet({
  audit,
  onClose,
}: {
  audit: NonNullable<SubmissionDetail["audit"]>;
  onClose: () => void;
}) {
  const tokens = tokenizeJson(audit);
  // Force the scroll region to the top on mount. Without this, if a
  // user-agent caches the sheet's previous scrollTop (or if the motion
  // enter animation somehow lands with scrollTop>0) the JSON would open
  // scrolled to the middle/bottom.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);
  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", stiffness: 300, damping: 32 }}
      // `fixed` (not `absolute`) so the deck's position is anchored to
      // the viewport, not to the drawer's scrolled content. Previously
      // `absolute inset-0` meant the deck scrolled with the aside,
      // showing the middle of the JSON by default when the user had
      // scrolled down to click the audit bar.
      className="fixed top-0 right-0 h-full w-full max-w-xl z-[60] flex flex-col bg-slate-900 text-slate-100"
    >
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950">
        <div className="flex items-center gap-3 min-w-0">
          <FileText className="h-4 w-4 text-slate-400 shrink-0" />
          <h3 className="text-sm font-semibold text-white">Audit payload</h3>
          <span className="text-[10px] font-mono text-slate-500 truncate">
            {audit.id}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          aria-label="Close payload"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-auto px-6 py-4">
        <pre className="text-[12px] leading-relaxed font-mono whitespace-pre-wrap break-all">
          {tokens.map((t, i) =>
            t.cls ? (
              <span key={i} className={t.cls}>
                {t.text}
              </span>
            ) : (
              <span key={i}>{t.text}</span>
            )
          )}
        </pre>
      </div>
    </motion.div>
  );
}

type JsonToken = { text: string; cls: string | null };

/**
 * Tokenize a JSON.stringify output into colored spans without resorting
 * to dangerouslySetInnerHTML. Uses `String.matchAll` so whitespace,
 * braces, brackets, and commas survive verbatim between matches.
 */
function tokenizeJson(obj: unknown): JsonToken[] {
  let text: string;
  try {
    text = JSON.stringify(obj, null, 2) ?? "null";
  } catch {
    text = String(obj);
  }
  const re =
    /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  const out: JsonToken[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push({ text: text.slice(last, idx), cls: null });
    const match = m[0];
    let cls = "text-orange-300";
    if (/^"/.test(match)) {
      cls = /:\s*$/.test(match) ? "text-sky-300" : "text-emerald-300";
    } else if (match === "true" || match === "false") {
      cls = "text-purple-300";
    } else if (match === "null") {
      cls = "text-slate-500";
    }
    out.push({ text: match, cls });
    last = idx + match.length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: null });
  return out;
}
