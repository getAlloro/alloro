import { useMemo, useState, type ReactNode } from "react";
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
  ACTIONS_FILTER_EMPTY,
  ACTIONS_FILTER_PLACEHOLDER,
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
  WINDOW_CONTROL_LABEL,
  WINDOW_CUSTOM_END_LABEL,
  WINDOW_CUSTOM_LABEL,
  WINDOW_CUSTOM_NOTE,
  WINDOW_CUSTOM_START_LABEL,
} from "./ownerReceiptCopy";
import {
  buildWindowPresets,
  deriveWindowsFromPost,
  filterActionItems,
  isoDayLocal,
  matchPresetId,
  type WindowPreset,
} from "./ownerReceiptControls";

/**
 * OwnerReceiptCard — the CMO's report, honesty-gated, with owner controls.
 *
 * For one org over a PRE and a POST window it shows: the dated window, the
 * honest before -> after impressions trend, the plain-language diagnosis of
 * which funnel term moved, the dated actions Alloro took, and the post-window
 * gate numbers. It is the owner's receipt, not a brag: the owner is the hero,
 * Alloro is the quiet guide (StoryBrand). It renders the trend and the numbers;
 * it never says "Alloro caused this" — the dated actions beside the dated
 * numbers are the only witness the owner draws their own conclusion from.
 *
 * Transparency via control: the owner picks the comparison window (honest
 * presets or a custom range) and watches the number recompute — including
 * seeing "not measured" when the window lacks coverage. The control itself is
 * the honesty; nothing is hand-picked. The window prop is the INITIAL choice;
 * from there the owner drives it. Changing the window re-keys the hook (which
 * keys on {orgId, windows, locationId}) and the card recomputes.
 *
 * Honesty (Value #6): an absent number reads "not measured", never 0; a delta
 * shows only when the backend says both windows are honestly covered; the
 * diagnosis names a driver only when the backend says it is diagnosable;
 * otherwise the plain reason shows. The controls change only WHICH honest
 * number shows — never whether it is honest.
 *
 * Renders live only after the backend read-model (owner-receipt endpoint) is
 * merged and deployed; until then the hook's query resolves against a missing
 * endpoint and the card shows its honest not-ready state. The controls stay
 * visible in that state so the owner can still choose the window.
 *
 * Spec: plans/07232026-owner-receipt-and-promotion-brief/spec.html (T3, T7)
 */

interface OwnerReceiptCardProps {
  orgId: number | null;
  locationId: number | null;
  /** The INITIAL comparison window; the owner re-picks it from the card. */
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

const PILL_BASE =
  "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors";
const PILL_ON = "bg-alloro-navy text-white";
const PILL_OFF = "border border-line-soft text-ink-muted hover:text-alloro-navy";

/**
 * The window selector — the primary transparency control. Honest presets plus a
 * custom range; picking any of them recomputes the card. Always visible, in
 * every card state, because the control is the point.
 */
function WindowSelector({
  presets,
  activePresetId,
  customOpen,
  customStart,
  customEnd,
  onPickPreset,
  onToggleCustom,
  onCustomStartChange,
  onCustomEndChange,
}: {
  presets: WindowPreset[];
  activePresetId: string | null;
  customOpen: boolean;
  customStart: string;
  customEnd: string;
  onPickPreset: (preset: WindowPreset) => void;
  onToggleCustom: () => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
}) {
  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
        {WINDOW_CONTROL_LABEL}
      </span>
      <div
        role="group"
        aria-label={WINDOW_CONTROL_LABEL}
        className="mt-2 flex flex-wrap gap-1.5"
      >
        {presets.map((preset) => {
          const on = !customOpen && activePresetId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              aria-pressed={on}
              onClick={() => onPickPreset(preset)}
              className={`${PILL_BASE} ${on ? PILL_ON : PILL_OFF}`}
            >
              {preset.shortLabel}
            </button>
          );
        })}
        <button
          type="button"
          aria-pressed={customOpen}
          onClick={onToggleCustom}
          className={`${PILL_BASE} ${customOpen ? PILL_ON : PILL_OFF}`}
        >
          {WINDOW_CUSTOM_LABEL}
        </button>
      </div>

      {customOpen && (
        <div className="mt-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              {WINDOW_CUSTOM_START_LABEL}
              <input
                type="date"
                value={customStart}
                max={customEnd || undefined}
                onChange={(event) => onCustomStartChange(event.target.value)}
                className="rounded-[8px] border border-line-soft px-2 py-1 text-[12px] font-medium text-alloro-navy"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              {WINDOW_CUSTOM_END_LABEL}
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                onChange={(event) => onCustomEndChange(event.target.value)}
                className="rounded-[8px] border border-line-soft px-2 py-1 text-[12px] font-medium text-alloro-navy"
              />
            </label>
          </div>
          <p className="mt-2 text-[11px] text-ink-muted">{WINDOW_CUSTOM_NOTE}</p>
        </div>
      )}
    </div>
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
        // The owner reads `view.reason`, written here in their words. The
        // backend's own machine-ish reason rides along on `title` so support can
        // read it without it ever being the sentence on the card.
        <p
          className="mt-1.5 text-[13px] text-ink-muted"
          title={view.debugReason ?? undefined}
        >
          {view.reason}
        </p>
      )}
    </div>
  );
}

