/**
 * HFCM Manager Service
 *
 * Business logic for Header/Footer Code Management for both
 * templates and projects. Handles CRUD, toggle, reorder with
 * HTML sanitization and ownership verification.
 */

import { HeaderFooterCodeModel } from "../../../models/website-builder/HeaderFooterCodeModel";
import { sanitizeCodeSnippet } from "../feature-utils/util.html-sanitizer";
import logger from "../../../lib/logger";

const VALID_LOCATIONS = ["head_start", "head_end", "body_start", "body_end"];

// ---------------------------------------------------------------------------
// Shared validation helpers
// ---------------------------------------------------------------------------

function validateSnippetInput(data: {
  name?: string;
  location?: string;
  code?: string;
}): { error?: { status: number; code: string; message: string } } {
  const { name, location, code } = data;

  if (!name || !location || !code) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Name, location, and code are required",
      },
    };
  }

  if (!VALID_LOCATIONS.includes(location)) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: `Location must be one of: ${VALID_LOCATIONS.join(", ")}`,
      },
    };
  }

  return {};
}

function validateLocationUpdate(location: string): {
  error?: { status: number; code: string; message: string };
} {
  if (!VALID_LOCATIONS.includes(location)) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: `Location must be one of: ${VALID_LOCATIONS.join(", ")}`,
      },
    };
  }
  return {};
}

function sanitizeCode(code: string): {
  sanitized?: string;
  error?: { status: number; code: string; message: string };
} {
  const { sanitized, isValid, error: sanitizeError } = sanitizeCodeSnippet(code);
  if (!isValid) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: sanitizeError || "Invalid HTML code",
      },
    };
  }
  return { sanitized };
}

// ---------------------------------------------------------------------------
// Template code snippets
// ---------------------------------------------------------------------------

export async function listTemplateSnippets(templateId: string): Promise<any[]> {
  logger.info(`[HFCM] Fetching code snippets for template: ${templateId}`);

  const snippets = await HeaderFooterCodeModel.findByTemplateIdRaw(templateId);

  return snippets;
}

export async function createTemplateSnippet(
  templateId: string,
  data: { name: string; location: string; code: string; page_ids?: any[]; order_index?: number }
): Promise<{
  snippet: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, location, code, page_ids = [], order_index = 0 } = data;

  // Validate required fields
  const validation = validateSnippetInput({ name, location, code });
  if (validation.error) return { snippet: null, ...validation };

  // Sanitize code
  const sanitization = sanitizeCode(code);
  if (sanitization.error) return { snippet: null, ...sanitization };

  logger.info(`[HFCM] Creating template snippet: ${name} at ${location}`);

  const snippet = await HeaderFooterCodeModel.insertReturning({
    template_id: templateId,
    name,
    location,
    code: sanitization.sanitized,
    page_ids: JSON.stringify(page_ids),
    order_index,
  });

  logger.info(`[HFCM] \u2713 Created template snippet: ${snippet.id}`);

  return { snippet };
}

export async function updateTemplateSnippet(
  templateId: string,
  snippetId: string,
  data: { name?: string; location?: string; code?: string; page_ids?: any[]; order_index?: number }
): Promise<{
  snippet: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, location, code, page_ids, order_index } = data;

  // Verify ownership
  const existing = await HeaderFooterCodeModel.findByIdRaw(snippetId);
  if (!existing) {
    return {
      snippet: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Code snippet not found",
      },
    };
  }

  if (existing.template_id !== templateId) {
    return {
      snippet: null,
      error: {
        status: 403,
        code: "FORBIDDEN",
        message: "This snippet belongs to a different template",
      },
    };
  }

  // Build update object
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (location !== undefined) {
    const locationValidation = validateLocationUpdate(location);
    if (locationValidation.error) return { snippet: null, ...locationValidation };
    updates.location = location;
  }
  if (code !== undefined) {
    const sanitization = sanitizeCode(code);
    if (sanitization.error) return { snippet: null, ...sanitization };
    updates.code = sanitization.sanitized;
  }
  if (page_ids !== undefined) updates.page_ids = JSON.stringify(page_ids);
  if (order_index !== undefined) updates.order_index = order_index;

  logger.info(`[HFCM] Updating template snippet: ${snippetId}`);

  const updated = await HeaderFooterCodeModel.updateByIdReturningRaw(
    snippetId,
    updates
  );

  logger.info(`[HFCM] \u2713 Updated template snippet: ${snippetId}`);

  return { snippet: updated };
}

