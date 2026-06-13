import type {
  GbpPublishedLocalPost,
  GbpPublishedLocalPostInput,
  GbpReview,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import {
  type GbpLocalPostDeployInput,
  type GbpLocalPostSaveInput,
} from "./GbpLocalPostWorkItemCard";
import { GbpPostsManagerPanel } from "./GbpPostsManagerPanel";

export type GbpClientDraftsPanelProps = {
  reviews: GbpReview[];
  workItems: GbpWorkItem[];
  publishedPosts?: GbpPublishedLocalPost[];
  publishedPostsPagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  isBusy: boolean;
  isLoadingPublishedPosts?: boolean;
  onPublishedPostsPageChange?: (page: number) => void;
  onDelete: (workItemId: string) => void | Promise<unknown>;
  onSavePost: (input: GbpLocalPostSaveInput) => void | Promise<unknown>;
  onRegeneratePost: (workItemId: string) => void | Promise<unknown>;
  onDeployPost: (input: GbpLocalPostDeployInput) => void | Promise<unknown>;
  onGeneratePostDraft?: (featuredImageUrl: string | null) => void | Promise<unknown>;
  onUploadPostImage: (file: File) => Promise<string>;
  onSavePublishedPost?: (input: GbpPublishedLocalPostInput) => void | Promise<unknown>;
  onDeletePublishedPost?: (name: string) => void | Promise<unknown>;
  isGeneratingPostDraft?: boolean;
  nextPostGenerationAt?: string | null;
  /** Show the "why Google Posts matter" note (client Posts tab, #10). */
  showVisibilityNote?: boolean;
};

export function GbpClientDraftsPanel({
  reviews,
  workItems,
  publishedPosts = [],
  publishedPostsPagination,
  isBusy,
  isLoadingPublishedPosts = false,
  onPublishedPostsPageChange,
  onDelete,
  onSavePost,
  onRegeneratePost,
  onDeployPost,
  onGeneratePostDraft,
  onUploadPostImage,
  onSavePublishedPost,
  onDeletePublishedPost,
  isGeneratingPostDraft = false,
  nextPostGenerationAt,
  showVisibilityNote = false,
}: GbpClientDraftsPanelProps) {
  return (
    <div className="mt-4 space-y-3">
      <GbpPostsManagerPanel
        reviews={reviews}
        workItems={workItems}
        showVisibilityNote={showVisibilityNote}
        publishedPosts={publishedPosts}
        publishedPostsPagination={publishedPostsPagination}
        nextPostGenerationAt={nextPostGenerationAt}
        isBusy={isBusy}
        isLoadingPublishedPosts={isLoadingPublishedPosts}
        isGeneratingPostDraft={isGeneratingPostDraft}
        onPublishedPostsPageChange={onPublishedPostsPageChange}
        onGeneratePostDraft={onGeneratePostDraft}
        onUploadPostImage={onUploadPostImage}
        onSavePublishedPost={onSavePublishedPost}
        onDeletePublishedPost={onDeletePublishedPost}
        onSavePost={onSavePost}
        onRegeneratePost={onRegeneratePost}
        onDeployPost={onDeployPost}
        onDelete={onDelete}
      />
    </div>
  );
}
