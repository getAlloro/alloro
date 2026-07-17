import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Send } from "lucide-react";
import type { PmUser } from "../../types/pm";
import { CommentComposerInput } from "./CommentComposerInput";
import { CommentMentionPopup } from "./CommentMentionPopup";
import {
  EMPTY_MENTION_POPUP,
  filterMentionUsers,
  findMentionQuery,
  pruneMentionIds,
  removeMentionFromBody,
} from "./commentComposer.utils";
import type { CommentComposerProps, MentionPopupState } from "./commentComposer.types";
import { useCommentImages } from "./useCommentImages";

export function CommentComposer({
  users,
  initialBody = "",
  initialMentions = [],
  submitting = false,
  placeholder = "Add an update, mention a teammate, or attach a screenshot...",
  submitLabel = "Comment",
  allowImages = false,
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const [body, setBody] = useState(initialBody);
  const [mentions, setMentions] = useState(initialMentions);
  const [popup, setPopup] = useState<MentionPopupState>(EMPTY_MENTION_POPUP);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageState = useCommentImages(allowImages);
  const filteredUsers = useMemo(
    () => filterMentionUsers(users, popup.query, popup.isOpen),
    [popup.isOpen, popup.query, users],
  );

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    if (popup.selectedIndex < filteredUsers.length) return;
    setPopup((current) => ({
      ...current,
      selectedIndex: Math.max(0, filteredUsers.length - 1),
    }));
  }, [filteredUsers.length, popup.selectedIndex]);

  const evaluateMentionPopup = useCallback((value: string, caret: number) => {
    const query = findMentionQuery(value, caret);
    setPopup(
      query
        ? {
            isOpen: true,
            query: query.query,
            triggerAt: query.triggerAt,
            selectedIndex: 0,
          }
        : EMPTY_MENTION_POPUP,
    );
  }, []);

  const insertMention = useCallback(
    (user: PmUser) => {
      const textarea = textareaRef.current;
      if (!textarea || popup.triggerAt < 0) return;
      const caret = textarea.selectionStart ?? body.length;
      const insertion = `@${user.display_name} `;
      const nextBody = `${body.slice(0, popup.triggerAt)}${insertion}${body.slice(caret)}`;
      const nextCaret = popup.triggerAt + insertion.length;
      setBody(nextBody);
      setMentions((current) =>
        current.includes(user.id) ? current : [...current, user.id],
      );
      setPopup(EMPTY_MENTION_POPUP);
      requestAnimationFrame(() => {
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = nextCaret;
      });
    },
    [body, popup.triggerAt],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (popup.isOpen && filteredUsers.length > 0) {
      const delta =
        event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      if (delta !== 0) {
        event.preventDefault();
        setPopup((current) => ({
          ...current,
          selectedIndex:
            (current.selectedIndex + delta + filteredUsers.length) %
            filteredUsers.length,
        }));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        insertMention(filteredUsers[popup.selectedIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setPopup(EMPTY_MENTION_POPUP);
        return;
      }
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void handleSubmit();
    }
  };

  const handleSubmit = useCallback(async () => {
    const trimmedBody = body.trim();
    const effectiveBody =
      trimmedBody || (imageState.images.length > 0 ? "Image attached" : "");
    if (!effectiveBody || submitting) return;
    await onSubmit(
      effectiveBody,
      pruneMentionIds(body, mentions, users),
      imageState.images.map((image) => image.file),
    );
    setBody("");
    setMentions([]);
    imageState.clearImages();
  }, [body, imageState, mentions, onSubmit, submitting, users]);

  return (
    <div className="relative">
      <CommentComposerInput
        allowImages={allowImages}
        body={body}
        fileInputRef={fileInputRef}
        imageError={imageState.error}
        images={imageState.images}
        mentionedUsers={mentions
          .map((id) => users.find((user) => user.id === id))
          .filter((user): user is PmUser => Boolean(user))}
        onAddFiles={imageState.addFiles}
        onBlur={() => window.setTimeout(() => setPopup(EMPTY_MENTION_POPUP), 120)}
        onChange={(value, caret) => {
          setBody(value);
          evaluateMentionPopup(value, caret);
        }}
        onKeyDown={handleKeyDown}
        onRemoveImage={imageState.removeImage}
        onRemoveMention={(user) => {
          setMentions((current) => current.filter((id) => id !== user.id));
          setBody((current) => removeMentionFromBody(current, user.display_name));
        }}
        placeholder={placeholder}
        textareaRef={textareaRef}
      />

      <CommentMentionPopup
        isOpen={popup.isOpen}
        onHover={(selectedIndex) =>
          setPopup((current) => ({ ...current, selectedIndex }))
        }
        onSelect={insertMention}
        selectedIndex={popup.selectedIndex}
        users={filteredUsers}
      />

      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] text-pm-text-muted">
          {allowImages
            ? "Paste, drop, or pick images. Cmd/Ctrl+Enter posts."
            : "Cmd/Ctrl+Enter saves."}
        </p>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-pm-text-muted hover:bg-pm-bg-hover"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg bg-pm-accent px-3 py-1.5 text-xs font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={
              (!body.trim() && imageState.images.length === 0) || submitting
            }
            onClick={() => void handleSubmit()}
          >
            <Send className="h-3.5 w-3.5" />
            {submitting ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
