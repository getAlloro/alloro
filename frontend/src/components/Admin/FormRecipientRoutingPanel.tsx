import { AlertTriangle, Inbox, Loader2, Mail } from "lucide-react";
import { toast } from "react-hot-toast";
import type { WebsiteFormCatalogItem } from "../../api/websites";
import {
  useAdminWebsiteRecipients,
  useUpdateWebsiteFormRecipientRule,
  useWebsiteFormRecipientCatalog,
} from "../../hooks/queries/useWebsiteFormRecipientRouting";
import { FormRecipientRuleCard } from "./FormRecipientRuleCard";

export type FormRecipientRoutingPanelProps = {
  projectId: string;
};

export function FormRecipientRoutingPanel({
  projectId,
}: FormRecipientRoutingPanelProps) {
  const catalogQuery = useWebsiteFormRecipientCatalog(projectId);
  const recipientsQuery = useAdminWebsiteRecipients(projectId);
  const updateRule = useUpdateWebsiteFormRecipientRule(projectId);
  const forms = catalogQuery.data ?? [];
  const orgUsers = recipientsQuery.data?.orgUsers ?? [];
  const savingFormName = updateRule.variables?.formName ?? null;

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
    <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-gray-700" />
            <h3 className="text-lg font-semibold text-gray-900">
              Per-Form Routing
            </h3>
          </div>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-200">
          {forms.length} detected
        </span>
      </div>

      {forms.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-white p-6 text-center">
          <Inbox className="mx-auto h-6 w-6 text-gray-400" />
          <p className="mt-2 text-sm font-medium text-gray-700">
            No forms detected.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {forms.map((form) => (
            <FormRecipientRuleCard
              key={form.form_key}
              form={form}
              orgUsers={orgUsers}
              isSaving={
                updateRule.isPending && savingFormName === form.form_name
              }
              onSave={handleSave}
            />
          ))}
        </div>
      )}
    </section>
  );
}
