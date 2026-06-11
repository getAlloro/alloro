import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { GbpPostImageUploader } from "./GbpPostImageUploader";

export type GbpCreatePostDraftModalProps = {
  isOpen: boolean;
  isGenerating: boolean;
  onClose: () => void;
  onGenerate: (featuredImageUrl: string | null) => void | Promise<unknown>;
  onUploadImage: (file: File) => Promise<string>;
};

export function GbpCreatePostDraftModal({
  isOpen,
  isGenerating,
  onClose,
  onGenerate,
  onUploadImage,
}: GbpCreatePostDraftModalProps) {
  const [postImageUrl, setPostImageUrl] = useState("");
  // Photo is optional — the post text matters more. Generate is only gated
  // on not already generating.
  const canGenerate = !isGenerating;

  useEffect(() => {
    if (!isOpen) setPostImageUrl("");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    await onGenerate(postImageUrl.trim() || null);
    setPostImageUrl("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-alloro-navy/55 px-4 backdrop-blur-sm">
      <section className="w-full max-w-xl rounded-[14px] border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-alloro-navy">
              Create post draft
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">
              Alloro will generate a draft you can edit before it ever goes to
              Google. Adding a photo is optional.
            </p>
          </div>
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            aria-label="Close create post draft modal"
            className="rounded-[9px] border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5">
          <GbpPostImageUploader
            value={postImageUrl}
            disabled={isGenerating}
            onChange={setPostImageUrl}
            onUpload={onUploadImage}
            uploadSuccessMessage="Image uploaded. Generate a post draft to use it."
          />
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={isGenerating}
            onClick={onClose}
            className="rounded-[9px] border border-slate-200 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canGenerate}
            onClick={() => void handleGenerate()}
            className="inline-flex items-center gap-2 rounded-[9px] bg-alloro-orange px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating ? "Generating" : "Generate draft"}
          </button>
        </div>
      </section>
    </div>
  );
}
