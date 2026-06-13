import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Save, Send, Sparkles } from "lucide-react";
import type { GbpReview, GbpWorkItem } from "../../../api/gbpAutomation";

export type GbpDraftSaveInput = {
  reviewId: string;
  workItemId: string | null;
  draftContent: string;
};
export type GbpDraftDeployInput = {
  workItemId: string;
  draftContent: string;
};
export type GbpReviewReplySlotProps = {
  review: GbpReview;
  item?: GbpWorkItem;
  isBusy: boolean;
  isGenerating?: boolean;
  /**
   * Suppress the reassuring "Safe" badge in the client-facing view (internal
   * safety "clean" status). Blocked / Safety review always show. Default false
   * keeps the admin view unchanged. Spec: plans/06132026-reviews-posts-clarity.
   */
  hideSafeBadge?: boolean;
  onGenerateDraft: (reviewId: string) => Promise<unknown>;
  onSaveDraft: (input: GbpDraftSaveInput) => Promise<unknown>;
  onDeployDraft: (input: GbpDraftDeployInput) => Promise<unknown>;
};
type SaveState = "idle" | "saving" | "saved" | "error";
function draftText(item?: GbpWorkItem): string {
  if (!item) return "";
  return item.published_content || item.approved_content || item.draft_content;
}
function safetyLabel(item: GbpWorkItem | undefined, hideSafeBadge: boolean): string | null {
  if (!item?.safety_status) return null;
  if (item.safety_status === "needs_review") return "Safety review";
  if (item.safety_status === "blocked") return "Blocked";
  // Clean status: the reassuring "Safe" label — hidden in the client view.
  if (hideSafeBadge) return null;
  return "Safe";
}
export function GbpReviewReplySlot({
  review,
  item,
  isBusy,
  isGenerating = false,
  hideSafeBadge = false,
  onGenerateDraft,
  onSaveDraft,
  onDeployDraft,
}: GbpReviewReplySlotProps) {
  const safety = safetyLabel(item, hideSafeBadge);
  const serverValue = draftText(item);
  const [value, setValue] = useState(serverValue);
  const [hasPendingUserEdit, setHasPendingUserEdit] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isDeploying, setIsDeploying] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const latestValueRef = useRef(serverValue);
  const isDirty = value.trim() !== serverValue.trim();
  const isGoogleLocked = item?.status === "deploying" || item?.status === "published";
  const isLocked = isGoogleLocked || isDeploying || (isBusy && !isGenerating);
  const canSave = hasPendingUserEdit && value.trim().length > 0 && !isLocked && isDirty;
  const canGenerate = !isGoogleLocked && !isDeploying && (!isBusy || isGenerating);
  const canDeploy = Boolean(item && value.trim() && !hasPendingUserEdit && !isDirty && !isLocked);
  const clearSaveTimer = useCallback(() => {
    if (!saveTimerRef.current) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
  }, []);
  useEffect(() => {
    latestValueRef.current = value;
  }, [value]);
  useEffect(() => {
    clearSaveTimer();
    setValue(serverValue);
    setHasPendingUserEdit(false);
    setSaveState("idle");
  }, [clearSaveTimer, item?.id, serverValue]);
  const saveDraft = useCallback(async () => {
    const contentToSave = latestValueRef.current;
    if (!contentToSave.trim() || isLocked) return;
    if (!hasPendingUserEdit || contentToSave.trim() === serverValue.trim()) {
      setHasPendingUserEdit(false);
      setSaveState("idle");
      return;
    }
    clearSaveTimer();
    setSaveState("saving");
    try {
      await onSaveDraft({
        reviewId: review.id,
        workItemId: item?.id || null,
        draftContent: contentToSave,
      });
      if (latestValueRef.current === contentToSave) {
        setHasPendingUserEdit(false);
        setSaveState("saved");
      }
    } catch {
      if (latestValueRef.current === contentToSave) setSaveState("error");
    }
  }, [
    clearSaveTimer,
    hasPendingUserEdit,
    isLocked,
    item?.id,
    onSaveDraft,
    review.id,
    serverValue,
  ]);
  useEffect(() => {
    if (!canSave) return;
    setSaveState("saving");
    saveTimerRef.current = window.setTimeout(saveDraft, 900);
    return clearSaveTimer;
  }, [canSave, clearSaveTimer, saveDraft]);
  const handleDraftChange = (nextValue: string) => {
    setValue(nextValue);
    setHasPendingUserEdit(nextValue.trim() !== serverValue.trim());
    if (saveState !== "saving") setSaveState("idle");
  };
  const handleGenerateDraft = async () => {
    if (!canGenerate || isGenerating) return;
    clearSaveTimer();
    setHasPendingUserEdit(false);
    setSaveState("idle");
    await onGenerateDraft(review.id);
  };
  const handleDeploy = async () => {
    if (!item || !canDeploy) return;
    clearSaveTimer();
    setIsDeploying(true);
    try {
      await onDeployDraft({ workItemId: item.id, draftContent: value });
    } finally {
      setIsDeploying(false);
    }
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: "easeOut" }}
      className="rounded-[10px] border border-dashed border-slate-300 bg-white px-3 py-2"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Reply draft
          </p>
          {item && (
            <span className="rounded-full bg-alloro-orange/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-alloro-orange">
              {item.status.replaceAll("_", " ")}
            </span>
          )}
          {safety && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                item?.safety_status === "blocked"
                  ? "bg-red-50 text-red-600"
                  : item?.safety_status === "needs_review"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {safety}
            </span>
          )}
        </div>
        {saveState !== "idle" && (
          <span className={`text-[10px] font-black uppercase tracking-widest ${
            saveState === "error" ? "text-red-500" : "text-slate-400"
          }`}>
            {saveState === "saving" && "Saving..."}
            {saveState === "saved" && "Saved"}
            {saveState === "error" && "Save failed"}
          </span>
        )}
      </div>
      <textarea
        value={value}
        disabled={isLocked || isGenerating}
        onChange={(event) => handleDraftChange(event.target.value)}
        placeholder="Generate a draft or write the reply here."
        className="mt-2 min-h-[96px] w-full resize-y rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-sm font-medium leading-6 text-alloro-navy outline-none transition focus:border-alloro-orange disabled:cursor-not-allowed disabled:opacity-60"
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={() => {
            clearSaveTimer();
            saveDraft();
          }}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saveState === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save size={13} />}
          Save
        </button>
        <button
          type="button"
          disabled={!canGenerate || isGenerating}
          onClick={handleGenerateDraft}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-orange px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles size={13} />}
          {isGenerating ? "Generating" : "Generate draft"}
        </button>
        <button
          type="button"
          disabled={!canDeploy}
          onClick={handleDeploy}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-navy px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-alloro-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeploying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send size={13} />}
          {isDeploying ? "Queueing" : "Publish to Google"}
        </button>
      </div>
    </motion.div>
  );
}
