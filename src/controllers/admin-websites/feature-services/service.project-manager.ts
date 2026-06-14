/**
 * Project Manager Service
 *
 * Business logic for project CRUD, organization linking,
 * status polling, and status enumeration.
 */

import { generateHostname } from "../feature-utils/util.hostname-generator";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { OrganizationModel } from "../../../models/OrganizationModel";
import { PageModel } from "../../../models/website-builder/PageModel";
import { TemplatePageModel } from "../../../models/website-builder/TemplatePageModel";
import { WebsiteIntegrationModel } from "../../../models/website-builder/WebsiteIntegrationModel";
import logger from "../../../lib/logger";

type ProjectListViewFilter = "active" | "inactive" | "archive";

function normalizeArchivedAt(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return undefined;

  return parsed.toISOString();
}

// ---------------------------------------------------------------------------
// List projects with pagination + org join
// ---------------------------------------------------------------------------

export async function listProjects(filters: {
  status?: string;
  projectListView?: ProjectListViewFilter;
  page: number;
  limit: number;
}): Promise<{
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}> {
  const { status, projectListView, page, limit } = filters;
  const offset = (page - 1) * limit;

  logger.info({ detail: filters }, "[Admin Websites] Fetching projects with filters:");

  // Count query
  const total = await ProjectModel.countAdminList({ status, projectListView });
  const totalPages = Math.ceil(total / limit);

  // Data query with organization LEFT JOIN
  const projects = await ProjectModel.listAdminWithOrganization({
    status,
    projectListView,
    limit,
    offset,
  });

  const projectIds = projects.map((project: any) => project.id);
  const activeIntegrations = projectIds.length > 0
    ? await WebsiteIntegrationModel.findActiveByProjectIds(projectIds)
    : [];
  const integrationsByProject = activeIntegrations.reduce(
    (map: Map<string, Array<{ platform: string; status: string }>>, integration: any) => {
      const existing = map.get(integration.project_id) ?? [];
      if (!existing.some((item) => item.platform === integration.platform)) {
        existing.push({
          platform: integration.platform,
          status: integration.status,
        });
      }
      map.set(integration.project_id, existing);
      return map;
    },
    new Map<string, Array<{ platform: string; status: string }>>(),
  );

  // Parse organization JSON (will be null if not linked)
  const projectsWithOrg = projects.map((p: any) => ({
    ...p,
    organization: p.organization && p.organization.id ? p.organization : null,
    active_integrations: integrationsByProject.get(p.id) ?? [],
  }));

  logger.info(
    `[Admin Websites] Found ${projectsWithOrg.length} of ${total} projects (page ${page})`,
  );

  return {
    data: projectsWithOrg,
    pagination: { page, limit, total, totalPages },
  };
}

// ---------------------------------------------------------------------------
// Create project
// ---------------------------------------------------------------------------

export async function createProject(data: {
  user_id?: string;
  hostname?: string;
}): Promise<any> {
  const generatedHostname = data.hostname || generateHostname();
  const userId = data.user_id || "admin-portal";

  logger.info(
    `[Admin Websites] Creating project with hostname: ${generatedHostname}`,
  );

  const project = await ProjectModel.insertReturning({
    user_id: userId,
    generated_hostname: generatedHostname,
    display_name: generatedHostname,
    status: "CREATED",
  });

  logger.info(`[Admin Websites] \u2713 Created project ID: ${project.id}`);

  return project;
}

// ---------------------------------------------------------------------------
// Update project display name
// ---------------------------------------------------------------------------

export async function updateProjectDisplayName(
  projectId: string,
  displayName: string
): Promise<void> {
  await ProjectModel.updateDisplayNameById(projectId, displayName.trim());
}

// ---------------------------------------------------------------------------
// Get distinct project statuses
// ---------------------------------------------------------------------------

export async function getProjectStatuses(): Promise<string[]> {
  logger.info("[Admin Websites] Fetching unique statuses");

  const statusList = await ProjectModel.findDistinctStatuses();

  logger.info(`[Admin Websites] Found ${statusList.length} unique statuses`);

  return statusList;
}

// ---------------------------------------------------------------------------
// Get project status (lightweight polling)
// ---------------------------------------------------------------------------

export async function getProjectStatus(id: string): Promise<any> {
  return ProjectModel.findStatusById(id);
}

// ---------------------------------------------------------------------------
// Link / unlink organization
// ---------------------------------------------------------------------------

