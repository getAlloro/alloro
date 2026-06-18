/**
 * Types for FormSubmissionsTab.
 *
 * Moved verbatim out of FormSubmissionsTab.tsx so the component stays under
 * the file-size budget. No behavior change.
 */

import type { ReactNode } from "react";
import type {
  deleteFormSubmission,
  toggleFormSubmissionRead,
  FormSubmissionsResponse,
} from "../../../api/websites";
import type {
  FetchFormRecipientCatalogFn,
  UpdateFormCatalogPreferencesFn,
  FetchWebsiteRecipientsFn,
  UpdateFormRecipientRuleFn,
} from "../../../hooks/queries/useWebsiteFormRecipientRouting";

export interface Props {
  projectId: string;
  isAdmin?: boolean;
  fetchSubmissionsFn?: FetchSubmissionsFn;
  fetchFormCatalogFn?: FetchFormRecipientCatalogFn;
  fetchRecipientsFn?: FetchWebsiteRecipientsFn;
  updateFormRecipientRuleFn?: UpdateFormRecipientRuleFn;
  updateFormPreferencesFn?: UpdateFormCatalogPreferencesFn;
  markAllReadFn?: MarkAllReadFn;
  formCatalogQueryScope?: "admin" | "client";
  toggleReadFn?: typeof toggleFormSubmissionRead;
  deleteSubmissionFn?: typeof deleteFormSubmission;
  onExport?: () => void;
  settingsContent?: ReactNode;
}

export type FormSubmissionsResult = FormSubmissionsResponse & {
  error?: string;
  errorMessage?: string;
};

export type FetchSubmissionsFn = (
  projectId: string,
  page: number,
  limit: number,
  filter?: string,
  formName?: string,
) => Promise<FormSubmissionsResult>;

export type MarkAllReadFn = (
  projectId: string,
  formName?: string,
) => Promise<unknown>;

export type TabFilter = "all" | "verified" | "flagged";
