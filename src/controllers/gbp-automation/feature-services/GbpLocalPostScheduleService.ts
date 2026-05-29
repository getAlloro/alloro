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
import { GbpReadinessService } from "./GbpReadinessService";

const LOCAL_POST_INTERVAL_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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

      try {
        await GbpAutomationSettingsModel.updateById(settings.id, {
          next_post_generation_at: nextGenerationAt(now),
          metadata: {
            ...(settings.metadata || {}),
            lastLocalPostSkipReason: "per_post_image_required",
            lastLocalPostSkippedAt: now.toISOString(),
            skippedGenerationWindow: generationWindowFor(settings, now),
          },
        });
        result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        result.errors.push({
          organizationId: settings.organization_id,
          locationId: settings.location_id,
          message:
            error instanceof Error
              ? error.message
              : "Post draft schedule skip failed.",
        });
      }
    }

    return result;
  }
}
