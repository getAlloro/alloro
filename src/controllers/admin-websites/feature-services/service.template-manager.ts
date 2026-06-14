/**
 * Template Manager Service
 *
 * Business logic for template CRUD, template page CRUD,
 * template activation, and page editor system prompt.
 */

import { db } from "../../../database/connection";
import logger from "../../../lib/logger";

const TEMPLATES_TABLE = "website_builder.templates";
const TEMPLATE_PAGES_TABLE = "website_builder.template_pages";

// ---------------------------------------------------------------------------
// List templates
// ---------------------------------------------------------------------------

export async function listTemplates(): Promise<any[]> {
  logger.info("[Admin Websites] Fetching templates");

  const templates = await db(TEMPLATES_TABLE).orderBy("created_at", "desc");

  logger.info(`[Admin Websites] Found ${templates.length} templates`);

  return templates;
}

// ---------------------------------------------------------------------------
// Create template
// ---------------------------------------------------------------------------

export async function createTemplate(data: {
  name: string;
  wrapper?: string;
  header?: string;
  footer?: string;
  is_active?: boolean;
}): Promise<{ template: any; error?: { status: number; code: string; message: string } }> {
  const { name, wrapper, header, footer, is_active = false } = data;

  if (!name) {
    return {
      template: null,
      error: {
        status: 400,
        code: "INVALID_INPUT",
        message: "name is required",
      },
    };
  }

  // Validate wrapper contains {{slot}} if provided
  if (wrapper && !wrapper.includes("{{slot}}")) {
    return {
      template: null,
      error: {
        status: 400,
        code: "INVALID_WRAPPER",
        message:
          "Wrapper must contain the {{slot}} placeholder where page content should be injected.",
      },
    };
  }

  logger.info(`[Admin Websites] Creating template: ${name}`);

  // If setting as active, deactivate all others
  if (is_active) {
    await db(TEMPLATES_TABLE)
      .where({ is_active: true })
      .update({ is_active: false, updated_at: db.fn.now() });
  }

  const [template] = await db(TEMPLATES_TABLE)
    .insert({
      name,
      wrapper: wrapper || "",
      header: header || "",
      footer: footer || "",
      status: "draft",
      is_active,
    })
    .returning("*");

  logger.info(`[Admin Websites] \u2713 Created template ID: ${template.id}`);

  return { template };
}

// ---------------------------------------------------------------------------
// Get template with pages
// ---------------------------------------------------------------------------

export async function getTemplateById(id: string): Promise<any> {
  logger.info(`[Admin Websites] Fetching template ID: ${id}`);

  const template = await db(TEMPLATES_TABLE).where("id", id).first();
  if (!template) return null;

  const templatePages = await db(TEMPLATE_PAGES_TABLE)
    .where("template_id", id)
    .orderBy("created_at", "asc");

  return {
    ...template,
    template_pages: templatePages,
  };
}

// ---------------------------------------------------------------------------
// Update template
// ---------------------------------------------------------------------------

export async function updateTemplate(
  id: string,
  updates: Record<string, any>
): Promise<{ template: any; error?: { status: number; code: string; message: string } }> {
  logger.info(`[Admin Websites] Updating template ID: ${id}`);

  const existing = await db(TEMPLATES_TABLE).where("id", id).first();
  if (!existing) {
    return {
      template: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Template not found",
      },
    };
  }

  // Remove fields that shouldn't be updated directly
  delete updates.id;
  delete updates.created_at;

  // Validate wrapper contains {{slot}} if being updated
  if (updates.wrapper && !updates.wrapper.includes("{{slot}}")) {
    return {
      template: null,
      error: {
        status: 400,
        code: "INVALID_WRAPPER",
        message:
          "Wrapper must contain the {{slot}} placeholder where page content should be injected.",
      },
    };
  }

  const [template] = await db(TEMPLATES_TABLE)
    .where("id", id)
    .update({
      ...updates,
      updated_at: db.fn.now(),
    })
    .returning("*");

  logger.info(`[Admin Websites] \u2713 Updated template ID: ${id}`);

  return { template };
}

// ---------------------------------------------------------------------------
// Delete template
// ---------------------------------------------------------------------------

export async function deleteTemplate(
  id: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  logger.info(`[Admin Websites] Deleting template ID: ${id}`);

  const existing = await db(TEMPLATES_TABLE).where("id", id).first();
  if (!existing) {
    return {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Template not found",
      },
    };
  }

  await db(TEMPLATES_TABLE).where("id", id).del();

  logger.info(`[Admin Websites] \u2713 Deleted template ID: ${id}`);

  return {};
}

// ---------------------------------------------------------------------------
// Activate template
// ---------------------------------------------------------------------------