export async function deleteTemplateSnippet(
  templateId: string,
  snippetId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  // Verify ownership
  const existing = await HeaderFooterCodeModel.findByIdRaw(snippetId);
  if (!existing) {
    return {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Code snippet not found",
      },
    };
  }

  if (existing.template_id !== templateId) {
    return {
      error: {
        status: 403,
        code: "FORBIDDEN",
        message: "This snippet belongs to a different template",
      },
    };
  }

  logger.info(`[HFCM] Deleting template snippet: ${snippetId} (${existing.name})`);

  await HeaderFooterCodeModel.deleteByIdRaw(snippetId);

  logger.info(`[HFCM] \u2713 Deleted template snippet: ${snippetId}`);

  return {};
}

export async function toggleTemplateSnippet(
  templateId: string,
  snippetId: string
): Promise<{
  is_enabled?: boolean;
  error?: { status: number; code: string; message: string };
}> {
  // Verify ownership
  const existing = await HeaderFooterCodeModel.findByIdRaw(snippetId);
  if (!existing) {
    return {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Code snippet not found",
      },
    };
  }

  if (existing.template_id !== templateId) {
    return {
      error: {
        status: 403,
        code: "FORBIDDEN",
        message: "This snippet belongs to a different template",
      },
    };
  }

  const newState = !existing.is_enabled;
  logger.info(
    `[HFCM] Toggling template snippet: ${snippetId} to ${newState ? "enabled" : "disabled"}`
  );

  await HeaderFooterCodeModel.setEnabledById(snippetId, newState);

  logger.info(`[HFCM] \u2713 Toggled template snippet: ${snippetId}`);

  return { is_enabled: newState };
}

export async function reorderTemplateSnippets(
  templateId: string,
  snippetIds: string[]
): Promise<{ error?: { status: number; code: string; message: string } }> {
  if (!Array.isArray(snippetIds)) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "snippetIds must be an array",
      },
    };
  }

  logger.info(`[HFCM] Reordering template snippets for template: ${templateId}`);

  // Use transaction for atomic update
  await HeaderFooterCodeModel.reorderForTemplate(templateId, snippetIds);

  logger.info(`[HFCM] \u2713 Reordered ${snippetIds.length} template snippets`);

  return {};
}

// ---------------------------------------------------------------------------
// Project code snippets
// ---------------------------------------------------------------------------

export async function listProjectSnippets(projectId: string): Promise<any[]> {
  logger.info(`[HFCM] Fetching code snippets for project: ${projectId}`);

  const snippets = await HeaderFooterCodeModel.findByProjectIdRaw(projectId);

  return snippets;
}

export async function createProjectSnippet(
  projectId: string,
  data: { name: string; location: string; code: string; page_ids?: any[]; order_index?: number }
): Promise<{
  snippet: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, location, code, page_ids = [], order_index = 0 } = data;

  // Validate required fields
  const validation = validateSnippetInput({ name, location, code });
  if (validation.error) return { snippet: null, ...validation };

  // Sanitize code
  const sanitization = sanitizeCode(code);
  if (sanitization.error) return { snippet: null, ...sanitization };

  logger.info(`[HFCM] Creating project snippet: ${name} at ${location}`);

  const snippet = await HeaderFooterCodeModel.insertReturning({
    project_id: projectId,
    name,
    location,
    code: sanitization.sanitized,
    page_ids: JSON.stringify(page_ids),
    order_index,
  });

  logger.info(`[HFCM] \u2713 Created project snippet: ${snippet.id}`);

  return { snippet };
}

