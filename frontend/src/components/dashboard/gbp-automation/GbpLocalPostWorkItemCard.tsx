import { useEffect, useRef, useState } from "react";
import {
  Image,
  Loader2,
  RotateCw,
  Save,
  Send,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { GbpReview, GbpWorkItem } from "../../../api/gbpAutomation";
import { GbpPostImageUploader } from "./GbpPostImageUploader";

export type GbpLocalPostDeployInput = {
  workItemId: string;
  draftContent: string;
  featuredImageUrl: string;
};

export type GbpLocalPostSaveInput = GbpLocalPostDeployInput;

export type GbpLocalPostWorkItemCardProps = {
  item: GbpWorkItem;
  sourceReview?: GbpReview;
  isBusy: boolean;
  onSave: (input: GbpLocalPostSaveInput) => void | Promise<unknown>;
  onRegenerate: (workItemId: string) => void | Promise<unknown>;
  onDeploy: (input: GbpLocalPostDeployInput) => void | Promise<unknown>;
  onDelete: (workItemId: string) => void | Promise<unknown>;
  onUploadImage: (file: File) => Promise<string>;
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

export function GbpLocalPostWorkItemCard({
  item,
  sourceReview,
  isBusy,
  onSave,
  onRegenerate,
  onDeploy,
  onDelete,
  onUploadImage,
}: GbpLocalPostWorkItemCardProps) {
  const [draft, setDraft] = useState(item.draft_content);
  const [featuredImageUrl, setFeaturedImageUrl] = useState(item.featured_image_url || "");
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const isDeployingRef = useRef(false);
  const isDeletingRef = useRef(false);
  const generationStatus = item.metadata?.generationStatus;
  const isGenerationRunning = generationStatus === "running";
  const isGenerationFailed = generationStatus === "failed";
  const canEdit =
    item.status !== "deploying" && item.status !== "published" && !isGenerationRunning;
  const canDeploy = canEdit && Boolean(draft.trim()) && Boolean(featuredImageUrl.trim());
  const sourceReviewDate = reviewDateLabel(sourceReview?.review_created_at || null);

  useEffect(() => {
    setDraft(item.draft_content);
    setFeaturedImageUrl(item.featured_image_url || "");
  }, [item.draft_content, item.featured_image_url, item.id]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        workItemId: item.id,
        draftContent: draft,
        featuredImageUrl,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      await onRegenerate(item.id);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeploy = async () => {
    if (!canDeploy || isDeployingRef.current) return;
    isDeployingRef.current = true;
    setIsDeploying(true);
    try {
      await onDeploy({
        workItemId: item.id,
        draftContent: draft,
        featuredImageUrl,
      });
    } finally {
      isDeployingRef.current = false;
      setIsDeploying(false);
    }
  };

  const handleDelete = async () => {
    if (!canEdit || isDeletingRef.current) return;
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
    <article className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              Local post
            </span>
            <span className="rounded-full bg-alloro-orange/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-alloro-orange">
              {item.status.replaceAll("_", " ")}
            </span>
          </div>
          {item.last_error_message && (
            <p className="mt-2 text-xs font-bold text-red-600">{item.last_error_message}</p>
          )}
          {isGenerationRunning && (
            <p className="mt-2 inline-flex items-center gap-2 text-xs font-bold text-alloro-orange">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating post draft. Refresh-safe polling is active.
            </p>
          )}
          {isGenerationFailed && item.last_error_message && (
            <p className="mt-2 text-xs font-bold text-red-600">
              Generation failed. Update the image or try again.
            </p>
          )}
        </div>
        {featuredImageUrl ? (
          <img
            src={featuredImageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-24 w-full rounded-[10px] border border-slate-200 object-cover lg:w-36"
          />
        ) : (
          <div className="flex h-24 w-full items-center justify-center rounded-[10px] border border-dashed border-slate-300 bg-slate-50 text-slate-400 lg:w-36">
            <Image size={18} />
          </div>
        )}
      </div>

      {sourceReview && (
        <div className="mt-4 rounded-[10px] border border-slate-200 bg-slate-50 p-3">
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
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">
            {sourceReview.text || "No written review text."}
          </p>
        </div>
      )}

      <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-400">
        Post summary
      </label>
      <textarea
        value={draft}
        disabled={!canEdit}
        onChange={(event) => setDraft(event.target.value)}
        className="mt-2 min-h-[132px] w-full resize-y rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-sm font-medium leading-6 text-alloro-navy outline-none transition focus:border-alloro-orange disabled:cursor-not-allowed disabled:opacity-60"
        placeholder={isGenerationRunning ? "Generating post draft..." : "Write the post summary."}
      />

      <div className="mt-3">
        <GbpPostImageUploader
          value={featuredImageUrl}
          disabled={!canEdit}
          showPreview={false}
          onChange={setFeaturedImageUrl}
          onUpload={onUploadImage}
          uploadSuccessMessage="Image uploaded. Save the post draft to keep it."
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isBusy || isSaving || !canEdit}
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded-[9px] border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save size={12} />}
          {isSaving ? "Saving" : "Save"}
        </button>
        <button
          type="button"
          disabled={isBusy || isGenerating || !canEdit || !featuredImageUrl.trim()}
          onClick={handleRegenerate}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-orange px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isGenerating ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCw size={12} />}
          {isGenerating ? "Generating" : "Generate Draft"}
        </button>
        <button
          type="button"
          disabled={isBusy || isDeploying || !canDeploy}
          onClick={handleDeploy}
          className="inline-flex items-center gap-1.5 rounded-[9px] bg-alloro-navy px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-navy/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isDeploying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send size={12} />}
          {isDeploying ? "Queueing" : "Deploy to GBP"}
        </button>
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
            disabled={isBusy || !canEdit}
            onClick={() => setIsConfirmingDelete(true)}
            className="inline-flex items-center gap-1.5 rounded-[9px] border border-red-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 size={12} />
            Delete draft
          </button>
        )}
      </div>
    </article>
  );
}
