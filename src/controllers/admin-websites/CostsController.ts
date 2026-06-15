/**
 * Admin Websites — Costs Controller
 *
 * Per-project AI cost rollup (events + totals) for the Costs tab.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import { ProjectModel } from "../../models/website-builder/ProjectModel";
import { AiCostEventModel } from "../../models/website-builder/AiCostEventModel";
import logger from "../../lib/logger";

/** GET /:projectId/costs — Per-project AI cost events + totals */
export async function getProjectCosts(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { projectId } = req.params;

    // Confirm project exists so a typo returns 404 instead of an empty list.
    const project = await ProjectModel.findIdOnlyById(projectId);
    if (!project) {
      return res
        .status(404)
        .json({ success: false, error: "NOT_FOUND", message: "Project not found" });
    }

    const events = await AiCostEventModel.findRecentByProjectId(projectId, 100);

    // Totals — sum across the per-project history (not just the visible page).
    const totalsRow = await AiCostEventModel.getTotalsByProjectId(projectId);

    const shapedEvents = events.map((e: any) => ({
      id: e.id,
      event_type: e.event_type,
      vendor: e.vendor,
      model: e.model,
      input_tokens: Number(e.input_tokens),
      output_tokens: Number(e.output_tokens),
      cache_creation_tokens:
        e.cache_creation_tokens != null ? Number(e.cache_creation_tokens) : null,
      cache_read_tokens:
        e.cache_read_tokens != null ? Number(e.cache_read_tokens) : null,
      estimated_cost_usd: Number(e.estimated_cost_usd),
      metadata: e.metadata ?? null,
      parent_event_id: e.parent_event_id ?? null,
      created_at: e.created_at,
    }));

    return res.json({
      success: true,
      data: {
        total_cost_usd: Number(totalsRow?.total_cost_usd || 0),
        total_events: Number(totalsRow?.total_events || 0),
        total_tokens: {
          input: Number(totalsRow?.total_input || 0),
          output: Number(totalsRow?.total_output || 0),
          cache_creation: Number(totalsRow?.total_cache_creation || 0),
          cache_read: Number(totalsRow?.total_cache_read || 0),
        },
        events: shapedEvents,
      },
    });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error fetching project costs:");
    return res
      .status(500)
      .json({ success: false, error: "FETCH_ERROR", message: error?.message });
  }
}

// =====================================================================
// POST IMPORT FROM IDENTITY (T8 + F4)
//
// Admins import doctor / service / location entries discovered during identity
// warmup into website_builder.posts. The HTTP layer enqueues a BullMQ job and
// the client polls for status — see service.post-importer + postImporter.processor.
// =====================================================================

/**
 * POST /:projectId/posts/import — enqueue an import-from-identity job.
 * Body: { postType, entries: Array<string | { source_url, name }>, overwrite?: boolean }
 */
