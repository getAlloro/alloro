import { FormRecipientRuleModel } from "../models/website-builder/FormRecipientRuleModel";
import {
  normalizeRecipients,
  resolveRecipients,
  type RecipientSource,
} from "./recipientSettingsService";
import { NEWSLETTER_FORM_NAME, normalizeFormKey } from "../utils/formName";

export type WebsiteFormRecipientSource = "form_rule" | RecipientSource;

export interface WebsiteFormRecipientResolution {
  recipients: string[];
  source: WebsiteFormRecipientSource;
  formKey: string;
  ruleId: string | null;
}

export async function resolveWebsiteFormRecipients(params: {
  projectId: string;
  formName: string;
  organizationId?: number | null;
  legacyProjectRecipients?: unknown;
}): Promise<WebsiteFormRecipientResolution> {
  const formKey = normalizeFormKey(params.formName);

  if (params.formName !== NEWSLETTER_FORM_NAME) {
    const rule = await FormRecipientRuleModel.findByProjectAndFormKey(
      params.projectId,
      formKey,
    );
    const ruleRecipients = normalizeRecipients(rule?.recipients ?? []);

    if (rule?.is_enabled && ruleRecipients.length > 0) {
      return {
        recipients: ruleRecipients,
        source: "form_rule",
        formKey,
        ruleId: rule.id,
      };
    }
  }

  const fallback = await resolveRecipients({
    organizationId: params.organizationId,
    channel: "website_form",
    legacyProjectRecipients: params.legacyProjectRecipients,
  });

  return {
    recipients: fallback.recipients,
    source: fallback.source,
    formKey,
    ruleId: null,
  };
}
