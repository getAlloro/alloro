/**
 * Project Manager Service
 *
 * Business logic for project CRUD, organization linking,
 * status polling, and status enumeration.
 */

import { db } from "../../../database/connection";
import { generateHostname } from "../feature-utils/util.hostname-generator";

const PROJECTS_TABLE = "website_builder.projects";
const PAGES_TABLE = "website_builder.pages";

type OrganizationStatusFilter = "active" | "inactive";

// ---------------------------------------------------------------------------
// List projects with pagination + org join
// ---------------------------------------------------------------------------

export async function listProjects(filters: {
  status?: string;
  organizationStatus?: OrganizationStatusFilter;
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
  const { status, organizationStatus, page, limit } = filters;
  const offset = (page - 1) * limit;

  console.log("[Admin Websites] Fetching projects with filters:", filters);

  // Count query
  let countQuery = db(PROJECTS_TABLE);
  if (status) {
    countQuery = countQuery.where("status", status);
  }
  if (organizationStatus === "active") {
    countQuery = countQuery.whereNotNull("organization_id");
  }
  if (organizationStatus === "inactive") {
    countQuery = countQuery.whereNull("organization_id");
  }
  const [{ count }] = await countQuery.count("* as count");
  const total = parseInt(count as string, 10);
  const totalPages = Math.ceil(total / limit);

  // Data query with organization LEFT JOIN
  let dataQuery = db(PROJECTS_TABLE)
    .leftJoin(
      "organizations",
      `${PROJECTS_TABLE}.organization_id`,
      "organizations.id",
    )
    .select(
      `${PROJECTS_TABLE}.id`,
      `${PROJECTS_TABLE}.user_id`,
      `${PROJECTS_TABLE}.generated_hostname`,
      `${PROJECTS_TABLE}.status`,
      `${PROJECTS_TABLE}.selected_place_id`,
      `${PROJECTS_TABLE}.selected_website_url`,
      `${PROJECTS_TABLE}.template_id`,
      `${PROJECTS_TABLE}.step_gbp_scrape`,
      `${PROJECTS_TABLE}.display_name`,
      `${PROJECTS_TABLE}.custom_domain`,
      `${PROJECTS_TABLE}.primary_color`,
      `${PROJECTS_TABLE}.accent_color`,
      `${PROJECTS_TABLE}.created_at`,
      `${PROJECTS_TABLE}.updated_at`,
      db.raw(
        "json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization",
      ),
    );

  if (status) {
    dataQuery = dataQuery.where(`${PROJECTS_TABLE}.status`, status);
  }
  if (organizationStatus === "active") {
    dataQuery = dataQuery.whereNotNull(`${PROJECTS_TABLE}.organization_id`);
  }
  if (organizationStatus === "inactive") {
    dataQuery = dataQuery.whereNull(`${PROJECTS_TABLE}.organization_id`);
  }

  const projects = await dataQuery
    .orderBy(`${PROJECTS_TABLE}.created_at`, "desc")
    .limit(limit)
    .offset(offset);

  const projectIds = projects.map((project: any) => project.id);
  const activeIntegrations = projectIds.length > 0
    ? await db("website_builder.website_integrations")
        .select("project_id", "platform", "status")
        .whereIn("project_id", projectIds)
        .where("status", "active")
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

  console.log(
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

  console.log(
    `[Admin Websites] Creating project with hostname: ${generatedHostname}`,
  );

  const [project] = await db(PROJECTS_TABLE)
    .insert({
      user_id: userId,
      generated_hostname: generatedHostname,
      display_name: generatedHostname,
      status: "CREATED",
    })
    .returning("*");

  console.log(`[Admin Websites] \u2713 Created project ID: ${project.id}`);

  return project;
}

// ---------------------------------------------------------------------------
// Update project display name
// ---------------------------------------------------------------------------

export async function updateProjectDisplayName(
  projectId: string,
  displayName: string
): Promise<void> {
  await db(PROJECTS_TABLE)
    .where({ id: projectId })
    .update({ display_name: displayName.trim() });
}

// ---------------------------------------------------------------------------
// Get distinct project statuses
// ---------------------------------------------------------------------------

export async function getProjectStatuses(): Promise<string[]> {
  console.log("[Admin Websites] Fetching unique statuses");

  const statuses = await db(PROJECTS_TABLE)
    .distinct("status")
    .whereNotNull("status")
    .orderBy("status", "asc");

  const statusList = statuses.map((s: any) => s.status);

  console.log(`[Admin Websites] Found ${statusList.length} unique statuses`);

  return statusList;
}

// ---------------------------------------------------------------------------
// Get project status (lightweight polling)
// ---------------------------------------------------------------------------

export async function getProjectStatus(id: string): Promise<any> {
  const project = await db(PROJECTS_TABLE)
    .select(
      "id",
      "status",
      "selected_place_id",
      "selected_website_url",
      "step_gbp_scrape",
      "step_website_scrape",
      "step_image_analysis",
      "updated_at",
    )
    .where("id", id)
    .first();

  return project || null;
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
  console.log(
    `[Admin Websites] Linking/unlinking project ${projectId} to organization ${organizationId}`,
  );

  // Validate project exists
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return {
      project: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  // If unlinking (organizationId is null)
  if (organizationId === null) {
    console.log(`[Admin Websites] Unlinking project ${projectId}`);
    await db(PROJECTS_TABLE)
      .where("id", projectId)
      .update({ organization_id: null, updated_at: db.fn.now() });

    const [updatedProject] = await db(PROJECTS_TABLE)
      .where("id", projectId)
      .returning("*");

    console.log(`[Admin Websites] \u2713 Unlinked project ${projectId}`);
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
  const organization = await db("organizations")
    .where("id", organizationId)
    .first();
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
  const existingLink = await db(PROJECTS_TABLE)
    .where("organization_id", organizationId)
    .whereNot("id", projectId)
    .first();

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
  console.log(
    `[Admin Websites] Linking project ${projectId} to organization ${organizationId}`,
  );
  await db(PROJECTS_TABLE)
    .where("id", projectId)
    .update({ organization_id: organizationId, updated_at: db.fn.now() });

  const [updatedProject] = await db(PROJECTS_TABLE)
    .where("id", projectId)
    .returning("*");

  console.log(
    `[Admin Websites] \u2713 Linked project ${projectId} to organization ${organizationId}`,
  );
  return { project: updatedProject };
}

// ---------------------------------------------------------------------------
// Get single project with pages
// ---------------------------------------------------------------------------

export async function getProjectById(id: string): Promise<any> {
  console.log(`[Admin Websites] Fetching project ID: ${id}`);

  const project = await db(PROJECTS_TABLE)
    .leftJoin(
      "organizations",
      `${PROJECTS_TABLE}.organization_id`,
      "organizations.id",
    )
    .select(
      `${PROJECTS_TABLE}.*`,
      db.raw(
        "json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization",
      ),
    )
    .where(`${PROJECTS_TABLE}.id`, id)
    .first();

  if (!project) return null;

  // Parse organization JSON (will be null if not linked)
  const organization =
    project.organization && project.organization.id
      ? project.organization
      : null;

  // Get pages for this project
  const pages = await db(PAGES_TABLE)
    .where("project_id", id)
    .orderBy("path", "asc")
    .orderBy("version", "desc");

  console.log(`[Admin Websites] Found project with ${pages.length} pages`);

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
  console.log(`[Admin Websites] Updating project ID: ${id}`, updates);

  const existing = await db(PROJECTS_TABLE).where("id", id).first();
  if (!existing) {
    return {
      project: null,
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.created_at;

  // Validate wrapper contains {{slot}} if being updated
  if (updates.wrapper && !updates.wrapper.includes("{{slot}}")) {
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

  const [project] = await db(PROJECTS_TABLE)
    .where("id", id)
    .update({
      ...updates,
      updated_at: db.fn.now(),
    })
    .returning("*");

  console.log(`[Admin Websites] \u2713 Updated project ID: ${id}`);

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
  const page = await db(PAGES_TABLE).where("id", pageId).first();
  if (!page) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Page not found" } };
  }

  const pageUpdates: Record<string, unknown> = {
    generation_status: data.generation_status,
    updated_at: db.fn.now(),
  };

  if (data.generation_status === "ready") {
    pageUpdates.status = "draft";
    if (data.html_content !== undefined) pageUpdates.html_content = data.html_content;
    if (data.sections !== undefined) pageUpdates.sections = JSON.stringify(data.sections);
  }

  await db(PAGES_TABLE).where("id", pageId).update(pageUpdates);

  // If ready, propagate layout updates to the project and advance status to LIVE
  if (data.generation_status === "ready") {
    const projectUpdates: Record<string, unknown> = { updated_at: db.fn.now() };
    if (data.wrapper !== undefined) projectUpdates.wrapper = data.wrapper;
    if (data.header !== undefined) projectUpdates.header = data.header;
    if (data.footer !== undefined) projectUpdates.footer = data.footer;

    // Advance to LIVE — a page is now ready
    projectUpdates.status = "LIVE";

    await db(PROJECTS_TABLE).where("id", page.project_id).update(projectUpdates);
    console.log(`[Admin Websites] Page ${pageId} ready — project ${page.project_id} set to LIVE`);
  }

  return {};
}

// ---------------------------------------------------------------------------
// Get per-page generation status for a project (polling)
// ---------------------------------------------------------------------------

export async function getPagesGenerationStatus(projectId: string): Promise<any[]> {
  const pages = await db(PAGES_TABLE)
    .leftJoin(
      "website_builder.template_pages",
      `${PAGES_TABLE}.template_page_id`,
      "website_builder.template_pages.id",
    )
    .select(
      `${PAGES_TABLE}.id`,
      `${PAGES_TABLE}.path`,
      `${PAGES_TABLE}.status`,
      `${PAGES_TABLE}.generation_status`,
      `${PAGES_TABLE}.generation_progress`,
      `${PAGES_TABLE}.updated_at`,
      db.raw(`website_builder.template_pages.name as template_page_name`),
    )
    .where(`${PAGES_TABLE}.project_id`, projectId)
    .whereNotNull(`${PAGES_TABLE}.generation_status`)
    .orderBy(`${PAGES_TABLE}.path`, "asc");

  return pages;
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
  const page = await db(PAGES_TABLE)
    .where({ id: pageId, project_id: projectId })
    .select(
      "id",
      "path",
      "generation_status",
      "generation_progress",
      "sections",
      "template_page_id",
    )
    .first();
  if (!page) throw new Error("PAGE_NOT_FOUND");

  const project = await db(PROJECTS_TABLE)
    .where("id", projectId)
    .select("wrapper", "header", "footer")
    .first();

  const templatePage = page.template_page_id
    ? await db("website_builder.template_pages")
        .where("id", page.template_page_id)
        .select("name", "sections")
        .first()
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
  const project = await db(PROJECTS_TABLE).where("id", projectId).first();
  if (!project) {
    return { error: { status: 404, code: "NOT_FOUND", message: "Project not found" } };
  }

  if (data.pages.length === 0) {
    return { error: { status: 400, code: "INVALID_INPUT", message: "No pages provided" } };
  }

  // Create all page rows as queued
  const insertedPages = await db(PAGES_TABLE)
    .insert(
      data.pages.map((p) => ({
        project_id: projectId,
        path: p.path,
        version: 1,
        status: "draft",
        generation_status: "queued",
        template_page_id: p.templatePageId,
      })),
    )
    .returning(["id", "path", "template_page_id", "generation_status"]);

  // Advance project to IN_PROGRESS
  await db(PROJECTS_TABLE)
    .where("id", projectId)
    .update({ status: "IN_PROGRESS", updated_at: db.fn.now() });

  console.log(`[Admin Websites] Created ${insertedPages.length} queued pages for project ${projectId}`);

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
  console.log(`[Admin Websites] Deleting project ID: ${id}`);

  const existing = await db(PROJECTS_TABLE).where("id", id).first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Project not found" },
    };
  }

  await db(PROJECTS_TABLE).where("id", id).del();

  console.log(`[Admin Websites] \u2713 Deleted project ID: ${id}`);

  return {};
}
