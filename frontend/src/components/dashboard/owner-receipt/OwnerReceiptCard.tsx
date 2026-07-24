import type { ReactNode } from "react";
import { useOwnerReceipt } from "../../../hooks/queries/useOwnerReceipt";
import type {
  OwnerReceipt,
  OwnerReceiptActionItem,
  OwnerReceiptMetric,
  OwnerReceiptWindows,
} from "../../../api/ownerReceipt";
import {
  actionLabel,
  ACTIONS_EMPTY,
  ACTIONS_HEADING,
  actionsTruncationNote,
  buildImpressionsTrendView,
  diagnosisSentence,
  formatDay,
  formatMetricValue,
  gateLabel,
  metricSourceNote,
  NOT_READY_BODY,
  NOT_READY_TITLE,
  RECEIPT_EYEBROW,
  RECEIPT_HEADLINE,
  RECEIPT_SUBLINE,
  receiptErrorCopy,
  TREND_HEADING,
} from "./ownerReceiptCopy";

/**
 * OwnerReceiptCard — the CMO's report, honesty-gated.
 *
 * For one org over a PRE and a POST window it shows: the dated window, the
 * honest before -> after impressions trend, the plain-language diagnosis of
 * which funnel term moved, the dated actions Alloro took, and the post-window
 * gate numbers. It is the owner's receipt, not a brag: the owner is the hero,
 * Alloro is the quiet guide (StoryBrand). It renders the trend and the numbers;
 * it never says "Alloro caused this" — the dated actions beside the dated
 * numbers are the only witness the owner draws their own conclusion from.
 *
 * Honesty (Value #6): an absent number reads "not measured", never 0; a delta
 * shows only when the backend says both windows are honestly covered; the
 * diagnosis names a driver only when the backend says it is diagnosable;
 * otherwise the plain reason shows. No copy tells the owner to "go look"
 * without a handled next step.
 *
 * Renders live only after the backend read-model (owner-receipt endpoint) is
 * merged and deployed; until then the hook's query resolves against a missing
 * endpoint and the card shows its honest error state.
 *
 * Spec: plans/07232026-owner-receipt-and-promotion-brief/spec.html (T3)
 */

interface OwnerReceiptCardProps {
  orgId: number | null;
  locationId: number | null;
  windows: OwnerReceiptWindows;
  /** Defer the fetch until the card is actually shown. */
  enabled?: boolean;
}

function Eyebrow() {
  return (
    <span className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted">
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-alloro-navy" />
      {RECEIPT_EYEBROW}
    </span>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Your Alloro receipt"
      className="flex w-full flex-col rounded-[14px] border border-line-soft bg-white px-6 pb-[22px] pt-6 text-left shadow-premium"
    >
      {children}
    </section>
  );
}

/** The honest before -> after impressions trend, or the plain coverage reason. */
function TrendBlock({ receipt }: { receipt: OwnerReceipt }) {
  const view = buildImpressionsTrendView(receipt.impressionsTrend);
  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {TREND_HEADING}
      </span>
      {view.hasDelta ? (
        <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="min-w-0">
            <span className="block font-display text-[26px] font-medium leading-none tracking-[-0.02em] text-alloro-navy tabular-nums">
              {view.before} <span className="text-ink-muted">→</span> {view.after}
            </span>
            <span className="mt-1.5 block text-[11px] text-ink-muted">
              {view.beforeWindow} vs {view.afterWindow}
            </span>
          </div>
          <span className="text-[15px] font-semibold text-alloro-navy tabular-nums">
            {view.change}
          </span>
        </div>
      ) : (
        <p className="mt-1.5 text-[13px] text-ink-muted">{view.reason}</p>
      )}
    </div>
  );
}

/** Plain doctor-language for which funnel term moved leads (gated upstream). */
function DiagnosisBlock({ receipt }: { receipt: OwnerReceipt }) {
  return (
    <p className="mt-4 text-[14px] leading-snug text-alloro-navy">
      {diagnosisSentence(receipt.diagnosis)}
    </p>
  );
}

/** One post-window gate number with its honest "not measured" fallback. */
function MetricTile({ metric }: { metric: OwnerReceiptMetric }) {
  const absent = metric.value === null;
  return (
    <div className="min-w-0 flex-1 rounded-[10px] border border-line-soft px-4 py-3">
      <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {gateLabel(metric.gate)}
      </span>
      <span
        className={`mt-1 block font-display text-[20px] font-medium leading-none tabular-nums ${
          absent ? "text-ink-muted" : "text-alloro-navy"
        }`}
      >
        {formatMetricValue(metric.value)}
      </span>
      <span className="mt-1 block truncate text-[11px] text-ink-muted">
        {absent
          ? metricSourceNote(metric)
          : `${metricSourceNote(metric)}${metric.asOf ? ` · as of ${formatDay(metric.asOf)}` : ""}`}
      </span>
    </div>
  );
}

