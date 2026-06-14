/**
 * Menu Template Manager Service
 *
 * CRUD for menu templates scoped to templates.
 * Menu templates define reusable rendering layouts for menus,
 * referenced via {{ menu id='...' template='slug' }} shortcodes.
 */

import { db } from "../../../database/connection";
import { getRedisConnection } from "../../../workers/queues";
import logger from "../../../lib/logger";

const MENU_TEMPLATES_TABLE = "website_builder.menu_templates";
const TEMPLATES_TABLE = "website_builder.templates";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function invalidateMenuTemplateCache(templateId: string, slug: string) {
  try {
    const redis = getRedisConnection();
    await redis.del(`mt:${templateId}:${slug}`);
  } catch (err) {
    logger.error({ err: err }, "[Admin Websites] Failed to invalidate menu template cache:");
  }
}

// ---------------------------------------------------------------------------
// List menu templates for a template
// ---------------------------------------------------------------------------

export async function listMenuTemplates(templateId: string): Promise<{
  menuTemplates: any[];
  error?: { status: number; code: string; message: string };
}> {
  const template = await db(TEMPLATES_TABLE).where("id", templateId).first();
  if (!template) {
    return {
      menuTemplates: [],
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  const menuTemplates = await db(MENU_TEMPLATES_TABLE)
    .where("template_id", templateId)
    .orderBy("created_at", "asc");

  return { menuTemplates };
}

// ---------------------------------------------------------------------------
// Create menu template
// ---------------------------------------------------------------------------

export async function createMenuTemplate(
  templateId: string,
  data: {
    name: string;
    sections?: { name: string; content: string }[];
  }
): Promise<{
  menuTemplate: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, sections } = data;

  if (!name) {
    return {
      menuTemplate: null,
      error: { status: 400, code: "INVALID_INPUT", message: "name is required" },
    };
  }

  const template = await db(TEMPLATES_TABLE).where("id", templateId).first();
  if (!template) {
    return {
      menuTemplate: null,
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  const slug = slugify(name);
  const existing = await db(MENU_TEMPLATES_TABLE)
    .where({ template_id: templateId, slug })
    .first();
  if (existing) {
    return {
      menuTemplate: null,
      error: {
        status: 409,
        code: "SLUG_CONFLICT",
        message: `A menu template with slug "${slug}" already exists`,
      },
    };
  }

  logger.info(`[Admin Websites] Creating menu template "${name}" for template ${templateId}`);

  const [menuTemplate] = await db(MENU_TEMPLATES_TABLE)
    .insert({
      template_id: templateId,
      name,
      slug,
      sections: JSON.stringify(sections || []),
    })
    .returning("*");

  logger.info(`[Admin Websites] ✓ Created menu template ID: ${menuTemplate.id}`);

  return { menuTemplate };
}

// ---------------------------------------------------------------------------
// Get menu template
// ---------------------------------------------------------------------------

export async function getMenuTemplate(
  templateId: string,
  menuTemplateId: string
): Promise<any> {
  const mt = await db(MENU_TEMPLATES_TABLE)
    .where({ id: menuTemplateId, template_id: templateId })
    .first();

  if (mt && typeof mt.sections === "string") {
    mt.sections = JSON.parse(mt.sections);
  }

  return mt || null;
}

// ---------------------------------------------------------------------------
// Update menu template
// ---------------------------------------------------------------------------

export async function updateMenuTemplate(
  templateId: string,
  menuTemplateId: string,
  updates: Record<string, any>
): Promise<{
  menuTemplate: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await db(MENU_TEMPLATES_TABLE)
    .where({ id: menuTemplateId, template_id: templateId })
    .first();
  if (!existing) {
    return {
      menuTemplate: null,
      error: { status: 404, code: "NOT_FOUND", message: "Menu template not found" },
    };
  }

  delete updates.id;
  delete updates.template_id;
  delete updates.created_at;

  if (updates.name && updates.name !== existing.name) {
    updates.slug = slugify(updates.name);
    const conflict = await db(MENU_TEMPLATES_TABLE)
      .where({ template_id: templateId, slug: updates.slug })
      .whereNot("id", menuTemplateId)
      .first();
    if (conflict) {
      return {
        menuTemplate: null,
        error: { status: 409, code: "SLUG_CONFLICT", message: `Menu template "${updates.slug}" already exists` },
      };
    }
  }

  if (updates.sections !== undefined) {
    updates.sections = JSON.stringify(updates.sections);
  }

  const [menuTemplate] = await db(MENU_TEMPLATES_TABLE)
    .where({ id: menuTemplateId, template_id: templateId })
    .update({ ...updates, updated_at: db.fn.now() })
    .returning("*");

  logger.info(`[Admin Websites] ✓ Updated menu template ID: ${menuTemplateId}`);

  // Invalidate cache
  await invalidateMenuTemplateCache(templateId, existing.slug);
  if (updates.slug && updates.slug !== existing.slug) {
    await invalidateMenuTemplateCache(templateId, updates.slug);
  }

  return { menuTemplate };
}

// ---------------------------------------------------------------------------
// Delete menu template
// ---------------------------------------------------------------------------

export async function deleteMenuTemplate(
  templateId: string,
  menuTemplateId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await db(MENU_TEMPLATES_TABLE)
    .where({ id: menuTemplateId, template_id: templateId })
    .first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Menu template not found" },
    };
  }

  await db(MENU_TEMPLATES_TABLE)
    .where({ id: menuTemplateId, template_id: templateId })
    .del();

  logger.info(`[Admin Websites] ✓ Deleted menu template ID: ${menuTemplateId}`);

  await invalidateMenuTemplateCache(templateId, existing.slug);

  return {};
}
