import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveAdminGbpReply,
  createAdminGbpPostDraftFromReview,
  deleteAdminGbpPublishedLocalPost,
  deleteAdminGbpPublishedReply,
  deployAdminGbpReply,
  generateAdminGbpPostDraftNow,
  generateAdminGbpDraft,
  getAdminGbpAutomation,
  getAdminGbpDeployPreview,
  getAdminGbpPublishedLocalPosts,
  regenerateAdminGbpPostDraft,
  rejectAdminGbpReplyDraft,
  retryAdminGbpReply,
  saveAdminGbpReviewDraftSlot,
  triggerAdminGbpPostsSync,
  triggerAdminGbpReviewsSync,
  updateAdminGbpPublishedLocalPost,
  updateAdminGbpPublishedReply,
  updateAdminGbpDraft,
  updateAdminGbpReviewEscalation,
  updateAdminGbpSettings,
  uploadAdminGbpPostImage,
} from "../../api/admin-gbp-automation";
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

export function useAdminGbpAutomation(
  organizationId: number,
  locationId?: number | null,
  params?: GbpAutomationQueryOptions
) {
  const queryParams = {
    needsReplyMonth: params?.needsReplyMonth || null,
    repliedMonth: params?.repliedMonth || null,
  };
  return useQuery({
    queryKey: QUERY_KEYS.adminOrgGbpAutomation(organizationId, locationId, queryParams),
    queryFn: () => getAdminGbpAutomation(organizationId, locationId!, queryParams),
    enabled: Boolean(organizationId && locationId),
    placeholderData: (previousData) => previousData,
    refetchInterval: (query) =>
      hasRunningPostGeneration(query.state.data as GbpAutomationResponse | undefined)
        ? 2500
        : false,
  });
}

export function useAdminGbpPublishedLocalPosts(
  organizationId: number,
  locationId?: number | null,
  enabled = true,
  params?: { page?: number; limit?: number }
) {
  return useQuery({
    queryKey: QUERY_KEYS.adminOrgGbpPublishedLocalPosts(organizationId, locationId, params),
    queryFn: () => getAdminGbpPublishedLocalPosts(organizationId, locationId!, params),
    enabled: Boolean(enabled && organizationId && locationId),
    placeholderData: (previousData) => previousData,
  });
}

export function useAdminGbpAutomationActions(
  organizationId: number,
  locationId?: number | null
) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.adminOrgGbpAutomationAll(organizationId),
    });
  const invalidatePublishedPosts = () =>
    queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.adminOrgGbpPublishedLocalPostsAll(organizationId),
    });
  const invalidateAll = () => {
    void invalidate();
    void invalidatePublishedPosts();
  };

  return {
    updateSettings: useMutation({
      mutationFn: (data: Partial<GbpAutomationSettings>) =>
        updateAdminGbpSettings(organizationId, locationId!, data),
      onSuccess: invalidate,
    }),
    generateDraft: useMutation({
      mutationFn: (reviewId: string) =>
        generateAdminGbpDraft(organizationId, locationId!, reviewId),
      onSuccess: invalidate,
    }),
    createPostDraft: useMutation({
      mutationFn: (input: { reviewId: string; featuredImageUrl: string }) =>
        createAdminGbpPostDraftFromReview(
          organizationId,
          locationId!,
          input.reviewId,
          input.featuredImageUrl
        ),
      onSuccess: invalidate,
    }),
    generatePostDraftNow: useMutation({
      mutationFn: (featuredImageUrl: string) =>
        generateAdminGbpPostDraftNow(organizationId, locationId!, featuredImageUrl),
      onSuccess: invalidate,
    }),
    uploadPostImage: useMutation({
      mutationFn: (file: File) => uploadAdminGbpPostImage(organizationId, locationId!, file),
    }),
    updatePublishedLocalPost: useMutation({
      mutationFn: (input: GbpPublishedLocalPostInput) =>
        updateAdminGbpPublishedLocalPost(organizationId, locationId!, input),
      onSuccess: invalidateAll,
    }),
    deletePublishedLocalPost: useMutation({
      mutationFn: (name: string) =>
        deleteAdminGbpPublishedLocalPost(organizationId, locationId!, name),
      onSuccess: invalidateAll,
    }),
    syncReviews: useMutation({
      mutationFn: () => triggerAdminGbpReviewsSync(organizationId, locationId!),
      onSuccess: invalidate,
    }),
    syncPosts: useMutation({
      mutationFn: () => triggerAdminGbpPostsSync(organizationId, locationId!),
      onSuccess: invalidateAll,
    }),
    saveReviewSlotDraft: useMutation({
      mutationFn: (input: { reviewId: string; draftContent: string }) =>
        saveAdminGbpReviewDraftSlot(
          organizationId,
          locationId!,
          input.reviewId,
          input.draftContent
        ),
      onSuccess: invalidate,
    }),
    updateDraft: useMutation({
      mutationFn: (input: {
        workItemId: string;
        draftContent: string;
        featuredImageUrl?: string | null;
      }) =>
        updateAdminGbpDraft(
          organizationId,
          locationId!,
          input.workItemId,
          input.draftContent,
          input.featuredImageUrl
        ),
      onSuccess: invalidate,
    }),
    regeneratePostDraft: useMutation({
      mutationFn: (workItemId: string) =>
        regenerateAdminGbpPostDraft(organizationId, locationId!, workItemId),
      onSuccess: invalidate,
    }),
    updatePublishedReply: useMutation({
      mutationFn: (input: { reviewId: string; replyContent: string }) =>
        updateAdminGbpPublishedReply(
          organizationId,
          locationId!,
          input.reviewId,
          input.replyContent
        ),
      onSuccess: invalidate,
    }),
    deletePublishedReply: useMutation({
      mutationFn: (reviewId: string) =>
        deleteAdminGbpPublishedReply(organizationId, locationId!, reviewId),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: (input: { workItemId: string; approvedContent: string }) =>
        approveAdminGbpReply(
          organizationId,
          locationId!,
          input.workItemId,
          input.approvedContent
      ),
      onSuccess: invalidate,
    }),
    deleteDraft: useMutation({
      mutationFn: (workItemId: string) =>
        rejectAdminGbpReplyDraft(
          organizationId,
          locationId!,
          workItemId,
          "Draft deleted from Alloro."
        ),
      onSuccess: invalidate,
    }),
    deploy: useMutation({
      mutationFn: (input: { workItemId: string; confirmNeedsReview?: boolean }) =>
        deployAdminGbpReply(
          organizationId,
          locationId!,
          input.workItemId,
          Boolean(input.confirmNeedsReview)
        ),
      onSuccess: invalidate,
    }),
    deployPreview: useMutation({
      mutationFn: (workItemId: string) =>
        getAdminGbpDeployPreview(organizationId, locationId!, workItemId),
    }),
    retry: useMutation({
      mutationFn: (workItemId: string) =>
        retryAdminGbpReply(organizationId, locationId!, workItemId),
      onSuccess: invalidate,
    }),
    updateEscalation: useMutation({
      mutationFn: (input: {
        reviewId: string;
        status: "open" | "resolved" | "dismissed";
        reason: string;
        note?: string | null;
      }) =>
        updateAdminGbpReviewEscalation(organizationId, locationId!, input.reviewId, {
          status: input.status,
          reason: input.reason,
          note: input.note,
        }),
      onSuccess: invalidate,
    }),
  };
}
