import { useEffect, useRef, useState } from "react";
import type {
  GbpPublishedLocalPost,
  GbpPublishedLocalPostInput,
} from "../../../api/gbpAutomation";
import { GbpPostImageUploader } from "./GbpPostImageUploader";
import { GbpPublishedLocalPostActions } from "./GbpPublishedLocalPostActions";
import {
  dateLabel,
  imageUrlFromMedia,
  postStateHelp,
  postStatePill,
} from "./gbpPublishedLocalPostUtils";

export type GbpPublishedLocalPostCardProps = {
  post: GbpPublishedLocalPost;
  isBusy: boolean;
  onSave: (input: GbpPublishedLocalPostInput) => void | Promise<unknown>;
  onDelete: (name: string) => void | Promise<unknown>;
  onUploadImage: (file: File) => Promise<string>;
};

export function GbpPublishedLocalPostCard({
  post,
  isBusy,
  onSave,
  onDelete,
  onUploadImage,
}: GbpPublishedLocalPostCardProps) {
  const initialFeaturedImageUrl = post.featuredImageUrl || imageUrlFromMedia(post.media);
  const statePill = postStatePill(post);
  const [summary, setSummary] = useState(post.summary);
  const [featuredImageUrl, setFeaturedImageUrl] = useState(initialFeaturedImageUrl);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const isDeletingRef = useRef(false);

  useEffect(() => {
    const nextImageUrl = post.featuredImageUrl || imageUrlFromMedia(post.media);
    setSummary(post.summary);
    setFeaturedImageUrl(nextImageUrl);
    setIsConfirmingDelete(false);
  }, [post.name, post.summary, post.featuredImageUrl, post.media]);

  const isDirty =
    summary !== post.summary || featuredImageUrl !== initialFeaturedImageUrl;
  const canSave = Boolean(summary.trim()) && Boolean(featuredImageUrl.trim()) && isDirty;

  const handleSave = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      await onSave({
        name: post.name,
        summary,
        featuredImageUrl,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (isDeletingRef.current) return;
    isDeletingRef.current = true;
    setIsDeleting(true);
    try {
      await onDelete(post.name);
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <article className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              Google post
            </span>
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${statePill.className}`}>
              {statePill.label}
            </span>
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">
              {dateLabel(post.createTime)}
            </span>
          </div>
          <p className="mt-2 text-xs font-semibold leading-5 text-slate-500">
            {postStateHelp(post)}
          </p>

          <label className="mt-4 block text-[10px] font-black uppercase tracking-widest text-slate-400">
            Post summary
          </label>
          <textarea
            value={summary}
            disabled={isBusy || isSaving || isDeleting}
            onChange={(event) => setSummary(event.target.value)}
            className="mt-2 min-h-[128px] w-full resize-y rounded-[10px] border border-slate-200 bg-slate-50 p-3 text-sm font-medium leading-6 text-alloro-navy outline-none transition focus:border-alloro-orange disabled:cursor-not-allowed disabled:opacity-60"
            placeholder="Write the published post summary."
          />

          <div className="mt-3 xl:hidden">
            <GbpPostImageUploader
              value={featuredImageUrl}
              disabled={isBusy || isSaving || isDeleting}
              onChange={setFeaturedImageUrl}
              onUpload={onUploadImage}
              uploadSuccessMessage="Image uploaded and staged. Save to Google to publish it."
            />
          </div>

          {isDirty && (
            <p className="mt-3 rounded-[10px] border border-alloro-orange/20 bg-alloro-orange/10 px-3 py-2 text-xs font-bold leading-5 text-alloro-orange">
              Unsaved changes. Save to Google to publish this text/image update.
            </p>
          )}

          <GbpPublishedLocalPostActions
            searchUrl={post.searchUrl}
            canSave={canSave}
            isBusy={isBusy}
            isSaving={isSaving}
            isDeleting={isDeleting}
            isConfirmingDelete={isConfirmingDelete}
            onSave={handleSave}
            onStartDelete={() => setIsConfirmingDelete(true)}
            onCancelDelete={() => setIsConfirmingDelete(false)}
            onConfirmDelete={handleDelete}
          />
        </div>

        <div className="hidden w-full shrink-0 xl:block xl:w-48">
          <GbpPostImageUploader
            value={featuredImageUrl}
            disabled={isBusy || isSaving || isDeleting}
            onChange={setFeaturedImageUrl}
            onUpload={onUploadImage}
            uploadSuccessMessage="Image uploaded and staged. Save to Google to publish it."
          />
        </div>
      </div>
    </article>
  );
}
