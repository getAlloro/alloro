import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveGbpReply,
  createGbpPostDraftFromReview,
  deleteGbpPublishedReply,
  deployGbpReply,
  generateGbpReplyDraft,
  getGbpAutomation,
  getGbpDeployPreview,
  rejectGbpReplyDraft,
  retryGbpReply,
  saveGbpReviewDraftSlot,
  triggerGbpReviewsSync,
  updateGbpAutomationSettings,
  updateGbpPublishedReply,
  updateGbpReviewEscalation,
  updateGbpReplyDraft,
} from "../../api/gbpAutomation";
import type {
  GbpAutomationQueryOptions,
  GbpAutomationSettings,
} from "../../api/gbpAutomation";
import { QUERY_KEYS } from "../../lib/queryClient";

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
  });
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

  return {
    generateDraft: useMutation({
      mutationFn: (reviewId: string) => generateGbpReplyDraft(reviewId, locationId!),
      onSuccess: invalidate,
    }),
    createPostDraft: useMutation({
      mutationFn: (reviewId: string) => createGbpPostDraftFromReview(reviewId, locationId!),
      onSuccess: invalidate,
    }),
    syncReviews: useMutation({
      mutationFn: () => triggerGbpReviewsSync(locationId!),
      onSuccess: invalidate,
    }),
    saveReviewSlotDraft: useMutation({
      mutationFn: (input: { reviewId: string; draftContent: string }) =>
        saveGbpReviewDraftSlot(input.reviewId, locationId!, input.draftContent),
      onSuccess: invalidate,
    }),
    updateDraft: useMutation({
      mutationFn: (input: { workItemId: string; draftContent: string }) =>
        updateGbpReplyDraft(input.workItemId, locationId!, input.draftContent),
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
