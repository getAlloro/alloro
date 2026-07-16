import type { RefObject } from "react";
import { AtSign, ImagePlus } from "lucide-react";
import type { PmUser } from "../../types/pm";
import { CommentComposerMedia } from "./CommentComposerMedia";
import type { SelectedCommentImage } from "./commentComposer.types";

export type CommentComposerInputProps = {
  allowImages: boolean;
  body: string;
  placeholder: string;
  mentionedUsers: PmUser[];
  images: SelectedCommentImage[];
  imageError: string | null;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onAddFiles: (files: File[]) => void;
  onBlur: () => void;
  onChange: (value: string, caret: number) => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onRemoveMention: (user: PmUser) => void;
  onRemoveImage: (id: string) => void;
};

export function CommentComposerInput({
  allowImages,
  body,
  placeholder,
  mentionedUsers,
  images,
  imageError,
  textareaRef,
  fileInputRef,
  onAddFiles,
  onBlur,
  onChange,
  onKeyDown,
  onRemoveMention,
  onRemoveImage,
}: CommentComposerInputProps) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-pm-border bg-pm-bg-primary transition-colors focus-within:ring-1 focus-within:ring-pm-accent/50"
      onDragOver={(event) => allowImages && event.preventDefault()}
      onDrop={(event) => {
        if (!allowImages) return;
        event.preventDefault();
        onAddFiles(Array.from(event.dataTransfer.files));
      }}
    >
      <div className="flex items-center justify-between gap-2 border-b border-pm-border-subtle px-3 py-2">
        <span className="inline-flex items-center gap-2 text-[11px] text-pm-text-muted">
          <AtSign className="h-3.5 w-3.5" />
          Type @ to mention an admin
        </span>
        {allowImages && (
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-pm-text-secondary transition-colors hover:bg-pm-bg-hover"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Image
          </button>
        )}
      </div>

      <textarea
        ref={textareaRef}
        aria-label="Comment"
        className="block w-full resize-y bg-transparent px-3 py-3 text-sm text-pm-text-primary placeholder:text-pm-text-muted focus:outline-none"
        onBlur={onBlur}
        onChange={(event) =>
          onChange(
            event.target.value,
            event.target.selectionStart ?? event.target.value.length,
          )
        }
        onClick={(event) =>
          onChange(
            event.currentTarget.value,
            event.currentTarget.selectionStart ?? event.currentTarget.value.length,
          )
        }
        onKeyDown={onKeyDown}
        onPaste={(event) => {
          if (!allowImages) return;
          const files = Array.from(event.clipboardData.files);
          if (!files.some((file) => file.type.startsWith("image/"))) return;
          event.preventDefault();
          onAddFiles(files);
        }}
        placeholder={placeholder}
        rows={4}
        value={body}
      />

      <CommentComposerMedia
        imageError={imageError}
        images={images}
        mentionedUsers={mentionedUsers}
        onRemoveImage={onRemoveImage}
        onRemoveMention={onRemoveMention}
      />

      <input
        ref={fileInputRef}
        aria-label="Choose comment images"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        multiple
        onChange={(event) => {
          onAddFiles(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
        type="file"
      />
    </div>
  );
}
