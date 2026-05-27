import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { GooglePropertyModel, IGoogleProperty } from "../../../models/GooglePropertyModel";
import { LocationModel } from "../../../models/LocationModel";
import { GbpSyncHealthModel, IGbpSyncHealth } from "../../../models/GbpSyncHealthModel";
import {
  ReviewModel,
  ReviewReplyOpsMetrics,
  ReviewReplyabilityCounts,
} from "../../../models/website-builder/ReviewModel";
import { GbpCustomizationService } from "./GbpCustomizationService";

export type GbpReadinessStatus =
  | "ready"
  | "feature_disabled"
  | "location_not_found"
  | "reconnect_required"
  | "missing_gbp_property"
  | "missing_business_manage_scope"
  | "no_replyable_reviews"
  | "maps_only_reviews";

export interface GbpReadinessResult {
  status: GbpReadinessStatus;
  ready: boolean;
  actions: string[];
  checks: {
    featureEnabled: boolean;
    reviewRepliesEnabled: boolean;
    postDraftsEnabled: boolean;
    hasGoogleConnection: boolean;
    hasRefreshToken: boolean;
    hasBusinessManageScope: boolean;
    hasSelectedGbpProperty: boolean;
    hasAccountId: boolean;
    hasExternalId: boolean;
  };
  counts: ReviewReplyabilityCounts;
  replyOps: ReviewReplyOpsMetrics;
  googleProperty: IGoogleProperty | null;
  nextPostGenerationAt: Date | null;
  syncHealth: IGbpSyncHealth | null;
  postSyncHealth: IGbpSyncHealth | null;
}

function hasBusinessManageScope(scopes: string | null): boolean {
  return Boolean(scopes && scopes.includes("business.manage"));
}

function buildStatus(
  checks: GbpReadinessResult["checks"],
  counts: ReviewReplyabilityCounts
): GbpReadinessStatus {
  if (!checks.hasSelectedGbpProperty || !checks.hasAccountId || !checks.hasExternalId) {
    return "missing_gbp_property";
  }
  if (!checks.hasGoogleConnection || !checks.hasRefreshToken) return "reconnect_required";
  if (!checks.hasBusinessManageScope) return "missing_business_manage_scope";
  if (!checks.featureEnabled) return "feature_disabled";
  if (counts.replyable_oauth > 0) return "ready";
  if (counts.maps_only > 0) return "maps_only_reviews";
  return "no_replyable_reviews";
}

function actionsForStatus(status: GbpReadinessStatus): string[] {
  const actions: Record<GbpReadinessStatus, string[]> = {
    ready: ["Generate a draft from an OAuth-synced review."],
    feature_disabled: ["Enable GBP review replies for this organization or location."],
    location_not_found: ["Select a valid organization location."],
    reconnect_required: ["Reconnect Google so Alloro has a refresh token."],
    missing_gbp_property: ["Select a Google Business Profile for this location."],
    missing_business_manage_scope: ["Reconnect Google with the business.manage scope."],
    no_replyable_reviews: ["Sync Google reviews or wait for a new review without an owner reply."],
    maps_only_reviews: ["Sync official GBP reviews; Maps/Apify-only reviews cannot be replied to."],
  };
  return actions[status];
}

export class GbpReadinessService {
  static async getLocationReadiness(
    organizationId: number,
    locationId: number
  ): Promise<GbpReadinessResult> {
    const location = await LocationModel.findById(locationId);
    const emptyCounts: ReviewReplyabilityCounts = {
      total: 0,
      replyable_oauth: 0,
      replyable_oauth_last_30d: 0,
      oauth_already_replied: 0,
      maps_only: 0,
      hidden: 0,
    };
    const emptyReplyOps: ReviewReplyOpsMetrics = {
      totalOauthReviews: 0,
      totalUnreplied: 0,
      unrepliedLast30d: 0,
      unrepliedOver7d: 0,
      unrepliedOver30d: 0,
      oldestUnrepliedAt: null,
      averageReplyHours: null,
      averageReplyDays: null,
      medianReplyDays: null,
      replyCoveragePercent: 0,
    };

    if (!location || location.organization_id !== organizationId) {
      return {
        status: "location_not_found",
        ready: false,
        actions: actionsForStatus("location_not_found"),
        checks: {
          featureEnabled: false,
          reviewRepliesEnabled: false,
          postDraftsEnabled: false,
          hasGoogleConnection: false,
          hasRefreshToken: false,
          hasBusinessManageScope: false,
          hasSelectedGbpProperty: false,
          hasAccountId: false,
          hasExternalId: false,
        },
        counts: emptyCounts,
        replyOps: emptyReplyOps,
        googleProperty: null,
        nextPostGenerationAt: null,
        syncHealth: null,
        postSyncHealth: null,
      };
    }

    const settings = await GbpCustomizationService.getEffectiveSettings(
      organizationId,
      locationId
    );
    const googleProperty = await GooglePropertyModel.findSelectedGbpByLocationId(locationId);
    const connection = googleProperty
      ? await GoogleConnectionModel.findByIdForOrganization(
          googleProperty.google_connection_id,
          organizationId
        )
      : undefined;
    const [counts, replyOps, syncHealth, postSyncHealth] = await Promise.all([
      ReviewModel.getReplyabilityCounts(locationId),
      ReviewModel.getReplyOpsMetrics(locationId),
      GbpSyncHealthModel.latestForLocation(locationId),
      GbpSyncHealthModel.latestForLocation(locationId, "local_posts"),
    ]);

    const checks = {
      featureEnabled: Boolean(settings?.review_reply_enabled),
      reviewRepliesEnabled: Boolean(settings?.review_reply_enabled),
      postDraftsEnabled: Boolean(settings?.local_post_generation_enabled),
      hasGoogleConnection: Boolean(connection),
      hasRefreshToken: Boolean(connection?.refresh_token),
      hasBusinessManageScope: Boolean(connection && hasBusinessManageScope(connection.scopes)),
      hasSelectedGbpProperty: Boolean(googleProperty),
      hasAccountId: Boolean(googleProperty?.account_id),
      hasExternalId: Boolean(googleProperty?.external_id),
    };
    const status = buildStatus(checks, counts);

    return {
      status,
      ready: status === "ready",
      actions: actionsForStatus(status),
      checks,
      counts,
      replyOps,
      googleProperty: googleProperty || null,
      nextPostGenerationAt: settings?.next_post_generation_at || null,
      syncHealth: syncHealth || null,
      postSyncHealth: postSyncHealth || null,
    };
  }
}
