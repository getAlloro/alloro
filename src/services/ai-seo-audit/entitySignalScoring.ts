import type {
  AiSeoCheckResultInput,
  ExternalEntitySourceInput,
  ExtractedBusinessIdentity,
  OrganizationAuditContext,
  UrlAuditSnapshot,
} from "./types";
import { check } from "./scoringShared";

export function scoreEntity(
  snapshot: UrlAuditSnapshot,
  externalSources: ExternalEntitySourceInput[],
  canonicalIdentity?: ExtractedBusinessIdentity | null,
): AiSeoCheckResultInput[] {
  const hasIdentity = Boolean(snapshot.identity.name || snapshot.identity.phone || snapshot.identity.address);
  const schemaMatch = snapshot.schemaTypes.some((type) => /Organization|LocalBusiness|Dentist|MedicalBusiness/i.test(type));
  const canonicalAvailable = Boolean(canonicalIdentity?.name || canonicalIdentity?.phone || canonicalIdentity?.address);
  const externalConflicts = externalSources.filter((source) => source.entityMatchState === "conflicting");
  const consistentSources = externalSources.filter((source) => source.entityMatchState === "consistent");
  // Any source we could actually read and compare counts as a real reference,
  // regardless of whether some fields looked off (scraped data is noisy).
  const referencedSources = externalSources.filter((source) => source.entityMatchState !== "unavailable");

  return [
    check({
      category: "entity_external_consistency",
      check_id: "entity.site_extractable",
      status: hasIdentity ? "pass" : "fail",
      weight: 5,
      points: hasIdentity ? 5 : 0,
      remediation: "Expose business name, phone, address, website, and profile links visibly on the site.",
      evidence: [{ evidence_type: "site_identity", source: snapshot.finalUrl, value: snapshot.identity as Record<string, unknown> }],
    }),
    check({
      category: "entity_external_consistency",
      check_id: "entity.schema_visible_match",
      status: schemaMatch ? "pass" : snapshot.schemaTypes.length > 0 ? "partial" : "fail",
      weight: 4,
      points: schemaMatch ? 4 : snapshot.schemaTypes.length > 0 ? 2 : 0,
      remediation: "Add Organization or LocalBusiness schema whose fields match visible site content.",
      evidence: [{ evidence_type: "schema_types", source: snapshot.finalUrl, value: { schemaTypes: snapshot.schemaTypes } }],
    }),
    check({
      category: "entity_external_consistency",
      check_id: "entity.connected_canonical_match",
      status: canonicalAvailable ? "pass" : "unavailable",
      weight: 5,
      points: canonicalAvailable ? 5 : 0,
      data_scope: "organization",
      remediation: "Connect or complete Alloro/GBP identity data to confirm which source is authoritative.",
      evidence: [{ evidence_type: "canonical_identity", source: "alloro", value: (canonicalIdentity || {}) as Record<string, unknown> }],
    }),
    check({
      category: "entity_external_consistency",
      check_id: "entity.external_consistency",
      // Being referenced across the web is the positive signal; confirmed matches
      // earn full credit. A noisy "possible mismatch" is advisory, not a failure.
      status: consistentSources.length ? "pass" : referencedSources.length ? "partial" : "unavailable",
      weight: 8,
      points: consistentSources.length ? 8 : referencedSources.length ? 5 : 0,
      data_scope: "external",
      remediation: "Review external listings flagged 'worth double-checking' and fix any genuinely outdated details.",
      evidence: [{ evidence_type: "external_sources", source: "external", value: { total: externalSources.length, conflicts: externalConflicts.length, consistent: consistentSources.length, referenced: referencedSources.length } }],
    }),
    check({
      category: "entity_external_consistency",
      check_id: "entity.high_confidence_mismatch",
      // Possible mismatches are flagged for review, not treated as confirmed
      // errors — directory scraping picks wrong fields too often to hard-fail.
      status: externalConflicts.length ? "partial" : "pass",
      weight: 3,
      points: externalConflicts.length ? 2 : 3,
      data_scope: "external",
      remediation: "Spot-check listings flagged with a possible mismatch — most are formatting or scraping noise, not real errors.",
      evidence: [{ evidence_type: "possible_mismatches", source: "external", value: { count: externalConflicts.length, urls: externalConflicts.map((source) => source.url).slice(0, 5) } }],
    }),
  ];
}

