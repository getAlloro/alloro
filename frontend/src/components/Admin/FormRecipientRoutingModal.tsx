import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Inbox, Mail, Search, X } from "lucide-react";
import type { WebsiteFormCatalogItem } from "../../api/websites";
import { FormRecipientRuleCard } from "./FormRecipientRuleCard";

export type FormRecipientRoutingModalProps = {
  isOpen: boolean;
  forms: WebsiteFormCatalogItem[];
  orgUsers: Array<{ name: string; email: string; role: string }>;
  defaultRecipients: string[];
  configuredCount: number;
  savingFormName: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (
    form: WebsiteFormCatalogItem,
    recipients: string[],
    isEnabled: boolean,
  ) => Promise<void>;
};

function formatLastSeen(value: string | null): string {
  if (!value) return "No submissions yet";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function usesCustomRoute(form: WebsiteFormCatalogItem): boolean {
  return Boolean(form.rule?.is_enabled && form.rule.recipients.length > 0);
}

export function FormRecipientRoutingModal({
  isOpen,
  forms,
  orgUsers,
  defaultRecipients,
  configuredCount,
  savingFormName,
  isSaving,
  onClose,
  onSave,
}: FormRecipientRoutingModalProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const visibleForms = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return forms;
    return forms.filter((form) =>
      form.form_name.toLowerCase().includes(query),
    );
  }, [forms, search]);

  useEffect(() => {
    if (!isOpen) return;
    const stillVisible = forms.some((form) => form.form_key === selectedKey);
    if (!stillVisible) setSelectedKey(forms[0]?.form_key ?? null);
  }, [forms, isOpen, selectedKey]);

  const selectedForm =
    visibleForms.find((form) => form.form_key === selectedKey) ??
    visibleForms[0] ??
    forms[0] ??
    null;

  useEffect(() => {
    if (selectedForm && selectedForm.form_key !== selectedKey) {
      setSelectedKey(selectedForm.form_key);
    }
  }, [selectedForm, selectedKey]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-alloro-navy/40 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="flex max-h-[86vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Mail className="h-5 w-5 text-gray-700" />
                  <h3 className="text-base font-semibold text-gray-900">
                    Per-Form Routing
                  </h3>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {configuredCount} custom · {forms.length} detected
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close routing modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-alloro-orange/15 bg-alloro-orange/5 px-5 py-3 text-sm text-gray-600">
              New forms are auto-detected from page markup or their first
              submission. They use default recipients until you save a custom
              route.
            </div>

            {forms.length === 0 ? (
              <div className="p-8 text-center">
                <Inbox className="mx-auto h-6 w-6 text-gray-400" />
                <p className="mt-2 text-sm font-medium text-gray-700">
                  No forms detected.
                </p>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="border-b border-gray-100 p-4 lg:border-b-0 lg:border-r">
                  <label className="relative block">
                    <span className="sr-only">Search forms</span>
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a form..."
                      className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm focus:border-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/20"
                    />
                  </label>
                  <div className="mt-3 max-h-[52vh] space-y-2 overflow-y-auto pr-1">
                    {visibleForms.map((form) => (
                      <button
                        key={form.form_key}
                        type="button"
                        onClick={() => setSelectedKey(form.form_key)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selectedForm?.form_key === form.form_key
                            ? "border-alloro-orange bg-alloro-orange/5"
                            : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate text-sm font-semibold text-gray-900">
                            {form.form_name}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            usesCustomRoute(form)
                              ? "bg-alloro-orange/10 text-alloro-orange"
                              : "bg-gray-100 text-gray-500"
                          }`}>
                            {usesCustomRoute(form) ? "Custom" : "Default"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-gray-500">
                          {form.submission_count} submissions ·{" "}
                          {formatLastSeen(form.last_seen)}
                        </p>
                      </button>
                    ))}
                  </div>
                </aside>

                <main className="min-h-0 overflow-y-auto p-5">
                  {selectedForm && (
                    <FormRecipientRuleCard
                      form={selectedForm}
                      orgUsers={orgUsers}
                      defaultRecipients={defaultRecipients}
                      isSaving={
                        isSaving && savingFormName === selectedForm.form_name
                      }
                      onSave={onSave}
                    />
                  )}
                </main>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
