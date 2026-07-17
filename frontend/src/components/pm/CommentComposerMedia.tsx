import { X } from "lucide-react";
import type { PmUser } from "../../types/pm";
import type { SelectedCommentImage } from "./commentComposer.types";

export type CommentComposerMediaProps = {
  mentionedUsers: PmUser[];
  images: SelectedCommentImage[];
  imageError: string | null;
  onRemoveMention: (user: PmUser) => void;
  onRemoveImage: (id: string) => void;
};

export function CommentComposerMedia({
  mentionedUsers,
  images,
  imageError,
  onRemoveMention,
  onRemoveImage,
}: CommentComposerMediaProps) {
  if (mentionedUsers.length === 0 && images.length === 0 && !imageError) {
    return null;
  }

  return (
    <div className="space-y-2 px-3 pb-3">
      {mentionedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {mentionedUsers.map((user) => (
            <button
              key={user.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-full border border-pm-border bg-pm-bg-secondary px-2 py-0.5 text-[11px] text-pm-accent"
              onClick={() => onRemoveMention(user)}
            >
              @{user.display_name}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {images.map((image) => (
            <div
              key={image.id}
              className="group relative overflow-hidden rounded-md border border-pm-border"
            >
              <img
                src={image.previewUrl}
                alt={image.file.name}
                className="aspect-[4/3] w-full object-cover"
              />
              <button
                type="button"
                aria-label={`Remove ${image.file.name}`}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white"
                onClick={() => onRemoveImage(image.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {imageError && <p className="text-[11px] text-pm-danger">{imageError}</p>}
    </div>
  );
}
