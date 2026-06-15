import { useState } from "react";
import {
  Loader2,
  Sparkles,
  Ban,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import type { DynamicSlotDef, BlockCheckResult } from "../../api/websites";
import { testUrl } from "../../api/websites";
import { getErrorMessage } from "../../lib/errorMessage";

// Special slot value markers the backend recognizes:
//   "__generate__" → "AI, write this for me based on identity"
//   "__skip__"     → "Don't generate this section in the page"
// Any other string (including empty) = admin-provided value
export const SLOT_GENERATE = "__generate__";
export const SLOT_SKIP = "__skip__";

interface DynamicSlotInputsProps {
  slots: DynamicSlotDef[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  /** Project ID — needed for the URL test endpoint. Optional in contexts that don't support it. */
  projectId?: string;
  title?: string;
  emptyMessage?: string;
}

/**
 * Renders a set of slot input fields with per-slot helpers:
 * - Text slots get "Generate for me" and "Skip section" quick actions
 * - URL slots get a Test button that probes for WAF / anti-bot blocks
 */
export default function DynamicSlotInputs({
  slots,
  values,
  onChange,
  projectId,
  title,
  emptyMessage = "No slots defined for this template page.",
}: DynamicSlotInputsProps) {
  if (!slots || slots.length === 0) {
    return <div className="text-xs text-gray-400 italic">{emptyMessage}</div>;
  }

  return (
    <div className="space-y-4">
      {title && <div className="text-xs font-semibold text-gray-700">{title}</div>}
      {slots.map((slot) => (
        <SlotRow
          key={slot.key}
          slot={slot}
          value={values[slot.key] || ""}
          onChange={(v) => onChange(slot.key, v)}
          projectId={projectId}
        />
      ))}
    </div>
  );
}

function SlotRow({
  slot,
  value,
  onChange,
  projectId,
}: {
  slot: DynamicSlotDef;
  value: string;
  onChange: (v: string) => void;
  projectId?: string;
}) {
  const mode =
    value === SLOT_GENERATE
      ? "generate"
      : value === SLOT_SKIP
        ? "skip"
        : "manual";

  return (
    <div className="space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <label className="block text-xs font-medium text-gray-700">
            {slot.label}
            {slot.type === "url" && (
              <span className="ml-1.5 text-[9px] uppercase font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                URL
              </span>
            )}
          </label>
          {slot.description && (
            <p className="text-[11px] text-gray-500 leading-snug mt-0.5">
              {slot.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <SlotActionButton
            label="Generate"
            title="Let the AI generate this content"
            icon={<Sparkles className="h-3 w-3" />}
            active={mode === "generate"}
            onClick={() => onChange(mode === "generate" ? "" : SLOT_GENERATE)}
            color="orange"
          />
          <SlotActionButton
            label="Skip"
            title="Don't include this section in the generated page"
            icon={<Ban className="h-3 w-3" />}
            active={mode === "skip"}
            onClick={() => onChange(mode === "skip" ? "" : SLOT_SKIP)}
            color="gray"
          />
        </div>
      </div>

      {mode === "generate" && (
        <div className="rounded-lg border border-alloro-orange/30 bg-alloro-orange/5 px-3 py-2 text-xs text-alloro-orange flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          AI will generate this based on the project identity.
        </div>
      )}

      {mode === "skip" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 flex items-center gap-1.5">
          <Ban className="h-3.5 w-3.5" />
          This section will be omitted from the generated page.
        </div>
      )}

      {mode === "manual" &&
        (slot.type === "url" ? (
          <UrlSlotInput
            slot={slot}
            value={value}
            onChange={onChange}
            projectId={projectId}
          />
        ) : (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={slot.placeholder || ""}
            rows={2}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
          />
        ))}
    </div>
  );
}

function SlotActionButton({
  label,
  title,
  icon,
  active,
  onClick,
  color,
}: {
  label: string;
  title: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color: "orange" | "gray";
}) {
  const activeClasses =
    color === "orange"
      ? "border-alloro-orange bg-alloro-orange text-white"
      : "border-gray-400 bg-gray-600 text-white";
  const inactiveClasses =
    "border-gray-200 bg-white text-gray-600 hover:border-gray-300";
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium transition ${
        active ? activeClasses : inactiveClasses
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function UrlSlotInput({
  slot,
  value,
  onChange,
  projectId,
}: {
  slot: DynamicSlotDef;
  value: string;
  onChange: (v: string) => void;
  projectId?: string;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<BlockCheckResult | null>(null);

  const handleTest = async () => {
    if (!projectId || !value.trim() || testing) return;
    try {
      setTesting(true);
      setResult(null);
      const res = await testUrl(projectId, value.trim());
      setResult(res.data);
    } catch (err: unknown) {
      setResult({
        ok: false,
        block_type: "unknown",
        status: null,
        detail: getErrorMessage(err) || "Test failed",
        detected_signals: [],
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          type="url"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setResult(null);
          }}
          placeholder={slot.placeholder || "https://..."}
          className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
        />
        {projectId && (
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !value.trim()}
            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {testing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <ExternalLink className="h-3 w-3" />
            )}
            Test
          </button>
        )}
      </div>
      {result && !result.ok && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-800">
          <div className="flex items-center gap-1 font-semibold">
            <Ban className="h-3 w-3 shrink-0" />
            Blocked: {result.block_type} ({result.detail})
          </div>
          <div className="text-red-700 mt-0.5">
            The AI may not be able to scrape this URL. You can still keep it as
            context, or try a different URL.
          </div>
        </div>
      )}
      {result && result.ok && result.thin_content === true && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
          <div className="flex items-center gap-1 font-semibold">
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Looks thin ({result.preview_chars.toLocaleString()} chars).
          </div>
          <div className="text-amber-700 mt-0.5">
            This may scrape empty — try a different URL.
          </div>
        </div>
      )}
      {result && result.ok && result.thin_content !== true && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-[11px] text-green-800">
          OK — {result.preview_chars.toLocaleString()} chars received (status {result.status}).
        </div>
      )}
    </div>
  );
}
