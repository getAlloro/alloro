import { useState } from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { regenerateComponent } from "../../../api/websites";
import { getErrorMessage } from "../../../lib/errorMessage";

interface RegenerateComponentModalProps {
  projectId: string;
  pageId: string;
  sectionNames: string[];
  /** Optional section preselected */
  defaultSection?: string;
  /**
   * Called SYNCHRONOUSLY before the API request fires so the parent can set
   * the "regenerating" flag before the poll loop sees `gen=generating`.
   * Without this, the poll can race ahead of `onRegenerated` and briefly
   * mount the progressive-preview component, flashing a "Loading preview…"
   * state before the flag gets set.
   */
  onWillRegenerate?: (sectionName: string) => void;
  /**
   * Called after the regenerate request succeeds. Receives the name of the
   * section that was enqueued for regeneration so the caller can drive
   * per-section UI feedback (pulse/gray + toast on completion).
   */
  onRegenerated: (sectionName: string) => void;
  onClose: () => void;
}

/**
 * Prompts for a target section + instruction, fires the regenerate endpoint,
 * and hands back to the parent (which is expected to re-enter live-preview
 * polling mode for that single section).
 */
export default function RegenerateComponentModal({
  projectId,
  pageId,
  sectionNames,
  defaultSection,
  onWillRegenerate,
  onRegenerated,
  onClose,
}: RegenerateComponentModalProps) {
  const [section, setSection] = useState<string>(
    defaultSection || sectionNames[0] || "",
  );
  const [instruction, setInstruction] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!section || submitting) return;
    try {
      setSubmitting(true);
      setError(null);
      // Flag the section as regenerating BEFORE the API fires so the parent's
      // poll loop can't observe gen=generating before the flag is set.
      onWillRegenerate?.(section);
      await regenerateComponent(projectId, pageId, section, instruction.trim() || undefined);
      onRegenerated(section);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Failed to regenerate");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={!submitting ? onClose : undefined}
      />
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-alloro-orange" />
              <h2 className="text-base font-bold text-gray-900">Regenerate Section</h2>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                Section to regenerate
              </label>
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
              >
                {sectionNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">
                What should change? (optional)
              </label>
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                rows={3}
                placeholder="e.g., make the CTA more urgent; emphasize same-day appointments"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Leave blank to regenerate with the same inputs as before.
              </p>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !section}
              className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Regenerate
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