export async function linkOrganization(
  projectId: string,
  organizationId: number | null,
): Promise<{
  project: any;
  error?: { status: number; code: string; message: string };
}> {
  logger.info(
    `[Admin Websites] Linking/unlinking project ${projectId} to organization ${organizationId}`,
  );

  // Validate project exists
  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return {
      project: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  // If unlinking (organizationId is null)
  if (organizationId === null) {
    logger.info(`[Admin Websites] Unlinking project ${projectId}`);
    const updatedProject = await ProjectModel.setOrganizationIdReturning(
      projectId,
      null,
    );

    logger.info(`[Admin Websites] \u2713 Unlinked project ${projectId}`);
    return { project: updatedProject };
  }

  // If linking (organizationId is provided)
  if (typeof organizationId !== "number") {
    return {
      project: null,
      error: {
        status: 400,
        code: "INVALID_INPUT",
        message: "organizationId must be a number or null",
      },
    };
  }

  // Validate organization exists
  const organization = await OrganizationModel.findById(organizationId);
  if (!organization) {
    return {
      project: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Organization not found",
      },
    };
  }

  // Check if organization is already linked to another website
  const existingLink = await ProjectModel.findLinkedToOrganizationExcept(
    organizationId,
    projectId,
  );

  if (existingLink) {
    return {
      project: null,
      error: {
        status: 400,
        code: "ALREADY_LINKED",
        message: "Organization already linked to another website",
      },
    };
  }

  // Link the website to the organization
  logger.info(
    `[Admin Websites] Linking project ${projectId} to organization ${organizationId}`,
  );
  const updatedProject = await ProjectModel.setOrganizationIdReturning(
    projectId,
    organizationId,
  );

  logger.info(
    `[Admin Websites] \u2713 Linked project ${projectId} to organization ${organizationId}`,
  );
  return { project: updatedProject };
}

// ---------------------------------------------------------------------------
// Get single project with pages
// ---------------------------------------------------------------------------

export async function getProjectById(id: string): Promise<any> {
  logger.info(`[Admin Websites] Fetching project ID: ${id}`);

  const project = await ProjectModel.findByIdWithOrganization(id);

  if (!project) return null;

  // Parse organization JSON (will be null if not linked)
  const organization =
    project.organization && project.organization.id
      ? project.organization
      : null;

  // Get pages for this project
  const pages = await PageModel.findByProjectOrderedPathVersion(id);

  logger.info(`[Admin Websites] Found project with ${pages.length} pages`);

  return {
    ...project,
    organization,
    pages,
  };
}

// ---------------------------------------------------------------------------
// Update project
// ---------------------------------------------------------------------------