/** Plain doctor-language for which funnel term moved leads (gated upstream). */
function DiagnosisBlock({ receipt }: { receipt: OwnerReceipt }) {
  return (
    <p
      className="mt-4 text-[14px] leading-snug text-alloro-navy"
      title={receipt.diagnosis.reason ?? undefined}
    >
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
 * The dated list of actions Alloro took, or an honest empty line, plus a plain
 * filter over them (the secondary transparency control).
 *
 * The list is labelled with its OWN span (`actions.since` – `actions.until`),
 * not the post window in the card header, and a backend-capped page states its
 * cap rather than reading as the complete record.
 */
function ActionsBlock({ receipt }: { receipt: OwnerReceipt }) {
  const [query, setQuery] = useState("");
  const { items, since, until, summary, pagination } = receipt.actions;
  const total = pagination?.total ?? summary.total;
  const isTruncated = total > items.length;
  const filtered = filterActionItems(items, query, (item) =>
    actionLabel(item.type),
  );
  return (
    <div className="mt-4 border-t border-line-soft pt-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="block text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          {ACTIONS_HEADING}
        </span>
        <span className="text-[11px] text-ink-muted tabular-nums">
          {formatDay(since)} – {formatDay(until)}
        </span>
        {items.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ACTIONS_FILTER_PLACEHOLDER}
            aria-label={ACTIONS_FILTER_PLACEHOLDER}
            className="min-w-0 max-w-[10rem] rounded-[8px] border border-line-soft px-2 py-1 text-[12px] text-alloro-navy placeholder:text-ink-muted"
          />
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-ink-muted">{ACTIONS_EMPTY}</p>
      ) : filtered.length === 0 ? (
        <p className="mt-1.5 text-[13px] text-ink-muted">{ACTIONS_FILTER_EMPTY}</p>
      ) : (
        <>
          <ul className="mt-2 flex flex-col gap-1.5">
            {filtered.map((item: OwnerReceiptActionItem) => (
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
  const today = useMemo(() => isoDayLocal(new Date()), []);
  const presets = useMemo(() => buildWindowPresets(today), [today]);

  // The window prop is the initial choice; from here the owner drives it.
  const [selected, setSelected] = useState<OwnerReceiptWindows>(windows);
  const [customOpen, setCustomOpen] = useState(
    () => matchPresetId(windows, presets) === null,
  );
  const [customStart, setCustomStart] = useState(windows.postStart);
  const [customEnd, setCustomEnd] = useState(windows.postEnd);

  const activePresetId = matchPresetId(selected, presets);

  const pickPreset = (preset: WindowPreset) => {
    setCustomOpen(false);
    setSelected(preset.windows);
  };

  const openCustom = () => {
    setCustomOpen(true);
    // Seed the custom fields from wherever the window is now.
    setCustomStart(selected.postStart);
    setCustomEnd(selected.postEnd);
  };

  // Recompute only from a valid range; otherwise keep the last honest windows.
  const applyCustom = (start: string, end: string) => {
    const derived = deriveWindowsFromPost(start, end);
    if (derived) setSelected(derived);
  };

  const { receipt, isLoading, error } = useOwnerReceipt(
    orgId,
    selected,
    locationId,
    { enabled },
  );

  const controls = (
    <WindowSelector
      presets={presets}
      activePresetId={activePresetId}
      customOpen={customOpen}
      customStart={customStart}
      customEnd={customEnd}
      onPickPreset={pickPreset}
      onToggleCustom={() => (customOpen ? setCustomOpen(false) : openCustom())}
      onCustomStartChange={(value) => {
        setCustomStart(value);
        applyCustom(value, customEnd);
      }}
      onCustomEndChange={(value) => {
        setCustomEnd(value);
        applyCustom(customStart, value);
      }}
    />
  );

  return (
    <Shell>
      <div className="flex w-full items-center justify-between">
        <Eyebrow />
        {receipt && (
          <span className="text-[11px] text-ink-muted tabular-nums">
            {formatDay(receipt.postWindow.start)} – {formatDay(receipt.postWindow.end)}
          </span>
        )}
      </div>

      {isLoading ? (
        <>
          {controls}
          <div className="mt-4 h-9 w-full animate-pulse rounded bg-neutral-100" />
          <div className="mt-4 h-16 w-full animate-pulse rounded bg-neutral-100" />
        </>
      ) : error || !receipt ? (
        // Honest not-yet-available state. Renders live only after the backend
        // endpoint is merged + deployed; until then this shows. Controls stay
        // available so the owner can still pick the window.
        <>
          <h3 className="mt-3 font-display text-lg leading-snug text-alloro-navy">
            {NOT_READY_TITLE}
          </h3>
          <p className="mt-1 text-[13px] text-ink-muted">{NOT_READY_BODY}</p>
          {controls}
        </>
      ) : (
        <>
          <h3 className="mt-3 font-display text-lg leading-snug text-alloro-navy">
            {RECEIPT_HEADLINE}
          </h3>
          <p className="mt-1.5 text-[13px] leading-snug text-ink-muted">
            {RECEIPT_SUBLINE}
          </p>

          {controls}

          <TrendBlock receipt={receipt} />
          <DiagnosisBlock receipt={receipt} />

          <div className="mt-4 flex flex-wrap gap-3">
            {receipt.metrics.map((metric) => (
              <MetricTile key={metric.gate} metric={metric} />
            ))}
          </div>

          <ActionsBlock receipt={receipt} />
        </>
      )}
    </Shell>
  );
}

export default OwnerReceiptCard;
