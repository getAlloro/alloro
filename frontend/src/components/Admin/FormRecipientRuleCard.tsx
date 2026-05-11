import { useState } from "react";
import { Loader2, Plus, Power, Users } from "lucide-react";
import { toast } from "react-hot-toast";
import type { WebsiteFormCatalogItem } from "../../api/websites";
import { FormRecipientChips } from "./FormRecipientChips";
import { FormRecipientSourcePills } from "./FormRecipientSourcePills";

export type FormRecipientRuleCardProps = {
  form: WebsiteFormCatalogItem;
  orgUsers: Array<{ name: string; email: string; role: string }>;
  isSaving: boolean;
  onSave: (
    form: WebsiteFormCatalogItem,
    recipients: string[],
    isEnabled: boolean,
  ) => Promise<void>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function formatLastSeen(value: string | null): string {
  if (!value) return "No submissions yet";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function FormRecipientRuleCard({
  form,
  orgUsers,
  isSaving,
  onSave,
}: FormRecipientRuleCardProps) {
  const [customEmail, setCustomEmail] = useState("");
  const recipients = form.rule?.recipients ?? [];
  const isEnabled = form.rule?.is_enabled ?? true;
  const availableOrgUsers = orgUsers.filter(
    (user) => !recipients.includes(normalizeEmail(user.email)),
  );

  const save = (updatedRecipients: string[], nextEnabled = isEnabled) =>
    onSave(form, updatedRecipients, nextEnabled);

  const addEmail = (email: string) => {
    const normalized = normalizeEmail(email);
    if (!normalized) return;
    if (!EMAIL_REGEX.test(normalized)) {
      toast.error("Enter a valid email");
      return;
    }
    if (recipients.includes(normalized)) {
      toast.error("Already added");
      return;
    }
    setCustomEmail("");
    save([...recipients, normalized], true);
  };

  const removeEmail = (email: string) => {
    save(recipients.filter((recipient) => recipient !== email));
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="truncate text-sm font-semibold text-gray-900">
              {form.form_name}
            </h4>
            <FormRecipientSourcePills form={form} />
            {!isEnabled && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium text-gray-500">
                Disabled
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-gray-500">
            {form.submission_count} submission
            {form.submission_count === 1 ? "" : "s"} · {formatLastSeen(form.last_seen)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => save(recipients, !isEnabled)}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 transition hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Power className="h-3.5 w-3.5" />
          )}
          {isEnabled ? "Disable override" : "Enable override"}
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <FormRecipientChips
          recipients={recipients}
          isSaving={isSaving}
          onRemove={removeEmail}
        />

        {availableOrgUsers.length > 0 && (
          <div>
            <p className="mb-2 flex items-center gap-1 text-xs text-gray-400">
              <Users className="h-3 w-3" /> Organization members
            </p>
            <div className="flex flex-wrap gap-2">
              {availableOrgUsers.map((user) => (
                <button
                  key={`${form.form_key}-${user.email}`}
                  type="button"
                  onClick={() => addEmail(user.email)}
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

        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor={`recipient-${form.form_key}`}>
            Add recipient for {form.form_name}
          </label>
          <input
            id={`recipient-${form.form_key}`}
            type="email"
            placeholder="Add custom email..."
            value={customEmail}
            onChange={(event) => setCustomEmail(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addEmail(customEmail);
              }
            }}
            className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
          />
          <button
            type="button"
            onClick={() => addEmail(customEmail)}
            disabled={!customEmail.trim() || isSaving}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-alloro-orange/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
