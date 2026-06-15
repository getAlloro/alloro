export type StatusFilter =
  | "all"
  | "pending"
  | "waiting_for_approval"
  | "approved"
  | "completed"
  | "error";
export type ApprovalFilter = "all" | "approved" | "unapproved";

export interface PaginationState {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface JobEditorState {
  draft: string;
  isDirty: boolean;
  error?: string;
}
