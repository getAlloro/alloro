import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "react-hot-toast";
import {
  createComment as createPmTaskComment,
  deleteComment as deletePmTaskComment,
  fetchPmUsers,
  listComments,
  updateComment as updatePmTaskComment,
} from "../../api/pm";
import { getErrorMessage } from "../../lib/errorMessage";
import { QUERY_KEYS } from "../../lib/queryClient";
import type { PmTaskComment, PmUser } from "../../types/pm";

type CommentAction =
  | { type: "create"; body: string; mentions: number[] }
  | { type: "update"; commentId: string; body: string; mentions: number[] }
  | { type: "delete"; commentId: string };

type CommentActionResult =
  | { type: "upsert"; comment: PmTaskComment }
  | { type: "delete"; commentId: string };

export type PmTaskCommentsState = {
  comments: PmTaskComment[];
  users: PmUser[];
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  create: (body: string, mentions: number[]) => Promise<void>;
  update: (
    commentId: string,
    body: string,
    mentions: number[],
  ) => Promise<void>;
  remove: (commentId: string) => Promise<void>;
};

async function runCommentAction(
  taskId: string,
  action: CommentAction,
): Promise<CommentActionResult> {
  if (action.type === "create") {
    const comment = await createPmTaskComment(
      taskId,
      action.body,
      action.mentions,
    );
    return { type: "upsert", comment };
  }
  if (action.type === "update") {
    const comment = await updatePmTaskComment(
      taskId,
      action.commentId,
      action.body,
      action.mentions,
    );
    return { type: "upsert", comment };
  }
  await deletePmTaskComment(taskId, action.commentId);
  return { type: "delete", commentId: action.commentId };
}

export function usePmTaskComments(taskId: string | null): PmTaskCommentsState {
  const queryClient = useQueryClient();
  const commentsQuery = useQuery({
    queryKey: QUERY_KEYS.pmTaskComments(taskId),
    queryFn: () => listComments(taskId as string),
    enabled: Boolean(taskId),
  });
  const usersQuery = useQuery({
    queryKey: QUERY_KEYS.pmUsers,
    queryFn: fetchPmUsers,
    enabled: Boolean(taskId),
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (action: CommentAction) =>
      runCommentAction(taskId as string, action),
    onSuccess: (result) => {
      queryClient.setQueryData<PmTaskComment[]>(
        QUERY_KEYS.pmTaskComments(taskId),
        (current = []) =>
          result.type === "delete"
            ? current.filter((comment) => comment.id !== result.commentId)
            : current.some((comment) => comment.id === result.comment.id)
              ? current.map((comment) =>
                  comment.id === result.comment.id ? result.comment : comment,
                )
              : [...current, result.comment],
      );
    },
    onError: (error: unknown) =>
      toast.error(getErrorMessage(error) || "Couldn't update the comment"),
  });
  const execute = async (action: CommentAction): Promise<void> => {
    await mutation.mutateAsync(action);
  };
  const error = commentsQuery.error ?? usersQuery.error ?? mutation.error;
  return {
    comments: commentsQuery.data ?? [],
    users: usersQuery.data ?? [],
    isLoading: commentsQuery.isLoading || usersQuery.isLoading,
    isSubmitting: mutation.isPending,
    error: error
      ? getErrorMessage(error) || "Couldn't load the conversation"
      : null,
    create: (body, mentions) => execute({ type: "create", body, mentions }),
    update: (commentId, body, mentions) =>
      execute({ type: "update", commentId, body, mentions }),
    remove: (commentId) => execute({ type: "delete", commentId }),
  };
}
