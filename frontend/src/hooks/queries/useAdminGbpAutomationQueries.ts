import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveAdminGbpReply,
  createAdminGbpPostDraftFromReview,
  deleteAdminGbpPublishedReply,
  deployAdminGbpReply,
  generateAdminGbpDraft,
  getAdminGbpAutomation,
  getAdminGbpDeployPreview,
  rejectAdminGbpReplyDraft,
  retryAdminGbpReply,
  saveAdminGbpReviewDraftSlot,
  triggerAdminGbpReviewsSync,
  updateAdminGbpPublishedReply,
  updateAdminGbpDraft,
  updateAdminGbpReviewEscalation,
  updateAdminGbpSettings,
} from "../../api/admin-gbp-automation";
import type {
  GbpAutomationQueryOptions,
  GbpAutomationSettings,
} from "../../api/gbpAutomation";
import { QUERY_KEYS } from "../../lib/queryClient";

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
      mutationFn: (reviewId: string) =>
        createAdminGbpPostDraftFromReview(organizationId, locationId!, reviewId),
      onSuccess: invalidate,
    }),
    syncReviews: useMutation({
      mutationFn: () => triggerAdminGbpReviewsSync(organizationId, locationId!),
      onSuccess: invalidate,
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
      mutationFn: (input: { workItemId: string; draftContent: string }) =>
        updateAdminGbpDraft(
          organizationId,
          locationId!,
          input.workItemId,
          input.draftContent
        ),
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
