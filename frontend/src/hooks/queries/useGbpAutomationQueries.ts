import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveGbpCategoryDraft,
  approveGbpReply,
  createGbpPostDraftFromReview,
  deleteGbpPublishedReply,
  deleteGbpPublishedLocalPost,
  deployGbpReply,
  dismissGbpCategoryDraft,
  generateGbpPostDraftNow,
  generateGbpReplyDraft,
  getGbpAutomation,
  proposeGbpCategory,
  getGbpDeployPreview,
  getGbpPublishedLocalPosts,
  regenerateGbpPostDraft,
  rejectGbpReplyDraft,
  retryGbpReply,
  saveGbpReviewDraftSlot,
  triggerGbpPostsSync,
  triggerGbpReviewsSync,
  updateGbpAutomationSettings,
  updateGbpPublishedLocalPost,
  updateGbpPublishedReply,
  updateGbpReviewEscalation,
  updateGbpReplyDraft,
  uploadGbpPostImage,
} from "../../api/gbpAutomation";
import type {
  GbpAutomationResponse,
  GbpAutomationQueryOptions,
  GbpAutomationSettings,
  GbpPublishedLocalPostInput,
} from "../../api/gbpAutomation";
import { QUERY_KEYS } from "../../lib/queryClient";

function hasRunningPostGeneration(data?: GbpAutomationResponse): boolean {
  return Boolean(
    data?.workItems.some(
      (item) =>
        item.content_type === "local_post" &&
        item.metadata?.generationStatus === "running"
    )
  );
}

export function useGbpAutomation(
  organizationId: number | null,
  locationId?: number | null,
  params?: GbpAutomationQueryOptions
) {
  const queryParams = {
    needsReplyMonth: params?.needsReplyMonth || null,
    repliedMonth: params?.repliedMonth || null,
  };
  return useQuery({
    queryKey: QUERY_KEYS.gbpAutomation(organizationId, locationId, queryParams),
    queryFn: () => getGbpAutomation(locationId!, queryParams),
    enabled: Boolean(organizationId && locationId),
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) =>
      hasRunningPostGeneration(query.state.data as GbpAutomationResponse | undefined)
        ? 2500
        : false,
  });
}

export function useGbpPublishedLocalPosts(
  organizationId: number | null,
  locationId?: number | null,
  enabled = true,
  params?: { page?: number; limit?: number }
) {
  return useQuery({
    queryKey: QUERY_KEYS.gbpPublishedLocalPosts(organizationId, locationId, params),
    queryFn: () => getGbpPublishedLocalPosts(locationId!, params),
    enabled: Boolean(enabled && organizationId && locationId),
    placeholderData: (previousData) => previousData,
  });
}

/**
 * GF2 — primary-category proposal actions, kept as their own hook so the
 * category panel owns a focused surface (§13.3) instead of pulling the whole
 * automation-actions object. `propose` stages an owner-approval draft; `approve`
 * records the owner's decision (publishing stays A6-gated server-side); `dismiss`
 * declines it. Each invalidates the automation query so any staged draft the
 * response carries stays in sync.
 */
export function useGbpCategoryProposalActions(
  organizationId: number | null,
  locationId?: number | null
) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.gbpAutomationAll(organizationId),
    });

  return {
    propose: useMutation({
      mutationFn: () => proposeGbpCategory(locationId!),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (workItemId: string) =>
        approveGbpCategoryDraft(workItemId, locationId!),
      onSuccess: invalidate,
    }),
    dismiss: useMutation({
      mutationFn: (workItemId: string) =>
        dismissGbpCategoryDraft(workItemId, locationId!),
      onSuccess: invalidate,
    }),
  };
}

