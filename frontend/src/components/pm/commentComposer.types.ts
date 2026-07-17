import type { PmUser } from "../../types/pm";

export type CommentComposerProps = {
  taskId?: string;
  users: PmUser[];
  initialBody?: string;
  initialMentions?: number[];
  submitting?: boolean;
  placeholder?: string;
  submitLabel?: string;
  allowImages?: boolean;
  onSubmit: (
    body: string,
    mentions: number[],
    images: File[],
  ) => Promise<void> | void;
  onCancel?: () => void;
  autoFocus?: boolean;
};

export type MentionPopupState = {
  isOpen: boolean;
  query: string;
  triggerAt: number;
  selectedIndex: number;
};

export type SelectedCommentImage = {
  id: string;
  file: File;
  previewUrl: string;
};
