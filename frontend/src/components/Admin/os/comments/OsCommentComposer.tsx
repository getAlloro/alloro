import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";

/**
 * Comment composer (plans/07042026-alloro-os-admin-port P7 T2) — a small
 * markdown textarea shared by the root form, the reply form, and the inline
 * edit form. Cmd/Ctrl+Enter submits (D13); the primary action is the only
 * place the #D66853 accent appears in the thread. Empty/whitespace bodies are
 * blocked client-side, but the server validates the boundary too (§5.4/§11.2).
 */

export function OsCommentComposer({
  onSubmit,
  isSubmitting,
  initialValue = "",
  placeholder = "Add a comment…",
  submitLabel = "Comment",
  autoFocus = false,
  onCancel,
}: {
  onSubmit: (body: string) => void;
  isSubmitting: boolean;
  initialValue?: string;
  placeholder?: string;
  submitLabel?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0 && !isSubmitting;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
    setValue("");
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      submit();
    }
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="mt-2">
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={submitLabel}
        rows={2}
        autoFocus={autoFocus}
        className="w-full resize-y rounded-lg border border-line-medium bg-alloro-surface px-2.5 py-2 font-display text-[14px] text-alloro-textDark placeholder:text-gray-400 focus:border-alloro-orange focus:outline-none"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] text-gray-300">
          ⌘⏎ to send
        </span>
        <div className="flex items-center gap-1.5">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-2 py-1 font-mono text-[11px] text-gray-500 transition-colors duration-150 hover:text-gray-800"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="inline-flex items-center gap-1 rounded-md bg-alloro-orange px-2.5 py-1 font-sans text-[12px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Send className="h-3 w-3" strokeWidth={2} />
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
