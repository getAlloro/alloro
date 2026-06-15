import { OrganizationModel } from "../../../models/OrganizationModel";
import {
  ProjectModel,
  type IProject,
} from "../../../models/website-builder/ProjectModel";
import logger from "../../../lib/logger";

const DEFAULT_FORM_SENDER_NAME = "Alloro Forms";
const DEFAULT_FORM_HEADER_COLOR = "#0e8988";
const ALLORO_LOGO_URL = "https://app.getalloro.com/logo.png";

type FormSubmissionEmailProject = Pick<
  IProject,
  "organization_id" | "accent_color" | "primary_color"
>;

export interface FormSubmissionEmailContext {
  fromName: string;
  headerColor: string;
  logoUrl: string;
}

export async function resolveFormSubmissionEmailContext(
  project: FormSubmissionEmailProject | null | undefined,
): Promise<FormSubmissionEmailContext> {
  let organizationName: string | null = null;

  try {
    organizationName = await resolveOrganizationName(project?.organization_id);
  } catch (error) {
    logger.error({ err: error }, "[Form Submission] Failed to resolve organization name for email context:");
  }

  return {
    fromName: formatSenderName(organizationName),
    headerColor:
      project?.accent_color || project?.primary_color || DEFAULT_FORM_HEADER_COLOR,
    logoUrl: ALLORO_LOGO_URL,
  };
}

export async function resolveFormSubmissionEmailContextForProjectId(
  projectId: string,
): Promise<FormSubmissionEmailContext> {
  try {
    const project = await ProjectModel.findById(projectId);
    return resolveFormSubmissionEmailContext(project);
  } catch (error) {
    logger.error({ err: error }, "[Form Submission] Failed to resolve project for email context:");
    return resolveFormSubmissionEmailContext(null);
  }
}

async function resolveOrganizationName(
  organizationId: number | null | undefined,
): Promise<string | null> {
  if (!organizationId) return null;

  const organization = await OrganizationModel.findById(organizationId);
  return sanitizeSenderNamePart(organization?.name);
}

function formatSenderName(organizationName: string | null): string {
  if (!organizationName) return DEFAULT_FORM_SENDER_NAME;
  return `[${organizationName}] ${DEFAULT_FORM_SENDER_NAME}`;
}

function sanitizeSenderNamePart(value: string | null | undefined): string | null {
  const sanitized = value?.replace(/[\r\n]+/g, " ").trim();
  return sanitized || null;
}
