/**
 * Admin Websites — Identity Slice Controller
 *
 * Surgical per-slice edit for project_identity, enforcing an allow-list of slices.
 *
 * Behavior-preserving split from the former monolithic AdminWebsitesController.
 * Handlers and helpers are moved verbatim; logic is unchanged. Bound by the
 * matching resource sub-router under src/routes/admin/websites/.
 */

import { Request, Response } from "express";
import { z } from "zod";
import { ProjectIdentityModel } from "../../models/website-builder/ProjectIdentityModel";
import logger from "../../lib/logger";

const doctorSliceSchema = z
  .object({
    name: z.string().min(1),
    source_url: z.string().nullable().optional(),
    short_blurb: z.string().nullable().optional(),
    credentials: z.array(z.string()).nullable().optional(),
    location_place_ids: z.array(z.string()).nullable().optional(),
    last_synced_at: z.string().nullable().optional(),
    stale: z.boolean().optional(),
  })
  .strict();

const serviceSliceSchema = z
  .object({
    name: z.string().min(1),
    source_url: z.string().nullable().optional(),
    short_blurb: z.string().nullable().optional(),
    category: z.string().nullable().optional(),
    location_place_ids: z.array(z.string()).nullable().optional(),
    last_synced_at: z.string().nullable().optional(),
    stale: z.boolean().optional(),
  })
  .strict();

const looseObject = z.record(z.string(), z.unknown());

const IDENTITY_SLICE_VALIDATORS: Record<string, z.ZodTypeAny> = {
  "content_essentials.doctors": z.array(doctorSliceSchema),
  "content_essentials.services": z.array(serviceSliceSchema),
  "content_essentials.featured_testimonials": z.array(z.unknown()),
  "content_essentials.core_values": z.array(z.unknown()),
  "content_essentials.certifications": z.array(z.unknown()),
  "content_essentials.service_areas": z.array(z.unknown()),
  "content_essentials.social_links": z.array(z.unknown()),
  "content_essentials.unique_value_proposition": z
    .union([z.string(), z.null()]),
  "content_essentials.founding_story": z.union([z.string(), z.null()]),
  "content_essentials.review_themes": z.array(z.unknown()),
  locations: z.array(z.unknown()),
  brand: looseObject,
  voice_and_tone: looseObject,
};

/** Deep-set a value at a dotted path in `target`, mutating intermediates. */

/** Deep-set a value at a dotted path in `target`, mutating intermediates. */
function setAtPath(target: any, dottedPath: string, value: unknown): void {
  const keys = dottedPath.split(".");
  let cursor = target;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (
      cursor[key] === null ||
      cursor[key] === undefined ||
      typeof cursor[key] !== "object"
    ) {
      cursor[key] = {};
    }
    cursor = cursor[key];
  }
  cursor[keys[keys.length - 1]] = value;
}

/** PATCH /:id/identity/slice — Surgical per-slice edit with Zod validation. */

/** PATCH /:id/identity/slice — Surgical per-slice edit with Zod validation. */
export async function patchIdentitySlice(
  req: Request,
  res: Response,
): Promise<Response> {
  try {
    const { id } = req.params;
    const { path: slicePath, value } = req.body || {};

    if (!slicePath || typeof slicePath !== "string") {
      return res.status(400).json({
        success: false,
        error: "INVALID_INPUT",
        message: "path string required",
      });
    }

    const validator = IDENTITY_SLICE_VALIDATORS[slicePath];
    if (!validator) {
      return res.status(400).json({
        success: false,
        error: "INVALID_PATH",
        message: `path "${slicePath}" is not in the slice allow-list`,
      });
    }

    const parsed = validator.safeParse(value);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: "INVALID_SHAPE",
        message: `value does not match the expected shape for "${slicePath}"`,
        details: parsed.error.issues,
      });
    }

    const { exists, identity } =
      await ProjectIdentityModel.findEnvelopeByProjectId(id);

    if (!exists) {
      return res.status(404).json({ success: false, error: "NOT_FOUND" });
    }

    const nextIdentity = identity || { version: 1 };

    setAtPath(nextIdentity, slicePath, parsed.data);

    await ProjectIdentityModel.updateByProjectId(
      id,
      nextIdentity,
      { mirrorBrand: slicePath === "brand" },
    );

    return res.json({ success: true, data: nextIdentity });
  } catch (error: any) {
    logger.error({ err: error }, "[Admin Websites] Error patching identity slice:");
    return res.status(500).json({
      success: false,
      error: "PATCH_SLICE_ERROR",
      message: error?.message || "Failed to patch identity slice",
    });
  }
}
