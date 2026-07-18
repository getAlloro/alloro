import {
  GbpAutomationSettingsModel,
  IGbpAutomationSettings,
} from "../../../models/GbpAutomationSettingsModel";
import { db } from "../../../database/connection";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { getGbpAutomationQueue } from "../../../workers/queues";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { sanitizeGbpUrl } from "../feature-utils/GbpInputSanitizer";
import { GbpLocalPostDraftService } from "./GbpLocalPostDraftService";
import { GbpReadinessService } from "./GbpReadinessService";
import {
  OrganizationArchivedError,
  OrganizationLifecycleService,
} from "../../../services/OrganizationLifecycleService";

const LOCAL_POST_INTERVAL_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Error codes that mean "there is legitimately nothing to post this cycle" —
 * not a failure. The location stays enabled; we simply advance to the next
 * window. Anything else counts as a real failure.
 */
const NOTHING_TO_POST_CODES = new Set([
  "GBP_POST_NO_CANDIDATE_REVIEW", // no eligible positive review to seed a post
  "REVIEW_NOT_POST_CANDIDATE", // seed review is not a post candidate
  "GBP_NOT_READY", // owner has not finished GBP setup (no property selected)
]);

export interface GbpLocalPostScheduleResult {
  processed: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{
    organizationId: number;
    locationId: number;
    message: string;
  }>;
}

function nextGenerationAt(from = new Date()): Date {
  return new Date(from.getTime() + LOCAL_POST_INTERVAL_DAYS * MS_PER_DAY);
}

function generationWindowFor(settings: IGbpAutomationSettings, now: Date): string {
  const base = settings.next_post_generation_at || now;
  const date = base instanceof Date ? base : new Date(base);
  const safeDate = Number.isNaN(date.getTime()) ? now : date;
  return safeDate.toISOString().slice(0, 10);
}

function requirePostImageUrl(value: unknown): string {
  const imageUrl = sanitizeGbpUrl(value);
  if (!imageUrl) {
    throw new GbpAutomationError(
      "GBP_POST_IMAGE_REQUIRED",
      "Upload a post image before generating a GBP post draft."
    );
  }
  return imageUrl;
}

async function assertOrganizationActive(organizationId: number): Promise<void> {
  try {
    await OrganizationLifecycleService.assertActive(organizationId);
  } catch (error) {
    if (!(error instanceof OrganizationArchivedError)) throw error;
    throw new GbpAutomationError(
      "ORGANIZATION_ARCHIVED",
      "Archived organizations cannot create GBP post drafts."
    );
  }
}

export class GbpLocalPostScheduleService {
  static async generateNow(params: {
    organizationId: number;
    locationId: number;
    userId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
    featuredImageUrl: string;
  }): Promise<IGbpWorkItem> {
    if (
      params.accessibleLocationIds &&
      !params.accessibleLocationIds.includes(params.locationId)
    ) {
      throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
    }
    await assertOrganizationActive(params.organizationId);
    const featuredImageUrl = requirePostImageUrl(params.featuredImageUrl);
    const running = await GbpWorkItemModel.findRunningLocalPostGeneration(
      params.organizationId,
      params.locationId
    );
    if (running) return running;

    const readiness = await GbpReadinessService.getLocationReadiness(
      params.organizationId,
      params.locationId
    );
    if (!readiness.googleProperty) {
      throw new GbpAutomationError("GBP_NOT_READY", "Select a GBP property before creating posts.");
    }

    const generationWindow = `manual:${new Date().toISOString()}`;
    const item = await db.transaction(async (trx) => {
      const created = await GbpWorkItemModel.create({
        organization_id: params.organizationId,
        location_id: params.locationId,
        google_property_id: readiness.googleProperty!.id,
        content_type: "local_post",
        status: "draft",
        draft_content: "",
        featured_image_url: featuredImageUrl,
        created_by_user_id: params.userId,
        metadata: {
          generationStatus: "running",
          generationMode: "manual",
          generationWindow,
          generationQueuedAt: new Date().toISOString(),
          ...(params.actorEmail ? { actorEmail: params.actorEmail } : {}),
        },
      }, trx);

      await GbpWorkEventModel.create({
        work_item_id: created.id,
        actor_user_id: params.userId,
        event_type: "local_post_generation_queued",
        metadata: {
          generationWindow,
          hasFeaturedImage: true,
          ...(params.actorEmail ? { actorEmail: params.actorEmail } : {}),
        },
      }, trx);

      return created;
    });

    try {
      const queue = getGbpAutomationQueue("deployment");
      await queue.add(
        "generate-local-post",
        {
          workItemId: item.id,
          userId: params.userId,
          actorEmail: params.actorEmail || null,
        },
        {
          attempts: 1,
          jobId: `generate-local-post:${item.id}`,
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 50 },
        }
      );
    } catch (error) {
      await GbpWorkItemModel.updateById(item.id, {
        last_error_code: "GBP_POST_GENERATION_QUEUE_FAILED",
        last_error_message: "Could not queue GBP post draft generation.",
        metadata: {
          ...item.metadata,
          generationStatus: "failed",
          generationFailedAt: new Date().toISOString(),
        },
      });
      throw error;
    }

