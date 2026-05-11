import { FormRecipientRuleModel } from "../models/website-builder/FormRecipientRuleModel";
import { ProjectModel } from "../models/website-builder/ProjectModel";
import { normalizeFormDisplayName, normalizeFormKey } from "../utils/formName";
import { validateRecipientList } from "./recipientSettingsService";

interface FormRecipientRuleServiceError extends Error {
  statusCode: number;
  code: string;
}

function serviceError(
  statusCode: number,
  code: string,
  message: string,
): FormRecipientRuleServiceError {
  const error = new Error(message) as FormRecipientRuleServiceError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

export async function upsertFormRecipientRule(params: {
  projectId: string;
  formName: unknown;
  recipients: unknown;
  isEnabled?: unknown;
}) {
  const project = await ProjectModel.findById(params.projectId);
  if (!project) {
    throw serviceError(404, "NOT_FOUND", "Project not found");
  }

  const formName = normalizeFormDisplayName(params.formName);
  if (!formName) {
    throw serviceError(400, "VALIDATION_ERROR", "formName is required");
  }

  if (
    params.isEnabled !== undefined &&
    typeof params.isEnabled !== "boolean"
  ) {
    throw serviceError(400, "VALIDATION_ERROR", "isEnabled must be boolean");
  }

  const recipients = validateRecipientList(params.recipients);
  const isEnabled =
    typeof params.isEnabled === "boolean" ? params.isEnabled : true;

  return FormRecipientRuleModel.upsertForForm({
    project_id: params.projectId,
    form_name: formName,
    form_key: normalizeFormKey(formName),
    recipients,
    is_enabled: isEnabled,
  });
}
