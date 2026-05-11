import { Mail, X } from "lucide-react";

export type FormRecipientChipsProps = {
  recipients: string[];
  isSaving: boolean;
  onRemove: (email: string) => void;
};

export function FormRecipientChips({
  recipients,
  isSaving,
  onRemove,
}: FormRecipientChipsProps) {
  if (recipients.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Mail className="h-4 w-4" />
        Uses default recipients.
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {recipients.map((email) => (
        <span
          key={email}
          className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-sm text-gray-700"
        >
          <span className="truncate">{email}</span>
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
      ))}
    </div>
  );
}
