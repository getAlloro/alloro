import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, X, Loader2, RotateCcw } from "lucide-react";
import { toast } from "react-hot-toast";
import { useQueryClient } from "@tanstack/react-query";
import {
  adminPreviewResetData,
  adminResetOrgData,
  type ResetGroupKey,
  type ResetPreviewData,
} from "../../api/admin-organizations";
import { QUERY_KEYS } from "../../lib/queryClient";

interface ResetOrgDataModalProps {
  org: { id: number; name: string };
  open: boolean;
  onClose: () => void;
}

/**
 * Admin "Reset Data" modal.
 *
 * v1 ships with two reset groups: `pms_ingestion` and `agent_referral`.
 * UI cascade: when PMS is checked, Referral Engine is force-checked and
 * disabled with a hint ("derived data"). Backend deletes literally what's
 * in the `groups` array — the cascade is presentation-layer only.
 *
 * Mirrors the danger-zone confirm pattern from
 * components/Admin/OrgSettingsSection.tsx (Delete Organization modal).
 */
export function ResetOrgDataModal({
  org,
  open,
  onClose,
}: ResetOrgDataModalProps) {
  const queryClient = useQueryClient();

  const [preview, setPreview] = useState<ResetPreviewData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [pmsChecked, setPmsChecked] = useState(true);
  const [reChecked, setReChecked] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset local state every time the modal opens, then fetch preview counts
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setPreview(null);
    setPmsChecked(true);
    setReChecked(true);
    setConfirmText("");
    setIsSubmitting(false);
    setLoadingPreview(true);

    (async () => {
      try {
        const data = await adminPreviewResetData(org.id);
        if (cancelled) return;
        setPreview(data);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg =
          err instanceof Error ? err.message : "Failed to load reset preview";
        toast.error(msg);
        onClose();
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, org.id]);

  // Cascade UX — PMS checked forces RE checked
  const effectiveReChecked = pmsChecked ? true : reChecked;
  const reCheckboxDisabled = pmsChecked || isSubmitting;

  const anyGroupSelected = pmsChecked || effectiveReChecked;
  const nameMatches = confirmText === org.name;
  const canSubmit =
    !isSubmitting && !loadingPreview && anyGroupSelected && nameMatches;

  const handleSubmit = async () => {
    if (!canSubmit) return;

    const groups: ResetGroupKey[] = [];
    if (pmsChecked) groups.push("pms_ingestion");
    if (effectiveReChecked) groups.push("agent_referral");

    setIsSubmitting(true);
    try {
      const result = await adminResetOrgData(org.id, {
        groups,
        confirmName: confirmText,
      });

      const totalDeleted = Object.values(result.deletedCounts).reduce(
        (sum, n) => sum + (typeof n === "number" ? n : 0),
        0
      );

      toast.success(
        `Reset complete: ${totalDeleted} row${totalDeleted === 1 ? "" : "s"} deleted across ${result.groupsExecuted.length} group${result.groupsExecuted.length === 1 ? "" : "s"}`
      );

      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOrgPmsJobsAll(org.id),
      });
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.adminOrgAgentOutputsAll(org.id),
      });

      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to reset organization data";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  const pmsCount = preview?.counts.pms_ingestion ?? 0;
  const reCount = preview?.counts.agent_referral ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm"
        onClick={() => !isSubmitting && onClose()}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-md rounded-2xl bg-white shadow-xl overflow-hidden"
      >
        <button
          onClick={() => !isSubmitting && onClose()}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          aria-label="Close"
        >
          <X className="h-5 w-5 text-gray-400" />
        </button>

        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="p-3 rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900">
              Reset Organization Data
            </h3>
          </div>

          <div className="space-y-3 mb-5">
            <p className="text-sm text-gray-600">
              Permanently wipe the selected data groups for{" "}
              <strong>"{org.name}"</strong>. Other data (users, locations,
              connections, schedules) is untouched.
            </p>
            <p className="text-sm text-red-600 font-bold">
              This action cannot be undone.
            </p>
          </div>

          {/* Reset group selection */}
          <div className="mb-5 rounded-lg border border-red-200 bg-red-50/40 p-4 space-y-3">
            <p className="text-xs font-bold text-red-900 uppercase tracking-wider">
              Select groups to reset
            </p>

            {loadingPreview ? (
              <div className="flex items-center gap-2 py-3 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading row counts...
              </div>
            ) : (
              <>
                {/* PMS Ingestion */}
                <label
                  className={`flex items-start gap-3 p-2.5 rounded-md hover:bg-white/60 transition-colors ${
                    isSubmitting ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={pmsChecked}
                    disabled={isSubmitting}
                    onChange={(e) => setPmsChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        PMS Ingestion
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        ({pmsCount} {pmsCount === 1 ? "row" : "rows"})
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Deletes all rows from <code>pms_jobs</code> for this org.
                    </p>
                  </div>
                </label>

                {/* Referral Engine output */}
                <label
                  className={`flex items-start gap-3 p-2.5 rounded-md hover:bg-white/60 transition-colors ${
                    reCheckboxDisabled
                      ? "cursor-not-allowed opacity-70"
                      : "cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={effectiveReChecked}
                    disabled={reCheckboxDisabled}
                    onChange={(e) => setReChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500 disabled:opacity-50"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        Referral Engine output
                      </span>
                      <span className="text-xs text-gray-500 font-mono">
                        ({reCount} {reCount === 1 ? "row" : "rows"} in
                        agent_results)
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Deletes <code>agent_results</code> +{" "}
                      <code>agent_recommendations</code> where{" "}
                      <code>agent_type = 'referral_engine'</code>.
                    </p>
                    {pmsChecked && (
                      <p className="text-xs text-amber-700 mt-1.5 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                        <span>
                          PMS reset also clears Referral Engine output (derived
                          data)
                        </span>
                      </p>
                    )}
                  </div>
                </label>
              </>
            )}
          </div>

          {/* Type-org-name confirm */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type <strong>"{org.name}"</strong> to confirm:
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-300 disabled:opacity-50"
              placeholder={org.name}
              disabled={isSubmitting || loadingPreview}
              autoComplete="off"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => !isSubmitting && onClose()}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RotateCcw className="w-4 h-4" />
              )}
              Reset Data
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
