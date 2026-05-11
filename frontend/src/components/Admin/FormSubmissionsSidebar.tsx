import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Pencil,
  Settings,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { WebsiteFormCatalogItem } from "../../api/websites";

export type FormSubmissionsSidebarProps = {
  forms: WebsiteFormCatalogItem[];
  selectedFormKey: string | null;
  isLoading: boolean;
  onSelectForm: (formKey: string) => void;
  onOpenSettings: () => void;
  onRenameForm: (formKey: string, label: string) => Promise<void>;
  onMoveForm: (formKey: string, direction: "up" | "down") => Promise<void>;
  isUpdatingPreferences: boolean;
};

function formatLastSeen(value: string | null): string {
  if (!value) return "No submissions yet";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function hasCustomRoute(form: WebsiteFormCatalogItem): boolean {
  return Boolean(form.rule?.is_enabled && form.rule.recipients.length > 0);
}

function getFormLabel(form: WebsiteFormCatalogItem): string {
  return form.display_label || form.form_name;
}

export function FormSubmissionsSidebar({
  forms,
  selectedFormKey,
  isLoading,
  onSelectForm,
  onOpenSettings,
  onRenameForm,
  onMoveForm,
  isUpdatingPreferences,
}: FormSubmissionsSidebarProps) {
  const [editingFormKey, setEditingFormKey] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState("");

  const startEditing = (form: WebsiteFormCatalogItem) => {
    setEditingFormKey(form.form_key);
    setDraftLabel(getFormLabel(form));
  };

  const stopEditing = () => {
    setEditingFormKey(null);
    setDraftLabel("");
  };

  const saveLabel = async (form: WebsiteFormCatalogItem) => {
    await onRenameForm(form.form_key, draftLabel);
    stopEditing();
  };

  return (
    <aside className="flex min-h-[620px] flex-col border-b border-gray-100 bg-gray-50/60 lg:border-b-0 lg:border-r">
      <div className="border-b border-gray-100 p-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-alloro-orange" />
          <h3 className="text-sm font-semibold text-gray-900">Forms</h3>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {forms.length} detected
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-lg bg-white"
              />
            ))}
          </div>
        ) : forms.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 bg-white p-5 text-sm text-gray-500">
            No forms detected yet.
          </div>
        ) : (
          <div className="space-y-2">
            {forms.map((form, index) => {
              const isActive = selectedFormKey === form.form_key;
              const isEditing = editingFormKey === form.form_key;
              return (
                <div
                  key={form.form_key}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    isActive
                      ? "border-alloro-orange bg-white shadow-sm"
                      : "border-gray-200 bg-white hover:border-gray-300"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {isEditing ? (
                      <form
                        className="min-w-0 flex-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void saveLabel(form);
                        }}
                      >
                        <label className="sr-only" htmlFor={`form-label-${form.form_key}`}>
                          Form label
                        </label>
                        <input
                          id={`form-label-${form.form_key}`}
                          value={draftLabel}
                          onChange={(event) => setDraftLabel(event.target.value)}
                          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm font-medium text-gray-900 outline-none transition focus:border-alloro-orange focus:ring-2 focus:ring-alloro-orange/20"
                          placeholder={form.form_name}
                          autoFocus
                          disabled={isUpdatingPreferences}
                        />
                        <p className="mt-1 truncate text-[10px] text-gray-400">
                          {form.form_name}
                        </p>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectForm(form.form_key)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          {form.unread_count > 0 && (
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full bg-alloro-orange"
                              title={`${form.unread_count} unread`}
                            />
                          )}
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {getFormLabel(form)}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[10px] text-gray-400">
                          {form.form_name}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          {form.submission_count} submissions ·{" "}
                          {formatLastSeen(form.last_seen)}
                        </p>
                      </button>
                    )}

                    <div className="flex shrink-0 items-center gap-1">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveLabel(form)}
                            disabled={isUpdatingPreferences}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-alloro-orange/10 hover:text-alloro-orange disabled:cursor-not-allowed disabled:opacity-50"
                            title="Save label"
                            aria-label="Save label"
                          >
                            {isUpdatingPreferences ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={stopEditing}
                            disabled={isUpdatingPreferences}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Cancel"
                            aria-label="Cancel label edit"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => void onMoveForm(form.form_key, "up")}
                            disabled={index === 0 || isUpdatingPreferences}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                            title="Move form up"
                            aria-label="Move form up"
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void onMoveForm(form.form_key, "down")}
                            disabled={
                              index === forms.length - 1 ||
                              isUpdatingPreferences
                            }
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-30"
                            title="Move form down"
                            aria-label="Move form down"
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => startEditing(form)}
                            disabled={isUpdatingPreferences}
                            className="rounded-md p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Rename form label"
                            aria-label="Rename form label"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end">
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        hasCustomRoute(form)
                          ? "bg-alloro-orange/10 text-alloro-orange"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {hasCustomRoute(form) ? "Custom" : "Default"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-gray-100 p-3">
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
          title="Open form recipient settings"
        >
          <Settings className="h-4 w-4" />
          Settings
        </button>
        <p className="mt-2 text-center text-[11px] text-gray-400">
          Defaults are fallback recipients for new forms.
        </p>
      </div>
    </aside>
  );
}
