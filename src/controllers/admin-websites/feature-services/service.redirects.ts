/**
 * Redirects Service
 *
 * CRUD + resolution for URL redirects per project.
 * Supports exact path matching and wildcard prefixes (e.g., /blog/*).
 */

import { db } from "../../../database/connection";
import logger from "../../../lib/logger";

const TABLE = "website_builder.redirects";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RedirectInput {
  from_path: string;
  to_path: string;
  type?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  let normalized = p.trim();
  if (!normalized.startsWith("/")) normalized = "/" + normalized;
  // Strip trailing slash unless root or wildcard
  if (normalized.length > 1 && normalized.endsWith("/") && !normalized.endsWith("*/")) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

function isWildcard(fromPath: string): boolean {
  return fromPath.endsWith("/*") || fromPath.endsWith("*");
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

export async function listRedirects(
  projectId: string,
  filters?: { type?: number }
): Promise<any[]> {
  let query = db(TABLE)
    .where("project_id", projectId)
    .orderBy("from_path", "asc");

  if (filters?.type) {
    query = query.where("type", filters.type);
  }

  return query;
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createRedirect(
  projectId: string,
  input: RedirectInput
): Promise<{
  redirect: any;
  error?: { status: number; code: string; message: string };
}> {
  const from_path = normalizePath(input.from_path);
  const to_path = normalizePath(input.to_path);
  const type = input.type === 302 ? 302 : 301;

  // Validate: no self-redirect
  if (from_path === to_path) {
    return {
      redirect: null,
      error: {
        status: 400,
        code: "REDIRECT_LOOP",
        message: "from_path and to_path cannot be the same",
      },
    };
  }

  // Validate: no circular chain (to_path already has a redirect)
  const chain = await db(TABLE)
    .where({ project_id: projectId, from_path: to_path })
    .first();
  if (chain) {
    return {
      redirect: null,
      error: {
        status: 400,
        code: "REDIRECT_CHAIN",
        message: `to_path "${to_path}" already has a redirect to "${chain.to_path}". This would create a chain.`,
      },
    };
  }

  // Check for duplicate
  const existing = await db(TABLE)
    .where({ project_id: projectId, from_path })
    .first();
  if (existing) {
    return {
      redirect: null,
      error: {
        status: 409,
        code: "DUPLICATE",
        message: `A redirect from "${from_path}" already exists`,
      },
    };
  }

  const [redirect] = await db(TABLE)
    .insert({
      project_id: projectId,
      from_path,
      to_path,
      type,
      is_wildcard: isWildcard(from_path),
    })
    .returning("*");

  logger.info(
    `[Redirects] Created: ${from_path} → ${to_path} (${type}) for project ${projectId}`
  );

  return { redirect };
}

// ---------------------------------------------------------------------------
// Bulk create
// ---------------------------------------------------------------------------

export async function bulkCreateRedirects(
  projectId: string,
  inputs: RedirectInput[]
): Promise<{ created: number; skipped: number; errors: string[] }> {
  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const input of inputs) {
    const result = await createRedirect(projectId, input);
    if (result.error) {
      skipped++;
      errors.push(`${input.from_path}: ${result.error.message}`);
    } else {
      created++;
    }
  }

  return { created, skipped, errors };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateRedirect(
  redirectId: string,
  input: Partial<RedirectInput>
): Promise<{
  redirect: any;
  error?: { status: number; code: string; message: string };
}> {
  const existing = await db(TABLE).where("id", redirectId).first();
  if (!existing) {
    return {
      redirect: null,
      error: { status: 404, code: "NOT_FOUND", message: "Redirect not found" },
    };
  }

  const updates: Record<string, unknown> = { updated_at: db.fn.now() };

  if (input.from_path !== undefined) {
    updates.from_path = normalizePath(input.from_path);
    updates.is_wildcard = isWildcard(updates.from_path as string);
  }
  if (input.to_path !== undefined) {
    updates.to_path = normalizePath(input.to_path);
  }
  if (input.type !== undefined) {
    updates.type = input.type === 302 ? 302 : 301;
  }

  const finalFrom = (updates.from_path as string) || existing.from_path;
  const finalTo = (updates.to_path as string) || existing.to_path;

  if (finalFrom === finalTo) {
    return {
      redirect: null,
      error: {
        status: 400,
        code: "REDIRECT_LOOP",
        message: "from_path and to_path cannot be the same",
      },
    };
  }

  const [redirect] = await db(TABLE)
    .where("id", redirectId)
    .update(updates)
    .returning("*");

  return { redirect };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

export async function deleteRedirect(
  redirectId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  const deleted = await db(TABLE).where("id", redirectId).del();
  if (deleted === 0) {
    return {
      error: { status: 404, code: "NOT_FOUND", message: "Redirect not found" },
    };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Resolve (for renderer)
// ---------------------------------------------------------------------------

export async function resolveRedirect(
  projectId: string,
  requestPath: string
): Promise<{ to_path: string; type: number } | null> {
  const normalizedPath = normalizePath(requestPath);

  // 1. Try exact match first
  const exact = await db(TABLE)
    .where({ project_id: projectId, from_path: normalizedPath, is_wildcard: false })
    .first();

  if (exact) {
    return { to_path: exact.to_path, type: exact.type };
  }

  // 2. Try wildcard matches — longest prefix wins
  const wildcards = await db(TABLE)
    .where({ project_id: projectId, is_wildcard: true })
    .orderByRaw("LENGTH(from_path) DESC");

  for (const wc of wildcards) {
    const prefix = wc.from_path.replace(/\*$/, "").replace(/\/$/, "");
    if (normalizedPath === prefix || normalizedPath.startsWith(prefix + "/")) {
      return { to_path: wc.to_path, type: wc.type };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Get all (for AI context)
// ---------------------------------------------------------------------------

export async function getExistingRedirects(
  projectId: string
): Promise<Array<{ from_path: string; to_path: string }>> {
  return db(TABLE)
    .where("project_id", projectId)
    .select("from_path", "to_path");
}