    const settings = await GbpAutomationSettingsModel.findEffectiveForLocation(
      params.organizationId,
      params.locationId
    );
    if (settings?.id) {
      await GbpAutomationSettingsModel.updateById(settings.id, {
        next_post_generation_at: nextGenerationAt(),
      });
    }
    return (await GbpWorkItemModel.findById(item.id)) || item;
  }

  static async processDueSettings(limit = 25): Promise<GbpLocalPostScheduleResult> {
    const now = new Date();
    const dueSettings = await GbpAutomationSettingsModel.listDueLocalPostGeneration(
      now,
      limit
    );
    const result: GbpLocalPostScheduleResult = {
      processed: dueSettings.length,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    for (const settings of dueSettings) {
      if (!settings.location_id) {
        result.skipped += 1;
        continue;
      }

      // Date-scoped, scheduled-namespaced window. If a second scan hits the
      // same location in the same window (e.g. an advance-write raced or
      // failed), createFromBestReview returns the existing draft instead of
      // spawning a fresh LLM generation — the idempotency guard that keeps the
      // hourly scan from duplicating work or cost.
      const generationWindow = `scheduled:${generationWindowFor(settings, now)}`;
      const scheduleMetadata: Record<string, unknown> = {};

      try {
        // Generate a real held DRAFT for owner approval — never auto-publish
        // (owner-control canon). Reuses the same review-seeded generation the
        // manual "generate now" path uses, but text-optional: we honor an
        // owner-set default image when present, else post text-only, which the
        // deploy path (GbpLocalPostDeploymentService.buildPayload) accepts.
        //
        // OPEN POLICY DECISION (documented for Corey — not guessed here):
        //   (1) Image policy for recurring posts. Decision-free default is
        //       text-optional (owner default image if set, else text-only). The
        //       open call is whether scheduled posts should REQUIRE an image or
        //       auto-generate/attach one for engagement.
        //   (2) Content source. Today recurring content is seeded from the
        //       best eligible positive review. A location with no eligible
        //       review produces NO post that cycle (honest skip — we never
        //       fabricate a post). The open call is whether recurring posts
        //       should draw on other sources (services, seasonal, offers).
        const item = await GbpLocalPostDraftService.createFromBestReview({
          organizationId: settings.organization_id,
          locationId: settings.location_id,
          userId: null,
          generationWindow,
          featuredImageUrl: settings.default_featured_image_url ?? null,
        });
        result.created += 1;
        scheduleMetadata.lastLocalPostGeneratedAt = now.toISOString();
        scheduleMetadata.lastLocalPostWorkItemId = item.id;
        scheduleMetadata.lastLocalPostGenerationWindow = generationWindow;
        scheduleMetadata.lastLocalPostSkipReason = null;
      } catch (error) {
        const code = error instanceof GbpAutomationError ? error.code : null;
        if (code && NOTHING_TO_POST_CODES.has(code)) {
          result.skipped += 1;
          scheduleMetadata.lastLocalPostSkipReason = code;
          scheduleMetadata.lastLocalPostSkippedAt = now.toISOString();
          scheduleMetadata.skippedGenerationWindow = generationWindow;
        } else {
          result.failed += 1;
          result.errors.push({
            organizationId: settings.organization_id,
            locationId: settings.location_id,
            message:
              error instanceof Error
                ? error.message
                : "Post draft generation failed.",
          });
          scheduleMetadata.lastLocalPostSkipReason = code || "generation_failed";
          scheduleMetadata.lastLocalPostSkippedAt = now.toISOString();
        }
      }

      // Always advance the window — success, skip, OR failure. The scan runs
      // hourly; without this a due location would be regenerated every hour.
      // Advancing caps generation to at most once per interval per location.
      try {
        await GbpAutomationSettingsModel.updateById(settings.id, {
          next_post_generation_at: nextGenerationAt(now),
          metadata: {
            ...(settings.metadata || {}),
            ...scheduleMetadata,
          },
        });
      } catch (error) {
        // Do not swallow (§3.2). Record it without re-classifying the
        // generation outcome already counted above.
        result.errors.push({
          organizationId: settings.organization_id,
          locationId: settings.location_id,
          message:
            error instanceof Error
              ? `Schedule advance failed: ${error.message}`
              : "Schedule advance failed.",
        });
      }
    }

    return result;
  }
}
