import type { OwnerReceiptWindows } from "../../../api/ownerReceipt";
import {
  WINDOW_CONTROL_LABEL,
  WINDOW_CUSTOM_END_LABEL,
  WINDOW_CUSTOM_LABEL,
  WINDOW_CUSTOM_NOTE,
  WINDOW_CUSTOM_START_LABEL,
  WINDOW_LAG_NOTE,
  windowRangeLabel,
} from "./ownerReceiptCopy";
import type { WindowPreset } from "./ownerReceiptControls";

/**
 * WindowSelector — the owner's control over WHICH honest window the receipt
 * compares.
 *
 * Purely presentational (§13.3): it holds no window state and no date maths, so
 * it cannot change WHETHER a number is honest — only which one is asked for.
 * Every honesty gate lives upstream in `ownerReceiptCopy.ts` and the backend.
 *
 * Two details are deliberate:
 *  - the concrete dates are shown under the pills, because a pill reading
 *    "28 days" that actually means "28 days ending four days ago" would be new
 *    opacity inside a transparency control;
 *  - the custom range commits on blur or Enter, not on every keystroke. An
 *    `<input type="date">` emits a valid value for each arrow-key step, and each
 *    one used to fire a full receipt request — five parallel backend reads for a
 *    query the owner had not finished typing.
 */
const PILL_BASE =
  "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors";
const PILL_ON = "bg-alloro-navy text-white";
const PILL_OFF = "border border-line-soft text-ink-muted hover:text-alloro-navy";

interface WindowSelectorProps {
  presets: WindowPreset[];
  activePresetId: string | null;
  /** The windows currently being fetched — shown as concrete dates. */
  selected: OwnerReceiptWindows;
  customOpen: boolean;
  customStart: string;
  customEnd: string;
  /** Newest day a window may end on and still be coverable. Clamps both fields. */
  maxDay: string;
  onPickPreset: (preset: WindowPreset) => void;
  onToggleCustom: () => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  /** Fired on blur / Enter — the only thing that starts a new request. */
  onCommitCustom: () => void;
}

export function WindowSelector({
  presets,
  activePresetId,
  selected,
  customOpen,
  customStart,
  customEnd,
  maxDay,
  onPickPreset,
  onToggleCustom,
  onCustomStartChange,
  onCustomEndChange,
  onCommitCustom,
}: WindowSelectorProps) {
  const commitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      onCommitCustom();
    }
  };

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

      <p className="mt-2 text-[11px] text-ink-muted tabular-nums">
        {windowRangeLabel(selected)}
      </p>
      <p className="mt-1 text-[11px] text-ink-muted">{WINDOW_LAG_NOTE}</p>

      {customOpen && (
        <div className="mt-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              {WINDOW_CUSTOM_START_LABEL}
              <input
                type="date"
                value={customStart}
                max={customEnd || maxDay}
                onChange={(event) => onCustomStartChange(event.target.value)}
                onBlur={onCommitCustom}
                onKeyDown={commitOnEnter}
                className="rounded-[8px] border border-line-soft px-2 py-1 text-[12px] font-medium text-alloro-navy"
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted">
              {WINDOW_CUSTOM_END_LABEL}
              <input
                type="date"
                value={customEnd}
                min={customStart || undefined}
                max={maxDay}
                onChange={(event) => onCustomEndChange(event.target.value)}
                onBlur={onCommitCustom}
                onKeyDown={commitOnEnter}
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

export default WindowSelector;
