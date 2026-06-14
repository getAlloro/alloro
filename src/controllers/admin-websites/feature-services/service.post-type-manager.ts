/**
 * Post Type Manager Service
 *
 * CRUD for post types scoped to templates.
 * Post types define the content schema for posts in projects using that template.
 */

import { db } from "../../../database/connection";
import logger from "../../../lib/logger";

const POST_TYPES_TABLE = "website_builder.post_types";
const TEMPLATES_TABLE = "website_builder.templates";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fieldSlugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const VALID_FIELD_TYPES = new Set([
  "text",
  "textarea",
  "media_url",
  "number",
  "date",
  "boolean",
  "select",
  "gallery",
]);

interface SchemaField {
  name: string;
  slug: string;
  type: string;
  required?: boolean;
  default_value?: unknown;
  options?: string[];
}

function validateSchema(
  schema: unknown
): { valid: true; fields: SchemaField[] } | { valid: false; message: string } {
  if (!Array.isArray(schema)) {
    return { valid: false, message: "schema must be an array" };
  }

  const slugs = new Set<string>();

  for (let i = 0; i < schema.length; i++) {
    const field = schema[i];

    if (!field.name || typeof field.name !== "string") {
      return { valid: false, message: `Field ${i}: name is required` };
    }

    if (!field.type || !VALID_FIELD_TYPES.has(field.type)) {
      return {
        valid: false,
        message: `Field ${i}: type must be one of: ${[...VALID_FIELD_TYPES].join(", ")}`,
      };
    }

    const slug = field.slug || fieldSlugify(field.name);
    if (slugs.has(slug)) {
      return { valid: false, message: `Field ${i}: duplicate slug "${slug}"` };
    }
    slugs.add(slug);

    if (field.type === "select") {
      if (!Array.isArray(field.options) || field.options.length === 0) {
        return {
          valid: false,
          message: `Field ${i}: select type requires a non-empty options array`,
        };
      }
    }

    // gallery has no additional schema config — value shape is validated at
    // post create/update time in service.post-manager.ts (must be an array).

    // Normalize: ensure slug is present
    schema[i] = {
      name: field.name,
      slug,
      type: field.type,
      required: !!field.required,
      default_value: field.default_value ?? null,
      ...(field.type === "select" && { options: field.options }),
    };
  }

  return { valid: true, fields: schema };
}

// ---------------------------------------------------------------------------
// List post types for a template
// ---------------------------------------------------------------------------

export async function listPostTypes(templateId: string): Promise<{
  postTypes: any[];
  error?: { status: number; code: string; message: string };
}> {
  const template = await db(TEMPLATES_TABLE).where("id", templateId).first();
  if (!template) {
    return {
      postTypes: [],
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  const postTypes = await db(POST_TYPES_TABLE)
    .where("template_id", templateId)
    .orderBy("created_at", "asc");

  return { postTypes };
}

// ---------------------------------------------------------------------------
// Create post type
// ---------------------------------------------------------------------------

export async function createPostType(
  templateId: string,
  data: { name: string; description?: string; schema?: unknown[]; single_template?: { name: string; content: string }[] }
): Promise<{
  postType: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, description, schema, single_template } = data;

  if (!name) {
    return {
      postType: null,
      error: { status: 400, code: "INVALID_INPUT", message: "name is required" },
    };
  }

  // Validate schema if provided
  let validatedSchema: SchemaField[] = [];
  if (schema && Array.isArray(schema) && schema.length > 0) {
    const result = validateSchema(schema);
    if (!result.valid) {
      return {
        postType: null,
        error: { status: 400, code: "INVALID_SCHEMA", message: result.message },
      };
    }
    validatedSchema = result.fields;
  }

  const template = await db(TEMPLATES_TABLE).where("id", templateId).first();
  if (!template) {
    return {
      postType: null,
      error: { status: 404, code: "NOT_FOUND", message: "Template not found" },
    };
  }

  const slug = slugify(name);

  // Check slug uniqueness within template
  const existing = await db(POST_TYPES_TABLE)
    .where({ template_id: templateId, slug })
    .first();
  if (existing) {
    return {
      postType: null,
      error: {
        status: 409,
        code: "SLUG_CONFLICT",
        message: `A post type with slug "${slug}" already exists in this template`,
      },
    };
  }

  logger.info(`[Admin Websites] Creating post type "${name}" for template ${templateId}`);

  const [postType] = await db(POST_TYPES_TABLE)
    .insert({
      template_id: templateId,
      name,
      slug,
      description: description || null,
      schema: JSON.stringify(validatedSchema),
      single_template: JSON.stringify(single_template || []),
    })
    .returning("*");

  logger.info(`[Admin Websites] ✓ Created post type ID: ${postType.id}`);

  return { postType };
}

// ---------------------------------------------------------------------------
// Get post type
// ---------------------------------------------------------------------------

export async function getPostType(
  templateId: string,
  postTypeId: string
): Promise<any> {
  return db(POST_TYPES_TABLE)
    .where({ id: postTypeId, template_id: templateId })
    .first();
}

// ---------------------------------------------------------------------------
// Update post type
// ---------------------------------------------------------------------------

export async function updatePostType(
  templateId: string,
  postTypeId: string,
  updates: Record<string, any>
): Promise<{
  postType: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await db(POST_TYPES_TABLE)
    .where({ id: postTypeId, template_id: templateId })
    .first();
  if (!existing) {
    return {
      postType: null,
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  delete updates.id;
  delete updates.template_id;
  delete updates.created_at;

  // Re-generate slug if name changed
  if (updates.name && updates.name !== existing.name) {
    updates.slug = slugify(updates.name);
    const conflict = await db(POST_TYPES_TABLE)
      .where({ template_id: templateId, slug: updates.slug })
      .whereNot("id", postTypeId)
      .first();
    if (conflict) {
      return {
        postType: null,
        error: {
          status: 409,
          code: "SLUG_CONFLICT",
          message: `A post type with slug "${updates.slug}" already exists`,
        },
      };
    }
  }

  if (updates.schema !== undefined) {
    const result = validateSchema(updates.schema);
    if (!result.valid) {
      return {
        postType: null,
        error: { status: 400, code: "INVALID_SCHEMA", message: result.message },
      };
    }
    updates.schema = JSON.stringify(result.fields);
  }

  if (updates.single_template !== undefined) {
    updates.single_template = JSON.stringify(updates.single_template);
  }

  const [postType] = await db(POST_TYPES_TABLE)
    .where({ id: postTypeId, template_id: templateId })
    .update({ ...updates, updated_at: db.fn.now() })
    .returning("*");

  logger.info(`[Admin Websites] ✓ Updated post type ID: ${postTypeId}`);

  return { postType };
}

// ---------------------------------------------------------------------------
// Delete post type
// ---------------------------------------------------------------------------

export async function deletePostType(
  templateId: string,
  postTypeId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const existing = await db(POST_TYPES_TABLE)
    .where({ id: postTypeId, template_id: templateId })
    .first();
  if (!existing) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Post type not found" },
    };
  }

  await db(POST_TYPES_TABLE)
    .where({ id: postTypeId, template_id: templateId })
    .del();

  logger.info(`[Admin Websites] ✓ Deleted post type ID: ${postTypeId}`);

  return {};
}
