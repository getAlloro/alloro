/**
 * IdentitySliceEditor
 *
 * Slide-up drawer for editing a single slice of `project_identity` as raw
 * JSON in Monaco. Mirrors the `LeadgenSubmissionDetail` drawer pattern
 * (AnimatePresence + motion.aside + backdrop) but slides from the **bottom**
 * (height 70vh, rounded top corners).
 *
 * Transient invalid-preview rule: while the editor holds invalid JSON the
 * caller's main tab renders empty + warning banner. The caller wires that
 * by reading `onValidationChange` + `isOpen`. When the drawer closes (saved
 * or cancelled), the caller re-reads from identity.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, AlertTriangle } from "lucide-react";
import MonacoJsonEditor from "../MonacoJsonEditor";
import { useConfirm } from "../../ui/ConfirmModal";
import { getErrorMessage } from "../../../lib/errorMessage";

interface IdentitySliceEditorProps {
  open: boolean;
  title: string;
  /** e.g. `content_essentials.doctors` — echoed for display only. */
  slicePath: string;
  /** Current slice value from identity. Serialized to JSON for the editor. */
  initialValue: unknown;
  /** Fires with the parsed value on save. Caller should call patchIdentitySlice. */
  onSave: (newValue: unknown) => Promise<void>;
  onClose: () => void;
  /**
   * Fires every time validation state flips. Caller can render the main
   * tab as empty+warning while the drawer is open AND the editor has
   * invalid JSON.
   */
  onValidationChange?: (isValid: boolean) => void;
}

export default function IdentitySliceEditor({
  open,
  title,
  slicePath,
  initialValue,
  onSave,
  onClose,
  onValidationChange,
}: IdentitySliceEditorProps) {
  const confirm = useConfirm();
  const initialJson = JSON.stringify(initialValue ?? null, null, 2);
  const [draft, setDraft] = useState(initialJson);
  const [isValid, setIsValid] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset draft whenever the drawer re-opens or the initial value shifts.
  useEffect(() => {
    if (!open) return;
    setDraft(initialJson);
    setIsValid(true);
    setError(null);
  }, [open, initialJson]);

  // Bubble validation state up so the caller can empty its main view.
  useEffect(() => {
    onValidationChange?.(isValid);
  }, [isValid, onValidationChange]);

  const isDirty = draft !== initialJson;

  const handleValidationChange = useCallback((valid: boolean) => {
    setIsValid(valid);
  }, []);

  // ESC to close (matches LeadgenSubmissionDetail).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        void handleClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty]);

  const handleClose = async () => {
    if (isDirty) {
      const ok = await confirm({
        title: "Discard changes?",
        message:
          "You have unsaved edits in the JSON editor. Closing will revert to the last-saved value.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        variant: "danger",
      });
      if (!ok) return;
    }
    onClose();
  };

  const handleSave = async () => {
    if (!isValid || !isDirty || saving) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      setError("JSON failed to parse — fix errors before saving.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      await onSave(parsed);
      onClose();
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="slice-backdrop"
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => void handleClose()}
          />
          <motion.aside
            key="slice-drawer"
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col"
            style={{ height: "70vh" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-alloro-navy truncate">
                  {title}
                </h2>
                <div className="text-[11px] font-mono text-gray-400 truncate">
                  {slicePath}
                </div>
              </div>
              <button
                onClick={() => void handleClose()}
                className="rounded-lg p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Body — Monaco fills remaining space */}
            <div className="flex-1 min-h-0 px-6 py-4 overflow-hidden">
              <MonacoJsonEditor
                value={draft}
                onChange={setDraft}
                onValidationChange={handleValidationChange}
                height="100%"
              />
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0 flex-1">
                {!isValid && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    Invalid JSON — fix before saving
                  </div>
                )}
                {error && isValid && (
                  <div className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 border border-red-200 px-3 py-1.5 text-xs text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {error}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => void handleClose()}
                  disabled={saving}
                  className="text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={!isValid || !isDirty || saving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
                    </>
                  ) : (
                    "Save"
                  )}
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
