import { useState } from "react";
import { AlertTriangle, Loader2, Settings2, SlidersHorizontal } from "lucide-react";
import { toast } from "react-hot-toast";
import type { WebsiteFormCatalogItem } from "../../api/websites";
import {
  type FetchFormRecipientCatalogFn,
  type FetchWebsiteRecipientsFn,
  type UpdateFormRecipientRuleFn,
  useAdminWebsiteRecipients,
  useUpdateWebsiteFormRecipientRule,
  useWebsiteFormRecipientCatalog,
} from "../../hooks/queries/useWebsiteFormRecipientRouting";
import { FormRecipientRoutingModal } from "./FormRecipientRoutingModal";

export type FormRecipientRoutingPanelProps = {
  projectId: string;
  fetchCatalogFn?: FetchFormRecipientCatalogFn;
  fetchRecipientsFn?: FetchWebsiteRecipientsFn;
  updateRuleFn?: UpdateFormRecipientRuleFn;
  queryScope?: "admin" | "client";
};

export function FormRecipientRoutingPanel({
  projectId,
  fetchCatalogFn,
  fetchRecipientsFn,
  updateRuleFn,
  queryScope = "admin",
}: FormRecipientRoutingPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const catalogQueryKey = [queryScope, "website", projectId, "form-catalog"];
  const recipientsQueryKey = [queryScope, "website", projectId, "recipients"];
  const catalogQuery = useWebsiteFormRecipientCatalog(projectId, {
    fetchCatalogFn,
    queryKey: catalogQueryKey,
  });
  const recipientsQuery = useAdminWebsiteRecipients(projectId, {
    fetchRecipientsFn,
    queryKey: recipientsQueryKey,
  });
  const updateRule = useUpdateWebsiteFormRecipientRule(projectId, {
    updateRuleFn,
    catalogQueryKey,
  });
  const forms = catalogQuery.data ?? [];
  const defaultRecipients = recipientsQuery.data?.recipients ?? [];
  const orgUsers = recipientsQuery.data?.orgUsers ?? [];
  const savingFormName = updateRule.variables?.formName ?? null;
  const configuredCount = forms.filter(
    (form) => form.rule?.is_enabled && (form.rule?.recipients.length ?? 0) > 0,
  ).length;

  const handleSave = async (
    form: WebsiteFormCatalogItem,
    recipients: string[],
    isEnabled: boolean,
  ) => {
    try {
      await updateRule.mutateAsync({
        formName: form.form_name,
        recipients,
        isEnabled,
      });
      toast.success("Form recipients updated");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to update form recipients",
      );
      throw error;
    }
  };

  if (catalogQuery.isLoading || recipientsQuery.isLoading) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading form routing...
        </div>
      </section>
    );
  }

  if (catalogQuery.isError) {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Failed to load form routing.</span>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-alloro-orange/10 text-alloro-orange">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900">
                Per-Form Routing
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                {configuredCount} configured · {forms.length} detected
              </p>
              <p className="mt-1 text-xs text-gray-400">
                New forms use default recipients until customized.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-alloro-orange px-4 py-2 text-sm font-medium text-white transition hover:bg-alloro-orange/90"
            title="Open per-form recipient routing"
          >
            <Settings2 className="h-4 w-4" />
            Manage Routing
          </button>
        </div>
      </section>

      <FormRecipientRoutingModal
        isOpen={isOpen}
        forms={forms}
        orgUsers={orgUsers}
        defaultRecipients={defaultRecipients}
        configuredCount={configuredCount}
        savingFormName={savingFormName}
        isSaving={updateRule.isPending}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
      />
    </>
  );
}
