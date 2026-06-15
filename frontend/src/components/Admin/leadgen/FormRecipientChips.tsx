import { Loader2, Mail, X } from "lucide-react";

export type FormRecipientChipsProps = {
  recipients: string[];
  isSaving: boolean;
  pendingAddEmail?: string | null;
  pendingRemoveEmail?: string | null;
  emptyLabel?: string;
  onRemove: (email: string) => void;
};

export function FormRecipientChips({
  recipients,
  isSaving,
  pendingAddEmail,
  pendingRemoveEmail,
  emptyLabel = "Uses default recipients.",
  onRemove,
}: FormRecipientChipsProps) {
  if (recipients.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Mail className="h-4 w-4" />
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {recipients.map((email) => {
        const isAdding = pendingAddEmail === email;
        const isRemoving = pendingRemoveEmail === email;
        const isPending = isAdding || isRemoving;

        return (
          <span
            key={email}
            className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition ${
              isRemoving
                ? "bg-red-50 text-red-600 ring-1 ring-red-100"
                : isAdding
                  ? "bg-alloro-orange/10 text-alloro-orange ring-1 ring-alloro-orange/20"
                  : "bg-gray-100 text-gray-700"
            }`}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span className="truncate">{email}</span>
            {isAdding && (
              <span className="text-xs font-medium">Adding...</span>
            )}
            {isRemoving && (
              <span className="text-xs font-medium">Removing...</span>
            )}
            <button
              type="button"
              aria-label={`Remove ${email}`}
              onClick={() => onRemove(email)}
              disabled={isSaving}
              className="shrink-0 text-gray-400 transition hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