export async function updateProject(
  id: string,
  updates: Record<string, any>,
): Promise<{
  project: any;
  error?: { status: number; code: string; message: string };
}> {
  logger.info({ detail: updates }, `[Admin Websites] Updating project ID: ${id}`);
  const sanitizedUpdates = { ...updates };

  const existing = await ProjectModel.findRawById(id);
  if (!existing) {
    return {
      project: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  // Remove fields that shouldn't be updated directly
  delete sanitizedUpdates.id;
  delete sanitizedUpdates.created_at;

  if (Object.prototype.hasOwnProperty.call(sanitizedUpdates, "archived_at")) {
    const normalizedArchivedAt = normalizeArchivedAt(sanitizedUpdates.archived_at);
    if (normalizedArchivedAt === undefined) {
      return {
        project: null,
        error: {
          status: 400,
          code: "INVALID_ARCHIVED_AT",
          message: "archived_at must be an ISO timestamp or null.",
        },
      };
    }
    sanitizedUpdates.archived_at = normalizedArchivedAt;
  }

  // Validate wrapper contains {{slot}} if being updated
  if (sanitizedUpdates.wrapper && !sanitizedUpdates.wrapper.includes("{{slot}}")) {
    return {
      project: null,
      error: {
        status: 400,
        code: "INVALID_WRAPPER",
        message:
          "Wrapper must contain the {{slot}} placeholder where page content should be injected.",
      },
    };
  }

  const project = await ProjectModel.updateFieldsByIdReturning(
    id,
    sanitizedUpdates,
  );

  logger.info(`[Admin Websites] \u2713 Updated project ID: ${id}`);

  return { project };
}

// ---------------------------------------------------------------------------
// Update page generation status (N8N callback)
// ---------------------------------------------------------------------------

export async function updatePageGenerationStatus(
  pageId: string,
  data: {
    generation_status: "generating" | "ready" | "failed";
    html_content?: string;
    sections?: unknown;
    wrapper?: string;
    header?: string;
    footer?: string;
  },
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const page = await PageModel.findRawById(pageId);
  if (!page) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Page not found" } };
  }

  const pageUpdates: Record<string, unknown> = {
    generation_status: data.generation_status,
  };

  if (data.generation_status === "ready") {
    pageUpdates.status = "draft";
    if (data.html_content !== undefined) pageUpdates.html_content = data.html_content;
    if (data.sections !== undefined) pageUpdates.sections = JSON.stringify(data.sections);
  }

  await PageModel.updateFieldsById(pageId, pageUpdates);

  // If ready, propagate layout updates to the project and advance status to LIVE
  if (data.generation_status === "ready") {
    const projectUpdates: Record<string, unknown> = {};
    if (data.wrapper !== undefined) projectUpdates.wrapper = data.wrapper;
    if (data.header !== undefined) projectUpdates.header = data.header;
    if (data.footer !== undefined) projectUpdates.footer = data.footer;

    // Advance to LIVE — a page is now ready
    projectUpdates.status = "LIVE";

    await ProjectModel.updateFieldsById(page.project_id, projectUpdates);
    logger.info(`[Admin Websites] Page ${pageId} ready — project ${page.project_id} set to LIVE`);
  }

  return {};
}

// ---------------------------------------------------------------------------
// Get per-page generation status for a project (polling)
// ---------------------------------------------------------------------------

export async function getPagesGenerationStatus(projectId: string): Promise<any[]> {
  return PageModel.findGenerationStatusWithTemplateName(projectId);
}

/**
 * Fetch the in-flight state for a single page: template section scaffolding
 * (names + template markup) plus whichever sections have been generated so
 * far. Feeds the progressive section reveal UI during generation.
 */
export async function getPageProgressiveState(
  projectId: string,
  pageId: string,
): Promise<{
  pageId: string;
  name: string | null;
  path: string | null;
  generation_status: string | null;
  generation_progress: any;
  template_sections: Array<{ name: string; content: string }>;
  generated_sections: Array<{ name: string; content: string }>;
  wrapper: string | null;
  header: string | null;
  footer: string | null;
}> {
  const page = await PageModel.findProgressiveStateByIdAndProject(
    pageId,
    projectId,
  );
  if (!page) throw new Error("PAGE_NOT_FOUND");

  const project = await ProjectModel.findLayoutFieldsById(projectId);

  const templatePage = page.template_page_id
    ? await TemplatePageModel.findNameSectionsById(page.template_page_id)
    : null;

  const parse = (v: unknown): any => {
    if (!v) return null;
    if (typeof v === "object") return v;
    if (typeof v === "string") {
      try {
        return JSON.parse(v);
      } catch {
        return null;
      }
    }
    return null;
  };

  const rawTemplate = parse(templatePage?.sections);
  const templateSectionsArr = Array.isArray(rawTemplate)
    ? rawTemplate
    : Array.isArray(rawTemplate?.sections)
      ? rawTemplate.sections
      : [];
  const template_sections = templateSectionsArr
    .map((s: any, idx: number) => ({
      name: s?.name || `section-${idx}`,
      content: typeof s?.content === "string" ? s.content : "",
    }))
    .filter((s: any) => s.content);

  const rawGenerated = parse(page.sections);
  const generatedArr = Array.isArray(rawGenerated)
    ? rawGenerated
    : Array.isArray(rawGenerated?.sections)
      ? rawGenerated.sections
      : [];
  const generated_sections = generatedArr
    .map((s: any, idx: number) => ({
      name: s?.name || `section-${idx}`,
      content: typeof s?.content === "string" ? s.content : "",
    }))
    .filter((s: any) => s.content);

  return {
    pageId: page.id,
    name: templatePage?.name || null,
    path: page.path,
    generation_status: page.generation_status,
    generation_progress: parse(page.generation_progress),
    template_sections,
    generated_sections,
    wrapper: project?.wrapper || null,
    header: project?.header || null,
    footer: project?.footer || null,
  };
}

// ---------------------------------------------------------------------------
// Create all pages from template (bulk kick-off)
// ---------------------------------------------------------------------------

export async function createAllFromTemplate(
  projectId: string,
  data: {
    templateId: string;
    placeId?: string;
    pages: Array<{
      templatePageId: string;
      path: string;
      websiteUrl?: string | null;
    }>;
    businessName?: string;
    formattedAddress?: string;
    city?: string;
    state?: string;
    phone?: string;
    category?: string;
    primaryColor?: string;
    accentColor?: string;
    practiceSearchString?: string;
    rating?: number;
    reviewCount?: number;
  },
): Promise<{
  pages?: Array<{ id: string; path: string; templatePageId: string; generation_status: string }>;
  error?: { status: number; code: string; message: string };
}> {
  const project = await ProjectModel.findRawById(projectId);
  if (!project) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Project not found" } };
  }

  if (data.pages.length === 0) {
    return { error: { status: 400, code: "INVALID_INPUT", message: "No pages provided" } };
  }

  // Create all page rows as queued
  const insertedPages = await PageModel.insertManyReturning(
    data.pages.map((p) => ({
      project_id: projectId,
      path: p.path,
      version: 1,
      status: "draft",
      generation_status: "queued",
      template_page_id: p.templatePageId,
    })),
    ["id", "path", "template_page_id", "generation_status"],
  );

  // Advance project to IN_PROGRESS
  await ProjectModel.setStatusInProgressById(projectId);

  logger.info(`[Admin Websites] Created ${insertedPages.length} queued pages for project ${projectId}`);

  return {
    pages: insertedPages.map((p: any) => ({
      id: p.id,
      path: p.path,
      templatePageId: p.template_page_id,
      generation_status: p.generation_status,
    })),
  };
}

// ---------------------------------------------------------------------------
// Delete project (cascade pages)
// ---------------------------------------------------------------------------

export async function deleteProject(
  id: string,
): Promise<{ error?: { status: number; code: string; message: string } }> {
  logger.info(`[Admin Websites] Deleting project ID: ${id}`);

  const existing = await ProjectModel.findRawById(id);
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  await ProjectModel.deleteById(id);

  logger.info(`[Admin Websites] \u2713 Deleted project ID: ${id}`);

  return {};
}