export async function activateTemplate(
  id: string
): Promise<{ template: any; error?: { status: number; code: string; message: string } }> {
  logger.info(`[Admin Websites] Activating template ID: ${id}`);

  const existing = await db(TEMPLATES_TABLE).where("id", id).first();
  if (!existing) {
    return {
      template: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Template not found",
      },
    };
  }

  // Deactivate all templates
  await db(TEMPLATES_TABLE)
    .where({ is_active: true })
    .update({ is_active: false, updated_at: db.fn.now() });

  // Activate this template
  const [template] = await db(TEMPLATES_TABLE)
    .where("id", id)
    .update({ is_active: true, updated_at: db.fn.now() })
    .returning("*");

  logger.info(`[Admin Websites] \u2713 Activated template ID: ${id}`);

  return { template };
}

// ---------------------------------------------------------------------------
// Get page editor system prompt (dynamic import)
// ---------------------------------------------------------------------------

export async function getPageEditorSystemPrompt(): Promise<string> {
  const { getPageEditorPrompt } = await import(
    "../../../utils/website-utils/pageEditorPrompt"
  );
  return getPageEditorPrompt();
}

// ---------------------------------------------------------------------------
// Template Pages
// ---------------------------------------------------------------------------

export async function listTemplatePages(templateId: string): Promise<{
  pages: any[];
  error?: { status: number; code: string; message: string };
}> {
  logger.info(
    `[Admin Websites] Fetching template pages for template ID: ${templateId}`
  );

  const template = await db(TEMPLATES_TABLE)
    .where("id", templateId)
    .first();
  if (!template) {
    return {
      pages: [],
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Template not found",
      },
    };
  }

  const pages = await db(TEMPLATE_PAGES_TABLE)
    .where("template_id", templateId)
    .orderBy("created_at", "asc");

  return { pages };
}

export async function createTemplatePage(
  templateId: string,
  data: { name: string; sections?: any[] }
): Promise<{
  page: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, sections } = data;

  if (!name) {
    return {
      page: null,
      error: {
        status: 400,
        code: "INVALID_INPUT",
        message: "name is required",
      },
    };
  }

  logger.info(
    `[Admin Websites] Creating template page for template ID: ${templateId}`
  );

  const template = await db(TEMPLATES_TABLE)
    .where("id", templateId)
    .first();
  if (!template) {
    return {
      page: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Template not found",
      },
    };
  }

  const [page] = await db(TEMPLATE_PAGES_TABLE)
    .insert({
      template_id: templateId,
      name,
      sections: JSON.stringify(sections || []),
    })
    .returning("*");

  logger.info(`[Admin Websites] \u2713 Created template page ID: ${page.id}`);

  return { page };
}

export async function getTemplatePage(
  templateId: string,
  pageId: string
): Promise<any> {
  logger.info(`[Admin Websites] Fetching template page ID: ${pageId}`);

  const page = await db(TEMPLATE_PAGES_TABLE)
    .where({ id: pageId, template_id: templateId })
    .first();

  return page || null;
}

export async function updateTemplatePage(
  templateId: string,
  pageId: string,
  updates: Record<string, any>
): Promise<{
  page: any;
  error?: { status: number; code: string; message: string };
}> {
  logger.info(`[Admin Websites] Updating template page ID: ${pageId}`);

  const existing = await db(TEMPLATE_PAGES_TABLE)
    .where({ id: pageId, template_id: templateId })
    .first();

  if (!existing) {
    return {
      page: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Template page not found",
      },
    };
  }

  delete updates.id;
  delete updates.template_id;
  delete updates.created_at;

  // Stringify JSONB fields for pg driver compatibility
  if (updates.sections !== undefined) {
    updates.sections = JSON.stringify(updates.sections);
  }

  const [page] = await db(TEMPLATE_PAGES_TABLE)
    .where({ id: pageId, template_id: templateId })
    .update({
      ...updates,
      updated_at: db.fn.now(),
    })
    .returning("*");

  logger.info(`[Admin Websites] \u2713 Updated template page ID: ${pageId}`);

  return { page };
}

export async function deleteTemplatePage(
  templateId: string,
  pageId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  logger.info(`[Admin Websites] Deleting template page ID: ${pageId}`);

  const existing = await db(TEMPLATE_PAGES_TABLE)
    .where({ id: pageId, template_id: templateId })
    .first();

  if (!existing) {
    return {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Template page not found",
      },
    };
  }

  await db(TEMPLATE_PAGES_TABLE)
    .where({ id: pageId, template_id: templateId })
    .del();

  logger.info(`[Admin Websites] \u2713 Deleted template page ID: ${pageId}`);

  return {};
}