export function useGbpAutomationActions(
  organizationId: number | null,
  locationId?: number | null
) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.gbpAutomationAll(organizationId),
    });
  const invalidatePublishedPosts = () =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.gbpPublishedLocalPostsAll(organizationId),
    });
  const invalidateAll = () => {
    void invalidate();
    void invalidatePublishedPosts();
  };

  return {
    generateDraft: useMutation({
      mutationFn: (reviewId: string) => generateGbpReplyDraft(reviewId, locationId!),
      onSuccess: invalidate,
    }),
    createPostDraft: useMutation({
      mutationFn: (input: { reviewId: string; featuredImageUrl: string | null }) =>
        createGbpPostDraftFromReview(
          input.reviewId,
          locationId!,
          input.featuredImageUrl
        ),
      onSuccess: invalidate,
    }),
    generatePostDraftNow: useMutation({
      mutationFn: (featuredImageUrl: string | null) =>
        generateGbpPostDraftNow(locationId!, featuredImageUrl),
      onSuccess: invalidate,
    }),
    uploadPostImage: useMutation({
      mutationFn: (file: File) => uploadGbpPostImage(locationId!, file),
    }),
    updatePublishedLocalPost: useMutation({
      mutationFn: (input: GbpPublishedLocalPostInput) =>
        updateGbpPublishedLocalPost(locationId!, input),
      onSuccess: invalidateAll,
    }),
    deletePublishedLocalPost: useMutation({
      mutationFn: (name: string) => deleteGbpPublishedLocalPost(locationId!, name),
      onSuccess: invalidateAll,
    }),
    syncReviews: useMutation({
      mutationFn: () => triggerGbpReviewsSync(locationId!),
      onSuccess: invalidate,
    }),
    syncPosts: useMutation({
      mutationFn: () => triggerGbpPostsSync(locationId!),
      onSuccess: invalidateAll,
    }),
    saveReviewSlotDraft: useMutation({
      mutationFn: (input: { reviewId: string; draftContent: string }) =>
        saveGbpReviewDraftSlot(input.reviewId, locationId!, input.draftContent),
      onSuccess: invalidate,
    }),
    updateDraft: useMutation({
      mutationFn: (input: {
        workItemId: string;
        draftContent: string;
        featuredImageUrl?: string | null;
      }) =>
        updateGbpReplyDraft(
          input.workItemId,
          locationId!,
          input.draftContent,
          input.featuredImageUrl
        ),
      onSuccess: invalidate,
    }),
    regeneratePostDraft: useMutation({
      mutationFn: (workItemId: string) => regenerateGbpPostDraft(workItemId, locationId!),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (input: { workItemId: string; approvedContent: string }) =>
        approveGbpReply(input.workItemId, locationId!, input.approvedContent),
      onSuccess: invalidate,
    }),
    deleteDraft: useMutation({
      mutationFn: (workItemId: string) =>
        rejectGbpReplyDraft(workItemId, locationId!, "Draft deleted from Alloro."),
      onSuccess: invalidate,
    }),
    deploy: useMutation({
      mutationFn: (input: { workItemId: string; confirmNeedsReview?: boolean }) =>
        deployGbpReply(input.workItemId, locationId!, Boolean(input.confirmNeedsReview)),
      onSuccess: invalidate,
    }),
    deployPreview: useMutation({
      mutationFn: (workItemId: string) => getGbpDeployPreview(workItemId, locationId!),
    }),
    retry: useMutation({
      mutationFn: (workItemId: string) => retryGbpReply(workItemId, locationId!),
      onSuccess: invalidate,
    }),
    updateSettings: useMutation({
      mutationFn: (data: Partial<GbpAutomationSettings>) =>
        updateGbpAutomationSettings(locationId!, data),
      onSuccess: invalidate,
    }),
    updateEscalation: useMutation({
      mutationFn: (input: {
        reviewId: string;
        status: "open" | "resolved" | "dismissed";
        reason: string;
        note?: string | null;
      }) =>
        updateGbpReviewEscalation(input.reviewId, locationId!, {
          status: input.status,
          reason: input.reason,
          note: input.note,
        }),
      onSuccess: invalidate,
    }),
    updatePublishedReply: useMutation({
      mutationFn: (input: { reviewId: string; replyContent: string }) =>
        updateGbpPublishedReply(input.reviewId, locationId!, input.replyContent),
      onSuccess: invalidate,
    }),
    deletePublishedReply: useMutation({
      mutationFn: (reviewId: string) => deleteGbpPublishedReply(reviewId, locationId!),
      onSuccess: invalidate,
    }),
  };
}
