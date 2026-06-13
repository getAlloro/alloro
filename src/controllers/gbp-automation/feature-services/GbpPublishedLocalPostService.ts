import { getValidOAuth2ClientByConnection } from "../../../auth/oauth2Helper";
import { db } from "../../../database/connection";
import { QueryContext } from "../../../models/BaseModel";
import { GbpLocalPostModel, IGbpLocalPost } from "../../../models/GbpLocalPostModel";
import {
  GbpSyncHealthModel,
  GbpSyncSource,
  IGbpSyncHealth,
} from "../../../models/GbpSyncHealthModel";
import { GooglePropertyModel, IGoogleProperty } from "../../../models/GooglePropertyModel";
import { GbpWorkEventModel } from "../../../models/GbpWorkEventModel";
import { GbpWorkItemModel, IGbpWorkItem } from "../../../models/GbpWorkItemModel";
import { LocationModel } from "../../../models/LocationModel";
import {
  deleteGbpLocalPost,
  GbpLocalPostPayload,
  listGbpLocalPosts,
  updateGbpLocalPost,
} from "../../gbp/gbp-services/gbp-write.service";
import { GbpAutomationError } from "../feature-utils/GbpAutomationError";
import { sanitizeGbpText, sanitizeGbpUrl } from "../feature-utils/GbpInputSanitizer";
import { GbpLocalPostSafetyService } from "./GbpLocalPostSafetyService";
import {
  OrganizationArchivedError,
  OrganizationLifecycleService,
} from "../../../services/OrganizationLifecycleService";

const MAX_GOOGLE_POSTS = 1000;

type SyncAllLocalPostsResult = {
  syncedCount: number;
  syncedLocations: number;
  failedLocations: number;
};

export type GbpPublishedLocalPost = {
  name: string;
  postId: string;
  summary: string;
  topicType: string;
  state: string;
  createTime: string | null;
  updateTime: string | null;
  searchUrl: string | null;
  featuredImageUrl: string | null;
  media: Array<Record<string, unknown>>;
  callToAction: Record<string, unknown> | null;
  lastSyncedAt: string | null;
};

