import type {
  GbpPublishedLocalPost,
  GbpPublishedLocalPostInput,
  GbpReview,
  GbpWorkItem,
} from "../../../api/gbpAutomation";
import {
  type GbpLocalPostDeployInput,
  type GbpLocalPostSaveInput,
} from "../../dashboard/gbp-automation/GbpLocalPostWorkItemCard";
import { GbpPostsManagerPanel } from "../../dashboard/gbp-automation/GbpPostsManagerPanel";

export type AdminGbpWorkItemsPanelProps = {
  workItems: GbpWorkItem[];
  reviews: GbpReview[];
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
  onGeneratePostDraft?: (featuredImageUrl: string) => void | Promise<unknown>;
  onUploadPostImage: (file: File) => Promise<string>;
  onSavePublishedPost?: (input: GbpPublishedLocalPostInput) => void | Promise<unknown>;
  onDeletePublishedPost?: (name: string) => void | Promise<unknown>;
  isGeneratingPostDraft?: boolean;
  nextPostGenerationAt?: string | null;
};

export function AdminGbpWorkItemsPanel({
  workItems,
  reviews,
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
}: AdminGbpWorkItemsPanelProps) {
  return (
    <GbpPostsManagerPanel
      reviews={reviews}
      workItems={workItems}
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
  );
}
