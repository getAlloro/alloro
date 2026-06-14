import {
  FormCatalogPreferenceModel,
  type FormCatalogPreferenceUpsert,
} from "../models/website-builder/FormCatalogPreferenceModel";
import { ProjectModel } from "../models/website-builder/ProjectModel";
import { normalizeFormDisplayName, normalizeFormKey } from "../utils/formName";

interface FormCatalogPreferenceServiceError extends Error {
  statusCode: number;
  code: string;
}

type PreferenceInput = {
  formName?: unknown;
  displayLabel?: unknown;
  sortOrder?: unknown;
};

function serviceError(
  statusCode: number,
  code: string,
  message: string,
): FormCatalogPreferenceServiceError {
  const error = new Error(message) as FormCatalogPreferenceServiceError;
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeDisplayLabel(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw serviceError(400, "VALIDATION_ERROR", "displayLabel must be text");
  }

  const label = value.trim();
  if (!label) return null;
  if (label.length > 80) {
    throw serviceError(
      400,
      "VALIDATION_ERROR",
      "displayLabel must be 80 characters or fewer",
    );
  }

  return label;
}

function normalizeSortOrder(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0
  ) {
    throw serviceError(
      400,
      "VALIDATION_ERROR",
      "sortOrder must be a non-negative integer",
    );
  }

  return value;
}

export async function upsertFormCatalogPreferences(params: {
  projectId: string;
  preferences: unknown;
}) {
  const project = await ProjectModel.findById(params.projectId);
  if (!project) {
    throw serviceError(404, "NOT_FOUND", "Project not found");
  }

  if (!Array.isArray(params.preferences)) {
    throw serviceError(400, "VALIDATION_ERROR", "preferences must be an array");
  }

  const seenKeys = new Set<string>();
  const preferences: FormCatalogPreferenceUpsert[] = params.preferences.map(
    (item: PreferenceInput, index) => {
      const formName = normalizeFormDisplayName(item?.formName);
      if (!formName) {
        throw serviceError(400, "VALIDATION_ERROR", "formName is required");
      }

      const formKey = normalizeFormKey(formName);
      if (seenKeys.has(formKey)) {
        throw serviceError(
          400,
          "VALIDATION_ERROR",
          `Duplicate form preference for ${formName}`,
        );
      }
      seenKeys.add(formKey);

      const displayLabel = normalizeDisplayLabel(item.displayLabel);

      return {
        project_id: params.projectId,
        form_name: formName,
        form_key: formKey,
        display_label: displayLabel === formName ? null : displayLabel,
        sort_order: normalizeSortOrder(item.sortOrder, index),
      };
    },
  );

  return FormCatalogPreferenceModel.transaction((trx) =>
    FormCatalogPreferenceModel.upsertMany(preferences, trx),
  );
}