export function scoreConnectedPerformance(
  snapshot: UrlAuditSnapshot,
  organizationContext?: OrganizationAuditContext | null,
): AiSeoCheckResultInput[] {
  const gsc = organizationContext?.gsc;
  const hasGbp = organizationContext?.locations.some((location) => Boolean(location.gbpData)) || false;
  const locationSignalCount = organizationContext?.locations.filter((location) => location.googlePropertyCount > 0).length || 0;
  return [
    check({
      category: "connected_performance",
      check_id: "connected.gsc_active",
      status: gsc ? gsc.hasActiveIntegration ? "pass" : "unavailable" : "unavailable",
      weight: 8,
      points: gsc?.hasActiveIntegration ? 8 : 0,
      method: "integration",
      data_scope: "organization",
      remediation: "Connect and harvest GSC data for this website project.",
      evidence: [{ evidence_type: "gsc_status", source: "gsc", value: { hasActiveIntegration: gsc?.hasActiveIntegration ?? false, latestReportDate: gsc?.latestReportDate ?? null, error: gsc?.error ?? null } }],
    }),
    check({
      category: "connected_performance",
      check_id: "connected.url_gsc_rows",
      status: gsc && gsc.rowsForUrls[snapshot.finalUrl] ? "pass" : gsc ? "partial" : "unavailable",
      weight: 4,
      points: gsc && gsc.rowsForUrls[snapshot.finalUrl] ? 4 : gsc ? 1 : 0,
      method: "integration",
      data_scope: "organization",
      remediation: "Confirm the audited URL appears in GSC page rows after harvest.",
      evidence: [{ evidence_type: "gsc_url_rows", source: "gsc", value: { signal: gsc?.rowsForUrls[snapshot.finalUrl] ?? 0 } }],
    }),
    check({
      category: "connected_performance",
      check_id: "connected.gbp_profile",
      // Missing GBP is a missing integration, not a site deficiency — per the
      // spec it lowers coverage/confidence, never the score.
      status: hasGbp ? "pass" : "unavailable",
      weight: 5,
      points: hasGbp ? 5 : 0,
      method: "integration",
      data_scope: "location",
      remediation: "Connect GBP locations or repair token/scopes so profile data can be scored.",
      evidence: [{ evidence_type: "gbp_profile", source: "gbp", value: { hasGbp, locationSignalCount } }],
    }),
    check({
      category: "connected_performance",
      check_id: "connected.audit_history",
      // No prior audits yet — this is a run-level baseline, not a per-page issue,
      // so report it as unavailable (no data) rather than a partial failure.
      status: "unavailable",
      weight: 3,
      points: 0,
      method: "integration",
      data_scope: "organization",
      remediation: "Run repeat audits after launch to build before/after history.",
      evidence: [{ evidence_type: "audit_history", source: "alloro", value: { firstRunBaseline: true } }],
    }),
  ];
}

export function scoreAuthority(
  externalSources: ExternalEntitySourceInput[],
  organizationContext?: OrganizationAuditContext | null,
): AiSeoCheckResultInput[] {
  const reviewStats = organizationContext?.locations
    .map((location) => extractReviewStats(location.gbpData))
    .filter((stats) => stats.count > 0);
  const consistentExternalCount = externalSources.filter((source) => source.entityMatchState === "consistent").length;
  return [
    check({
      category: "authority_market",
      check_id: "authority.reviews",
      // No connected review data = unavailable (coverage), not a partial penalty.
      status: reviewStats && reviewStats.length > 0 ? "pass" : "unavailable",
      weight: 5,
      points: reviewStats && reviewStats.length > 0 ? 5 : 0,
      method: "integration",
      data_scope: "location",
      remediation: "Improve review volume/freshness or connect GBP review data.",
      evidence: [{ evidence_type: "review_stats", source: "gbp", value: { reviewStats: reviewStats || [] } }],
    }),
    check({
      category: "authority_market",
      check_id: "authority.external_corroboration",
      status: consistentExternalCount > 0 ? "pass" : externalSources.length > 0 ? "partial" : "unavailable",
      weight: 5,
      points: consistentExternalCount > 0 ? 5 : externalSources.length > 0 ? 2 : 0,
      data_scope: "external",
      remediation: "Build or correct external profiles that corroborate the submitted site.",
      evidence: [{ evidence_type: "external_corroboration", source: "external", value: { consistentExternalCount, sourceCount: externalSources.length } }],
    }),
  ];
}

function extractReviewStats(data: Record<string, unknown> | null): {
  count: number;
  rating: number;
} {
  const reviews = data?.reviews as Record<string, unknown> | undefined;
  const allTime = reviews?.allTime as Record<string, unknown> | undefined;
  return {
    count: Number(allTime?.totalReviewCount || 0),
    rating: Number(allTime?.averageRating || 0),
  };
}
