import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import type {
  GbpPublishedLocalPost,
  GbpPublishedLocalPostInput,
  GbpReview,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import {
  GbpLocalPostWorkItemCard,
  type GbpLocalPostDeployInput,
  type GbpLocalPostSaveInput,
} from "./GbpLocalPostWorkItemCard";
import { GbpCreatePostDraftModal } from "./GbpCreatePostDraftModal";
import { GbpPublishedPostsList } from "./GbpPublishedPostsList";
import { GbpPostsManagerHeader } from "./GbpPostsManagerHeader";

export type GbpPostsManagerPanelProps = {
  reviews: GbpReview[];
  workItems: GbpWorkItem[];
  publishedPosts: GbpPublishedLocalPost[];
  publishedPostsPagination?: { page: number; limit: number; total: number; totalPages: number };
  nextPostGenerationAt?: string | null;
  isBusy: boolean;
  isLoadingPublishedPosts: boolean;
  isGeneratingPostDraft: boolean;
  onPublishedPostsPageChange?: (page: number) => void;
  onGeneratePostDraft?: (featuredImageUrl: string | null) => void | Promise<unknown>;
  onUploadPostImage: (file: File) => Promise<string>;
  onSavePublishedPost?: (input: GbpPublishedLocalPostInput) => void | Promise<unknown>;
  onDeletePublishedPost?: (name: string) => void | Promise<unknown>;
  onSavePost: (input: GbpLocalPostSaveInput) => void | Promise<unknown>;
  onRegeneratePost: (workItemId: string) => void | Promise<unknown>;
  onDeployPost: (input: GbpLocalPostDeployInput) => void | Promise<unknown>;
  onDelete: (workItemId: string) => void | Promise<unknown>;
  /**
   * Show a short "why Google Posts matter" note above the tabs. Set true by the
   * client /gbp-manager surface (the Posts tab was otherwise bare, #10). The
   * admin work-items panel does not use this component, so it defaults off.
   */
  showVisibilityNote?: boolean;
};

type PostTab = "published" | "drafts";

function isRunningPostGeneration(item: GbpWorkItem): boolean {
  return item.content_type === "local_post" && item.metadata?.generationStatus === "running";
}

export function GbpPostsManagerPanel({
  reviews,
  workItems,
  publishedPosts,
  publishedPostsPagination,
  nextPostGenerationAt,
  isBusy,
  isLoadingPublishedPosts,
  isGeneratingPostDraft,
  onPublishedPostsPageChange,
  onGeneratePostDraft,
  onUploadPostImage,
  onSavePublishedPost,
  onDeletePublishedPost,
  onSavePost,
  onRegeneratePost,
  onDeployPost,
  onDelete,
  showVisibilityNote = false,
}: GbpPostsManagerPanelProps) {
  const [activePostTab, setActivePostTab] = useState<PostTab>("published");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const reviewById = useMemo(
    () => new Map(reviews.map((review) => [review.id, review])),
    [reviews]
  );
  const postDrafts = useMemo(
    () =>
      workItems.filter(
        (item) =>
          item.content_type === "local_post" &&
          item.status !== "published" &&
          item.status !== "rejected"
      ),
    [workItems]
  );
  const runningPostGeneration = useMemo(
    () => workItems.find(isRunningPostGeneration),
    [workItems]
  );
  const isPostGenerationLocked = Boolean(runningPostGeneration) || isGeneratingPostDraft;
  const canPagePosts =
    Boolean(publishedPostsPagination && onPublishedPostsPageChange) &&
    !isLoadingPublishedPosts;

  const handleGeneratePostDraft = async (featuredImageUrl: string | null) => {
    if (!onGeneratePostDraft) return;
    await onGeneratePostDraft(featuredImageUrl);
    setActivePostTab("drafts");
  };

  return (
    <section className="rounded-[14px] border border-line-soft bg-white p-5 shadow-premium">
      {showVisibilityNote && (
        <p className="mb-4 text-[13px] font-medium leading-relaxed text-ink-muted">
          Fresh Google Posts keep your Business Profile looking active and cared
          for, so patients comparing you to another practice see a business
          that's clearly open and paying attention. Aim for a post every week or
          two.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-[10px] bg-slate-100 p-1">
          {(["published", "drafts"] as const).map((tab) => {
            const isActiveTab = activePostTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActivePostTab(tab)}
                className={`rounded-[9px] px-3 py-1.5 text-xs font-bold transition-colors ${
                  isActiveTab
                    ? "bg-alloro-navy text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {tab === "published" ? "Published" : "Drafts"}
                <span
                  className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${
                    isActiveTab ? "bg-white/20" : "bg-slate-200"
                  }`}
                >
                  {tab === "published"
                    ? (publishedPostsPagination?.total ?? publishedPosts.length)
                    : postDrafts.length}
                </span>
              </button>
            );
          })}
        </div>
        <GbpPostsManagerHeader
          nextPostGenerationAt={nextPostGenerationAt}
          isGenerationLocked={isPostGenerationLocked}
          canCreate={Boolean(onGeneratePostDraft)}
          onCreateClick={() => setIsCreateModalOpen(true)}
        />
      </div>

      {runningPostGeneration && (
        <div className="mt-4 rounded-[10px] border border-alloro-orange/20 bg-alloro-orange/10 px-3 py-2 text-xs font-bold text-alloro-orange">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            A Google post draft is generating. This page will keep checking until it is ready.
          </span>
        </div>
      )}

      {activePostTab === "published" ? (
        <div className="mt-4 space-y-3">
          <GbpPublishedPostsList
            posts={publishedPosts}
            pagination={publishedPostsPagination}
            isBusy={isBusy}
            isLoading={isLoadingPublishedPosts}
            canPage={canPagePosts}
            onPageChange={onPublishedPostsPageChange}
            onSave={onSavePublishedPost}
            onDelete={onDeletePublishedPost}
            onUploadImage={onUploadPostImage}
          />
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {postDrafts.length > 0 ? (
            postDrafts.map((item) => (
              <GbpLocalPostWorkItemCard
                key={item.id}
                item={item}
                sourceReview={
                  item.source_review_id ? reviewById.get(item.source_review_id) : undefined
                }
                isBusy={isBusy}
                onSave={onSavePost}
                onRegenerate={onRegeneratePost}
                onDeploy={onDeployPost}
                onDelete={onDelete}
                onUploadImage={onUploadPostImage}
              />
            ))
          ) : (
            <p className="rounded-[10px] bg-slate-50 p-3 text-sm font-bold text-slate-500">
              No Google post drafts are waiting right now.
            </p>
          )}
        </div>
      )}

      <GbpCreatePostDraftModal
        isOpen={isCreateModalOpen}
        isGenerating={isPostGenerationLocked}
        onClose={() => setIsCreateModalOpen(false)}
        onGenerate={handleGeneratePostDraft}
        onUploadImage={onUploadPostImage}
      />
    </section>
  );
}