export type GbpPublishedLocalPostsList = {
  posts: GbpPublishedLocalPost[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  syncHealth: IGbpSyncHealth | null;
};

function googleLocationParent(property: IGoogleProperty): string {
  if (!property.account_id || !property.external_id) {
    throw new GbpAutomationError(
      "GBP_PROPERTY_MISSING",
      "GBP property is missing its Google account or location id."
    );
  }
  return `accounts/${property.account_id}/locations/${property.external_id}`;
}

function assertPostBelongsToParent(postName: string, parentName: string): void {
  if (!postName.startsWith(`${parentName}/localPosts/`)) {
    throw new GbpAutomationError(
      "GBP_LOCAL_POST_SCOPE_DENIED",
      "This post does not belong to the selected GBP location."
    );
  }
}

const MEDIA_URL_FIELDS = ["sourceUrl", "googleUrl", "thumbnailUrl"] as const;

function sourceUrlFromMedia(media: Array<Record<string, unknown>>): string | null {
  for (const item of media) {
    for (const field of MEDIA_URL_FIELDS) {
      const value = item[field];
      if (typeof value === "string" && value.trim()) return value;
    }
  }
  return null;
}

function dateFromGoogle(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeGoogleLocalPost(post: Record<string, unknown>): GbpPublishedLocalPost {
  const name = typeof post.name === "string" ? post.name : "";
  const media = Array.isArray(post.media)
    ? post.media.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object")
      )
    : [];

  return {
    name,
    postId: name.split("/").pop() || "",
    summary: typeof post.summary === "string" ? post.summary : "",
    topicType: typeof post.topicType === "string" ? post.topicType : "STANDARD",
    state: typeof post.state === "string" ? post.state : "UNKNOWN",
    createTime: typeof post.createTime === "string" ? post.createTime : null,
    updateTime: typeof post.updateTime === "string" ? post.updateTime : null,
    searchUrl: typeof post.searchUrl === "string" ? post.searchUrl : null,
    featuredImageUrl: sourceUrlFromMedia(media),
    media,
    callToAction:
      post.callToAction && typeof post.callToAction === "object"
        ? (post.callToAction as Record<string, unknown>)
        : null,
    lastSyncedAt: null,
  };
}

function normalizeDbLocalPost(post: IGbpLocalPost): GbpPublishedLocalPost {
  const googleSearchUrl =
    typeof post.google_response?.searchUrl === "string"
      ? post.google_response.searchUrl
      : null;

  return {
    name: post.google_resource_name,
    postId: post.google_post_id,
    summary: post.summary,
    topicType: post.topic_type,
    state: post.state,
    createTime: post.create_time ? post.create_time.toISOString() : null,
    updateTime: post.update_time ? post.update_time.toISOString() : null,
    searchUrl: post.search_url || googleSearchUrl,
    featuredImageUrl: post.featured_image_url || sourceUrlFromMedia(post.media || []),
    media: post.media || [],
    callToAction: post.call_to_action,
    lastSyncedAt: post.last_synced_at ? post.last_synced_at.toISOString() : null,
  };
}

function dbPostAsGoogleResponse(post: IGbpLocalPost): Record<string, unknown> {
  return {
    ...(post.google_response || {}),
    name: post.google_resource_name,
    summary: post.summary,
    topicType: post.topic_type,
    state: post.state,
    searchUrl: post.search_url || undefined,
    media: post.media || [],
    callToAction: post.call_to_action || undefined,
    createTime: post.create_time ? post.create_time.toISOString() : undefined,
    updateTime: post.update_time ? post.update_time.toISOString() : undefined,
  };
}

function mergeGooglePatchResponse(params: {
  postName: string;
  googleResponse: Record<string, unknown>;
  existingPost?: IGbpLocalPost;
  summary: string;
  featuredImageUrl: string | null;
}): Record<string, unknown> {
  const base = params.existingPost ? dbPostAsGoogleResponse(params.existingPost) : {};
  const merged: Record<string, unknown> = {
    ...base,
    ...params.googleResponse,
    name: params.postName,
    summary: params.summary,
  };

  if (!merged.searchUrl && params.existingPost?.search_url) {
    merged.searchUrl = params.existingPost.search_url;
  }
  if (!merged.topicType && params.existingPost?.topic_type) {
    merged.topicType = params.existingPost.topic_type;
  }
  if (!merged.state && params.existingPost?.state) {
    merged.state = params.existingPost.state;
  }
  if (!Array.isArray(merged.media) || merged.media.length === 0) {
    if (params.existingPost?.media?.length) {
      merged.media = params.existingPost.media;
    } else if (params.featuredImageUrl) {
      merged.media = [{ mediaFormat: "PHOTO", sourceUrl: params.featuredImageUrl }];
    }
  }

  return merged;
}

async function upsertGoogleLocalPost(
  params: {
    organizationId: number;
    locationId: number;
    googlePropertyId: number | null;
    post: Record<string, unknown>;
  },
  trx?: QueryContext
) {
  const normalized = normalizeGoogleLocalPost(params.post);
  if (!normalized.name) return null;
  return GbpLocalPostModel.upsertFromGoogle(
    {
      organizationId: params.organizationId,
      locationId: params.locationId,
      googlePropertyId: params.googlePropertyId,
      googleResourceName: normalized.name,
      googlePostId: normalized.postId,
      topicType: normalized.topicType,
      state: normalized.state,
      summary: normalized.summary,
      featuredImageUrl: normalized.featuredImageUrl,
      searchUrl: normalized.searchUrl,
      media: normalized.media,
      callToAction: normalized.callToAction,
      googleResponse: params.post,
      createTime: dateFromGoogle(params.post.createTime),
      updateTime: dateFromGoogle(params.post.updateTime),
    },
    trx
  );
}

async function getScopedProperty(params: {
  organizationId: number;
  locationId: number;
  accessibleLocationIds?: number[];
}): Promise<IGoogleProperty> {
  try {
    await OrganizationLifecycleService.assertActive(params.organizationId);
  } catch (error) {
    if (!(error instanceof OrganizationArchivedError)) throw error;
    throw new GbpAutomationError(
      "ORGANIZATION_ARCHIVED",
      "Archived organizations cannot sync or manage GBP local posts."
    );
  }

  if (
    params.accessibleLocationIds &&
    !params.accessibleLocationIds.includes(params.locationId)
  ) {
    throw new GbpAutomationError("LOCATION_ACCESS_DENIED", "No access to this location.");
  }

  const location = await LocationModel.findById(params.locationId);
  if (!location || location.organization_id !== params.organizationId) {
    throw new GbpAutomationError("LOCATION_NOT_FOUND", "Location not found for this organization.");
  }

  const property = await GooglePropertyModel.findSelectedGbpByLocationId(params.locationId);
  if (!property || !property.account_id || !property.external_id) {
    throw new GbpAutomationError("GBP_PROPERTY_MISSING", "Selected GBP property missing.");
  }

  return property;
}

function buildPayload(
  summary: string,
  featuredImageUrl: string | null
): GbpLocalPostPayload {
  // Photo is optional — omit the media key entirely for text-only posts.
  return {
    topicType: "STANDARD",
    summary,
    ...(featuredImageUrl
      ? {
          media: [
            {
              mediaFormat: "PHOTO" as const,
              sourceUrl: featuredImageUrl,
            },
          ],
        }
      : {}),
  };
}

async function findMatchingWorkItem(
  organizationId: number,
  locationId: number,
  postName: string
): Promise<IGbpWorkItem | undefined> {
  return GbpWorkItemModel.findPublishedLocalPostByGoogleResourceName(
    organizationId,
    locationId,
    postName
  );
}

async function reconcileUpdatedWorkItem(params: {
  workItem?: IGbpWorkItem;
  actorUserId: number | null;
  actorEmail?: string | null;
  postName: string;
  summary: string;
  featuredImageUrl: string | null;
  googleResponse: Record<string, unknown>;
}): Promise<void> {
  if (!params.workItem) return;
  const metadata = {
    ...(params.workItem.metadata || {}),
    googlePostLastEditedAt: new Date().toISOString(),
    googlePostEditedFromManager: true,
  };
  await db.transaction(async (trx) => {
    await GbpWorkItemModel.syncPublishedLocalPost(
      params.workItem!.id,
      {
        publishedContent: params.summary,
        localPostPayload: buildPayload(
          params.summary,
          params.featuredImageUrl
        ) as unknown as Record<string, unknown>,
        featuredImageUrl: params.featuredImageUrl,
        googleResponse: params.googleResponse,
        metadata,
      },
      trx
    );
    await GbpWorkEventModel.create({
      work_item_id: params.workItem!.id,
      actor_user_id: params.actorUserId,
      event_type: "local_post_google_updated",
      metadata: {
        googleResourceName: params.postName,
        actorEmail: params.actorEmail || null,
      },
    }, trx);
  });
}

async function reconcileDeletedWorkItem(params: {
  workItem?: IGbpWorkItem;
  actorUserId: number | null;
  actorEmail?: string | null;
  postName: string;
  googleResponse: Record<string, unknown>;
}): Promise<void> {
  if (!params.workItem) return;
  const metadata = {
    ...(params.workItem.metadata || {}),
    googlePostDeletedAt: new Date().toISOString(),
    googlePostDeletedFromManager: true,
    googleDeleteResponse: params.googleResponse,
  };
  await db.transaction(async (trx) => {
    await GbpWorkItemModel.markPublishedLocalPostDeleted(
      params.workItem!.id,
      params.actorUserId,
      metadata,
      trx
    );
    await GbpWorkEventModel.create({
      work_item_id: params.workItem!.id,
      actor_user_id: params.actorUserId,
      event_type: "local_post_google_deleted",
      metadata: {
        googleResourceName: params.postName,
        actorEmail: params.actorEmail || null,
      },
    }, trx);
  });
}

export class GbpPublishedLocalPostService {
  static async list(params: {
    organizationId: number;
    locationId: number;
    accessibleLocationIds?: number[];
    page?: number;
    limit?: number;
  }): Promise<GbpPublishedLocalPostsList> {
    await getScopedProperty(params);
    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 10, 1), 50);
    const [result, syncHealth] = await Promise.all([
      GbpLocalPostModel.listForLocation({
        organizationId: params.organizationId,
        locationId: params.locationId,
        page,
        limit,
      }),
      GbpSyncHealthModel.latestForLocation(params.locationId, "local_posts"),
    ]);

    return {
      posts: result.data.map(normalizeDbLocalPost),
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(Math.ceil(result.total / limit), 1),
      },
      syncHealth: syncHealth || null,
    };
  }

  static async sync(params: {
    organizationId: number;
    locationId: number;
    accessibleLocationIds?: number[];
    syncSource?: GbpSyncSource;
    jobId?: string | null;
    jobName?: string | null;
  }): Promise<{ syncedCount: number; syncHealth: IGbpSyncHealth }> {
    const property = await getScopedProperty(params);
    const syncSource = params.syncSource || "manual";
    const syncMetadata = {
      syncSource,
      jobId: params.jobId || null,
      jobName: params.jobName || null,
    };
    const syncHealth = await GbpSyncHealthModel.markStarted({
      organizationId: params.organizationId,
      locationId: params.locationId,
      googlePropertyId: property.id,
      syncType: "local_posts",
      metadata: syncMetadata,
    });
    const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
    const parentName = googleLocationParent(property);
    const posts: Record<string, unknown>[] = [];
    let pageToken: string | null = null;

    try {
      do {
        const page = await listGbpLocalPosts(auth, parentName, pageToken, 100);
        posts.push(...page.posts);
        pageToken = page.nextPageToken;
      } while (pageToken && posts.length < MAX_GOOGLE_POSTS);

      const resourceNames: string[] = [];
      await db.transaction(async (trx) => {
        for (const post of posts) {
          const synced = await upsertGoogleLocalPost({
            organizationId: params.organizationId,
            locationId: params.locationId,
            googlePropertyId: property.id,
            post,
          }, trx);
          if (synced) resourceNames.push(synced.google_resource_name);
        }
        await GbpLocalPostModel.markMissingAsDeleted(
          params.organizationId,
          params.locationId,
          resourceNames,
          trx
        );
        await GbpSyncHealthModel.markSucceeded(
          syncHealth.id,
          resourceNames.length,
          { ...syncMetadata, fetchedCount: posts.length },
          trx
        );
      });

      const updatedSyncHealth = await GbpSyncHealthModel.findById(syncHealth.id);
      return { syncedCount: resourceNames.length, syncHealth: updatedSyncHealth };
    } catch (error) {
      const err = error as { code?: string; message?: string; details?: unknown };
      await GbpSyncHealthModel.markFailed(
        syncHealth.id,
        err.code || "GBP_LOCAL_POST_SYNC_FAILED",
        err.message || "GBP posts sync failed.",
        err.details
          ? { ...syncMetadata, details: err.details as Record<string, unknown> }
          : syncMetadata
      );
      throw error;
    }
  }

  static async syncAll(params: {
    organizationId?: number;
    locationId?: number;
    limit?: number;
    syncSource?: GbpSyncSource;
    jobId?: string | null;
    jobName?: string | null;
  } = {}): Promise<SyncAllLocalPostsResult> {
    let query = db("google_properties as gp")
      .join("google_connections as gc", "gp.google_connection_id", "gc.id")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("gp.type", "gbp")
      .where("gp.selected", true)
      .whereNotNull("gp.location_id")
      .whereNull("o.archived_at")
      .select(
        "gc.organization_id as organization_id",
        "gp.location_id as location_id"
      )
      .orderBy("gp.location_id", "asc");

    if (params.organizationId) query = query.where("gc.organization_id", params.organizationId);
    if (params.locationId) query = query.where("gp.location_id", params.locationId);
    if (params.limit) query = query.limit(Math.min(Math.max(params.limit, 1), 500));

    const rows = await query;
    let syncedCount = 0;
    let syncedLocations = 0;
    let failedLocations = 0;

    for (const row of rows) {
      try {
        const result = await this.sync({
          organizationId: Number(row.organization_id),
          locationId: Number(row.location_id),
          syncSource: params.syncSource || "auto",
          jobId: params.jobId || null,
          jobName: params.jobName || null,
        });
        syncedCount += result.syncedCount;
        syncedLocations += 1;
      } catch (error) {
        failedLocations += 1;
        const message = error instanceof Error ? error.message : "Unknown sync error";
        console.error(
          `[GBP-POST-SYNC] Location ${row.location_id} failed during auto sync: ${message}`
        );
      }
    }

    return { syncedCount, syncedLocations, failedLocations };
  }

  static async update(params: {
    organizationId: number;
    locationId: number;
    postName: string;
    summary: string;
    featuredImageUrl: string | null;
    actorUserId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
  }): Promise<GbpPublishedLocalPost> {
    const property = await getScopedProperty(params);
    const parentName = googleLocationParent(property);
    assertPostBelongsToParent(params.postName, parentName);

    const summary = sanitizeGbpText(params.summary, 2000) || "";
    const featuredImageUrl = sanitizeGbpUrl(params.featuredImageUrl) || null;
    const safety = GbpLocalPostSafetyService.validateLocalPost(summary, featuredImageUrl);
    if (!safety.isSafe) {
      throw new GbpAutomationError("UNSAFE_POST_CONTENT", "Post content failed safety checks.", {
        reasons: safety.reasons,
        reasonCodes: safety.reasonCodes,
      });
    }

    const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
    const existingPost = await GbpLocalPostModel.findByGoogleResourceName(params.postName);
    const currentImageUrl = existingPost
      ? existingPost.featured_image_url || sourceUrlFromMedia(existingPost.media || [])
      : null;
    // Text-only posts are editable without an image, but an existing image
    // cannot be REMOVED via Google's update API — only replaced.
    if (currentImageUrl && !featuredImageUrl) {
      throw new GbpAutomationError(
        "GBP_POST_IMAGE_REQUIRED",
        "This Google post already has an image. Upload a replacement instead of removing it."
      );
    }
    const shouldUpdateMedia =
      Boolean(featuredImageUrl) && featuredImageUrl !== currentImageUrl;
    const payload = buildPayload(summary, featuredImageUrl);
    const googleResponse = await updateGbpLocalPost(auth, params.postName, payload, {
      updateMedia: shouldUpdateMedia,
    });
    const responseForSync = mergeGooglePatchResponse({
      postName: params.postName,
      googleResponse,
      existingPost,
      summary,
      featuredImageUrl,
    });
    await upsertGoogleLocalPost({
      organizationId: params.organizationId,
      locationId: params.locationId,
      googlePropertyId: property.id,
      post: responseForSync,
    });
    const workItem = await findMatchingWorkItem(
      params.organizationId,
      params.locationId,
      params.postName
    );
    await reconcileUpdatedWorkItem({
      workItem,
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      postName: params.postName,
      summary,
      featuredImageUrl,
      googleResponse: responseForSync,
    });

    return normalizeGoogleLocalPost(responseForSync);
  }

  static async delete(params: {
    organizationId: number;
    locationId: number;
    postName: string;
    actorUserId: number | null;
    actorEmail?: string | null;
    accessibleLocationIds?: number[];
  }): Promise<{ deleted: true; postName: string }> {
    const property = await getScopedProperty(params);
    const parentName = googleLocationParent(property);
    assertPostBelongsToParent(params.postName, parentName);

    const auth = await getValidOAuth2ClientByConnection(property.google_connection_id);
    const workItem = await findMatchingWorkItem(
      params.organizationId,
      params.locationId,
      params.postName
    );
    const googleResponse = await deleteGbpLocalPost(auth, params.postName);
    await GbpLocalPostModel.markDeletedByGoogleResourceName(params.postName);
    await reconcileDeletedWorkItem({
      workItem,
      actorUserId: params.actorUserId,
      actorEmail: params.actorEmail,
      postName: params.postName,
      googleResponse,
    });

    return { deleted: true, postName: params.postName };
  }
}
