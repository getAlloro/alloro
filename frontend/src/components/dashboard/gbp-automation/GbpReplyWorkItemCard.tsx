import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, RotateCw, Save, Send, Star, Trash2, X } from "lucide-react";
import type { GbpReview, GbpWorkItem } from "../../../api/gbpAutomation";

export type GbpReplyWorkItemCardProps = {
  item: GbpWorkItem;
  sourceReview?: GbpReview;
  isBusy: boolean;
  onSave: (workItemId: string, draftContent: string) => void;
  onApprove: (workItemId: string, approvedContent: string) => void | Promise<unknown>;
  onDeploy: (workItemId: string) => void | Promise<unknown>;
  onRetry: (workItemId: string) => void;
  onDelete: (workItemId: string) => void | Promise<unknown>;
};
function reviewDateLabel(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
function safetyBadge(item: GbpWorkItem): { label: string; className: string } | null {
  if (!item.safety_status) return null;
  if (item.safety_status === "blocked") {
    return { label: "Blocked", className: "bg-red-50 text-red-600" };
  }
  if (item.safety_status === "needs_review") {
    return { label: "Safety review", className: "bg-amber-50 text-amber-700" };
  }
  return { label: "Safe", className: "bg-emerald-50 text-emerald-700" };
}
export function GbpReplyWorkItemCard({
  item,
  sourceReview,
  isBusy,
  onSave,
  onApprove,
  onDeploy,
  onRetry,
  onDelete,
}: GbpReplyWorkItemCardProps) {
  const [draft, setDraft] = useState(item.draft_content);
  const [isEditing, setIsEditing] = useState(item.status === "draft");
  const [isQueueingDeployment, setIsQueueingDeployment] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isQueueingDeploymentRef = useRef(false);
  const isDeletingRef = useRef(false);
  const isDirty = draft.trim() !== item.draft_content.trim();
  const isDeployableStatus = item.status !== "deploying" && item.status !== "published";
  const needsApproval = item.status !== "approved" || isDirty;
  const canQueueDeployment = Boolean(draft.trim()) && isDeployableStatus;
  const canRetry = item.status === "draft" && Boolean(item.last_error_code);
  const canDelete = item.status !== "deploying" && item.status !== "published";
  const actionBusy = isBusy || isDeleting;
  const sourceReviewDate = reviewDateLabel(sourceReview?.review_created_at || null);
  const safety = safetyBadge(item);
  useEffect(() => {
    setDraft(item.draft_content);
    setIsEditing(item.status === "draft");
  }, [item.draft_content, item.id, item.status]);
  const handleApproveAndDeploy = async () => {
    if (!canQueueDeployment || isQueueingDeploymentRef.current) return;
    isQueueingDeploymentRef.current = true;
    setIsQueueingDeployment(true);
    try {
      if (needsApproval) {
        await onApprove(item.id, draft);
      }
      await onDeploy(item.id);
    } finally {
      isQueueingDeploymentRef.current = false;
      setIsQueueingDeployment(false);
    }
  };
  const handleDelete = async () => {
    if (!canDelete || isDeletingRef.current) return;
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };
  return (
    <div className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
            {item.status.replaceAll("_", " ")}
          </span>
          {safety && (
            <span
              className={`ml-2 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${safety.className}`}
            >
              {safety.label}
            </span>
          )}
          {item.last_error_message && (
            <p className="mt-2 text-xs font-bold text-red-600">{item.last_error_message}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsEditing((value) => !value)}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Pencil size={12} />
          Edit
        </button>
      </div>

      {sourceReview && (
        <div className="mt-3 rounded-[10px] border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              Source review
            </span>
            <div className="flex items-center gap-1 text-alloro-orange">
              {Array.from({ length: sourceReview.stars }).map((_, index) => (
                <Star key={index} size={12} fill="currentColor" />
              ))}
            </div>
            {sourceReviewDate && (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                {sourceReviewDate}
              </span>
            )}
          </div>
          <p className="mt-2 text-xs font-bold text-alloro-navy">
            {sourceReview.reviewer_name || "Google reviewer"}
          </p>
          <p className="mt-1 line-clamp-3 text-xs leading-5 text-slate-600">
            {sourceReview.text || "No written review text."}
          </p>
        </div>
      )}
      {isEditing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="mt-3 min-h-[116px] w-full resize-y rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-sm font-medium leading-6 text-alloro-navy outline-none transition focus:border-alloro-orange"
        />
      ) : (
        <p className="mt-3 whitespace-pre-wrap rounded-[10px] bg-slate-50 p-3 text-sm font-medium leading-6 text-alloro-navy">
          {draft}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={actionBusy}
          onClick={() => onSave(item.id, draft)}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={12} />
          Save
        </button>
        <button
          type="button"
          disabled={actionBusy || isQueueingDeployment || !canQueueDeployment}
          onClick={handleApproveAndDeploy}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-navy px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isQueueingDeployment ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send size={12} />
          )}
          {isQueueingDeployment ? "Queueing" : "Deploy to GBP"}
        </button>
        {canRetry && (
          <button
            type="button"
            disabled={actionBusy}
            onClick={() => onRetry(item.id)}
            className="inline-flex items-center gap-1.5 rounded-[9px] bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCw size={12} />
            Retry
          </button>
        )}
        {isConfirmingDelete ? (
          <span className="inline-flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isDeleting}
              onClick={() => setIsConfirmingDelete(false)}
              className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X size={12} />
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-[9px] bg-red-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 size={12} />}
              {isDeleting ? "Deleting..." : "Confirm delete draft"}
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={actionBusy || !canDelete}
            onClick={() => setIsConfirmingDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-red-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={12} />
            Delete draft
          </button>
        )}
      </div>
    </div>
  );
}