/**
 * The dated list of actions Alloro took, or an honest empty line.
 *
 * The list is labelled with its OWN span (`actions.since` – `actions.until`),
 * not the post window in the card header: the backend reads actions over
 * `[preWindow.start, postWindow.end]`, so on a 28/28 comparison this list covers
 * 56 days. Heading a 56-day list with a 28-day date range makes an owner
 * counting the rows double-count the period.
 *
 * The backend also caps the page (50 by default). When it does, the cap is
 * stated — a truncated list presented as the complete record is a quiet
 * understatement of the work.
 */
function ActionsBlock({ receipt }: { receipt: OwnerReceipt }) {
  const { items, since, until, summary, pagination } = receipt.actions;
  const total = pagination?.total ?? summary.total;
  const isTruncated = total > items.length;
  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          {ACTIONS_HEADING}
        </span>
        <span className="text-[11px] text-ink-muted tabular-nums">
          {formatDay(since)} – {formatDay(until)}
        </span>
      </div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-ink-muted">{ACTIONS_EMPTY}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-1.5">
            {items.map((item: OwnerReceiptActionItem) => (
              <li
                key={item.workItemId}
                className="flex items-baseline justify-between gap-4 text-[13px] text-alloro-navy"
              >
                <span className="truncate">{actionLabel(item.type)}</span>
                <span className="shrink-0 text-[12px] text-ink-muted tabular-nums">
                  {formatDay(item.at)}
                </span>
              </li>
            ))}
          </ul>
          {isTruncated ? (
            <p className="mt-2 text-[11px] text-ink-muted tabular-nums">
              {actionsTruncationNote(items.length, total)}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function OwnerReceiptCard({
  orgId,
  locationId,
  windows,
  enabled,
}: OwnerReceiptCardProps) {
  const { receipt, isLoading, error } = useOwnerReceipt(
    orgId,
    windows,
    locationId,
    { enabled },
  );

  if (isLoading) {
    return (
      <Shell>
        <Eyebrow />
        <div className="mt-3 h-5 w-1/2 animate-pulse rounded bg-neutral-100" />
        <div className="mt-4 h-9 w-full animate-pulse rounded bg-neutral-100" />
        <div className="mt-4 h-16 w-full animate-pulse rounded bg-neutral-100" />
      </Shell>
    );
  }

  // FAILURE — the request threw (403 tenant denial, 404 before the endpoint is
  // deployed, 500, no response). This is a fault, and it gets said as one. It
  // must never fall through to the not-ready copy below, which tells the owner
  // to wait for data that will never arrive (§16.1).
  if (error) {
    const failure = receiptErrorCopy(error);
    return (
      <Shell>
        <Eyebrow />
        <h3
          role="alert"
          className="mt-3 font-display text-lg leading-snug text-alloro-navy"
        >
          {failure.title}
        </h3>
        <p className="mt-1 text-[13px] text-ink-muted">{failure.body}</p>
      </Shell>
    );
  }

  // NOT READY — the request SUCCEEDED and there is simply nothing to show yet.
  if (!receipt) {
    return (
      <Shell>
        <Eyebrow />
        <h3 className="mt-3 font-display text-lg leading-snug text-alloro-navy">
          {NOT_READY_TITLE}
        </h3>
        <p className="mt-1 text-[13px] text-ink-muted">{NOT_READY_BODY}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex w-full items-center justify-between">
        <Eyebrow />
        <span className="text-[11px] text-ink-muted tabular-nums">
          {formatDay(receipt.postWindow.start)} – {formatDay(receipt.postWindow.end)}
        </span>
      </div>

      <h3 className="mt-3 font-display text-lg leading-snug text-alloro-navy">
        {RECEIPT_HEADLINE}
      </h3>
      <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">
        {RECEIPT_SUBLINE}
      </p>

      <TrendBlock receipt={receipt} />
      <DiagnosisBlock receipt={receipt} />

      <div className="mt-4 flex flex-wrap gap-3">
        {receipt.metrics.map((metric) => (
          <MetricTile key={metric.gate} metric={metric} />
        ))}
      </div>

      <ActionsBlock receipt={receipt} />
    </Shell>
  );
}

export default OwnerReceiptCard;
