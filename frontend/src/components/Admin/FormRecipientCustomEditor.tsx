import { Loader2, Plus, Users } from "lucide-react";
import { FormRecipientChips } from "./FormRecipientChips";

export type FormRecipientCustomEditorProps = {
  formKey: string;
  formName: string;
  recipients: string[];
  availableOrgUsers: Array<{ name: string; email: string; role: string }>;
  customEmail: string;
  isSaving: boolean;
  pendingAddEmail?: string | null;
  pendingRemoveEmail?: string | null;
  isManualAddPending: boolean;
  onCustomEmailChange: (value: string) => void;
  onAddEmail: (email: string, source?: "member" | "manual") => void;
  onRemoveEmail: (email: string) => void;
};

export function FormRecipientCustomEditor({
  formKey,
  formName,
  recipients,
  availableOrgUsers,
  customEmail,
  isSaving,
  pendingAddEmail,
  pendingRemoveEmail,
  isManualAddPending,
  onCustomEmailChange,
  onAddEmail,
  onRemoveEmail,
}: FormRecipientCustomEditorProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-medium text-gray-500">
          Custom recipients for this form
        </p>
        <FormRecipientChips
          recipients={recipients}
          isSaving={isSaving}
          pendingAddEmail={pendingAddEmail}
          pendingRemoveEmail={pendingRemoveEmail}
          emptyLabel="No custom recipients yet. Add a member or email below."
          onRemove={onRemoveEmail}
        />
      </div>

      {availableOrgUsers.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1 text-xs text-gray-400">
            <Users className="h-3 w-3" /> Organization members
          </p>
          <div className="flex flex-wrap gap-2">
            {availableOrgUsers.map((user) => (
              <button
                key={`${formKey}-${user.email}`}
                type="button"
                onClick={() => onAddEmail(user.email, "member")}
                disabled={isSaving}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 transition hover:border-gray-400 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-3 w-3 shrink-0" />
                <span className="truncate">
                  {user.name} ({user.email})
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label className="sr-only" htmlFor={`recipient-${formKey}`}>
          Add recipient for {formName}
        </label>
        <input
          id={`recipient-${formKey}`}
          type="email"
          placeholder="Add custom email..."
          value={customEmail}
          onChange={(event) => onCustomEmailChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddEmail(customEmail);
            }
          }}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
        />
        <button
          type="button"
          onClick={() => onAddEmail(customEmail)}
          disabled={!customEmail.trim() || isSaving}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isManualAddPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          Add
        </button>
      </div>
    </div>
  );
}
