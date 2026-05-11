import { Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "react-hot-toast";
import type { WebsiteFormCatalogItem } from "../../api/websites";
import {
  type FetchWebsiteRecipientsFn,
  type UpdateFormRecipientRuleFn,
  useAdminWebsiteRecipients,
  useUpdateWebsiteFormRecipientRule,
} from "../../hooks/queries/useWebsiteFormRecipientRouting";
import { FormRecipientRuleCard } from "./FormRecipientRuleCard";

export type SelectedFormRoutingSettingsProps = {
  projectId: string;
  form: WebsiteFormCatalogItem | null;
  fetchRecipientsFn?: FetchWebsiteRecipientsFn;
  updateRuleFn?: UpdateFormRecipientRuleFn;
  queryScope?: "admin" | "client";
  catalogQueryKey: readonly unknown[];
};

export function SelectedFormRoutingSettings({
  projectId,
  form,
  fetchRecipientsFn,
  updateRuleFn,
  queryScope = "admin",
  catalogQueryKey,
}: SelectedFormRoutingSettingsProps) {
  const recipientsQuery = useAdminWebsiteRecipients(projectId, {
    fetchRecipientsFn,
    queryKey: [queryScope, "website", projectId, "recipients"],
  });
  const updateRule = useUpdateWebsiteFormRecipientRule(projectId, {
    updateRuleFn,
    catalogQueryKey,
  });

  const handleSave = async (
    selectedForm: WebsiteFormCatalogItem,
    recipients: string[],
    isEnabled: boolean,
  ) => {
    try {
      await updateRule.mutateAsync({
        formName: selectedForm.form_name,
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

  if (!form) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        Select a form to configure routing.
      </div>
    );
  }

  if (recipientsQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 p-5 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading routing settings...
      </div>
    );
  }

  return (
    <div className="p-5">
      <div className="mb-4 flex items-start gap-3 rounded-lg bg-alloro-orange/5 p-4 text-sm text-gray-600">
        <SlidersHorizontal className="mt-0.5 h-4 w-4 text-alloro-orange" />
        <p>
          Configure routing for this form only. New and unconfigured forms use
          the default recipients from global settings.
        </p>
      </div>
      <FormRecipientRuleCard
        form={form}
        orgUsers={recipientsQuery.data?.orgUsers ?? []}
        defaultRecipients={recipientsQuery.data?.recipients ?? []}
        isSaving={
          updateRule.isPending && updateRule.variables?.formName === form.form_name
        }
        onSave={handleSave}
      />
    </div>
  );
}