export async function updateProjectSnippet(
  projectId: string,
  snippetId: string,
  data: { name?: string; location?: string; code?: string; page_ids?: any[]; order_index?: number }
): Promise<{
  snippet: any;
  error?: { status: number; code: string; message: string };
}> {
  const { name, location, code, page_ids, order_index } = data;

  // Verify ownership
  const existing = await HeaderFooterCodeModel.findByIdRaw(snippetId);
  if (!existing) {
    return {
      snippet: null,
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Code snippet not found",
      },
    };
  }

  if (existing.project_id !== projectId) {
    return {
      snippet: null,
      error: {
        status: 403,
        code: "FORBIDDEN",
        message: "This snippet belongs to a different project",
      },
    };
  }

  // Build update object
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (location !== undefined) {
    const locationValidation = validateLocationUpdate(location);
    if (locationValidation.error) return { snippet: null, ...locationValidation };
    updates.location = location;
  }
  if (code !== undefined) {
    const sanitization = sanitizeCode(code);
    if (sanitization.error) return { snippet: null, ...sanitization };
    updates.code = sanitization.sanitized;
  }
  if (page_ids !== undefined) updates.page_ids = JSON.stringify(page_ids);
  if (order_index !== undefined) updates.order_index = order_index;

  logger.info(`[HFCM] Updating project snippet: ${snippetId}`);

  const updated = await HeaderFooterCodeModel.updateByIdReturningRaw(
    snippetId,
    updates
  );

  logger.info(`[HFCM] \u2713 Updated project snippet: ${snippetId}`);

  return { snippet: updated };
}

export async function deleteProjectSnippet(
  projectId: string,
  snippetId: string
): Promise<{ error?: { status: number; code: string; message: string } }> {
  // Verify ownership
  const existing = await HeaderFooterCodeModel.findByIdRaw(snippetId);
  if (!existing) {
    return {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Code snippet not found",
      },
    };
  }

  if (existing.project_id !== projectId) {
    return {
      error: {
        status: 403,
        code: "FORBIDDEN",
        message: "This snippet belongs to a different project",
      },
    };
  }

  logger.info(`[HFCM] Deleting project snippet: ${snippetId} (${existing.name})`);

  await HeaderFooterCodeModel.deleteByIdRaw(snippetId);

  logger.info(`[HFCM] \u2713 Deleted project snippet: ${snippetId}`);

  return {};
}

export async function toggleProjectSnippet(
  projectId: string,
  snippetId: string
): Promise<{
  is_enabled?: boolean;
  error?: { status: number; code: string; message: string };
}> {
  // Verify ownership
  const existing = await HeaderFooterCodeModel.findByIdRaw(snippetId);
  if (!existing) {
    return {
      error: {
        status: 404,
        code: "NOT_FOUND",
        message: "Code snippet not found",
      },
    };
  }

  if (existing.project_id !== projectId) {
    return {
      error: {
        status: 403,
        code: "FORBIDDEN",
        message: "This snippet belongs to a different project",
      },
    };
  }

  const newState = !existing.is_enabled;
  logger.info(
    `[HFCM] Toggling project snippet: ${snippetId} to ${newState ? "enabled" : "disabled"}`
  );

  await HeaderFooterCodeModel.setEnabledById(snippetId, newState);

  logger.info(`[HFCM] \u2713 Toggled project snippet: ${snippetId}`);

  return { is_enabled: newState };
}

export async function reorderProjectSnippets(
  projectId: string,
  snippetIds: string[]
): Promise<{ error?: { status: number; code: string; message: string } }> {
  if (!Array.isArray(snippetIds)) {
    return {
      error: {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "snippetIds must be an array",
      },
    };
  }

  logger.info(`[HFCM] Reordering project snippets for project: ${projectId}`);

  // Use transaction for atomic update
  await HeaderFooterCodeModel.reorderForProject(projectId, snippetIds);

  logger.info(`[HFCM] \u2713 Reordered ${snippetIds.length} project snippets`);

  return {};
}
