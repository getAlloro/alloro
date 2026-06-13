import type { AiSeoCheckResultInput, UrlAuditSnapshot } from "./types";
import { check, normalizeUrl } from "./scoringShared";

export function scoreAccess(snapshot: UrlAuditSnapshot): AiSeoCheckResultInput[] {
  const metaRobots = snapshot.metaRobots?.toLowerCase() || "";
  const canonicalMatches = snapshot.canonicalUrl
    ? normalizeUrl(snapshot.canonicalUrl) === normalizeUrl(snapshot.finalUrl)
    : false;

  return [
    check({
      category: "access_indexability",
      check_id: "access.final_status",
      status: snapshot.ok ? "pass" : "fail",
      weight: 5,
      points: snapshot.ok ? 5 : 0,
      remediation: "Fix response status and redirect chain so the final audited URL resolves successfully.",
      evidence: [{ evidence_type: "http_status", source: snapshot.finalUrl, value: { status: snapshot.finalStatus } }],
    }),
    check({
      category: "access_indexability",
      check_id: "access.robots_allowed",
      status: snapshot.isBlockedByRobots ? "fail" : "pass",
      weight: 5,
      points: snapshot.isBlockedByRobots ? 0 : 5,
      remediation: "Update robots.txt or CDN controls so search crawlers can access the page.",
      evidence: [{ evidence_type: "robots", source: `${new URL(snapshot.finalUrl).origin}/robots.txt`, excerpt: snapshot.robotsTxt?.slice(0, 500) || null }],
    }),
    check({
      category: "access_indexability",
      check_id: "access.indexable_snippet_eligible",
      status: /noindex|nosnippet/.test(metaRobots) ? "fail" : "pass",
      weight: 5,
      points: /noindex|nosnippet/.test(metaRobots) ? 0 : 5,
      remediation: "Remove accidental noindex or nosnippet directives unless this page is intentionally excluded.",
      evidence: [{ evidence_type: "meta_robots", source: snapshot.finalUrl, value: { metaRobots: snapshot.metaRobots } }],
    }),
    check({
      category: "access_indexability",
      check_id: "access.canonical",
      status: canonicalMatches ? "pass" : snapshot.canonicalUrl ? "partial" : "fail",
      weight: 4,
      points: canonicalMatches ? 4 : snapshot.canonicalUrl ? 2 : 0,
      remediation: "Add a self-referencing canonical or document why this URL should canonicalize elsewhere.",
      evidence: [{ evidence_type: "canonical", source: snapshot.finalUrl, value: { canonicalUrl: snapshot.canonicalUrl } }],
    }),
    check({
      category: "access_indexability",
      check_id: "access.discovery",
      status: snapshot.isInSitemap || snapshot.internalLinks.length > 3 ? "pass" : "partial",
      weight: 3,
      points: snapshot.isInSitemap || snapshot.internalLinks.length > 3 ? 3 : 1.5,
      remediation: "Ensure this URL appears in the sitemap and has meaningful internal links.",
      evidence: [{ evidence_type: "discovery", source: snapshot.finalUrl, value: { isInSitemap: snapshot.isInSitemap, internalLinkCount: snapshot.internalLinks.length } }],
    }),
    check({
      category: "access_indexability",
      check_id: "access.rendered_text",
      status: snapshot.text.length > 600 ? "pass" : snapshot.text.length > 150 ? "partial" : "fail",
      weight: 3,
      points: snapshot.text.length > 600 ? 3 : snapshot.text.length > 150 ? 1.5 : 0,
      remediation: "Make core content available as rendered text, not only images or scripts.",
      evidence: [{ evidence_type: "rendered_text", source: snapshot.finalUrl, value: { characterCount: snapshot.text.length } }],
    }),
  ];
}

export function scorePageSource(snapshot: UrlAuditSnapshot): AiSeoCheckResultInput[] {
  const lowerText = snapshot.text.toLowerCase();
  const evidenceUnitCount = [
    /\bwhat is\b|\bwhat are\b|\bhow does\b/.test(lowerText),
    /\bfaq\b|frequently asked questions/.test(lowerText),
    /\b\d+(?:%| percent|\+| years?| patients?| reviews?)\b/.test(lowerText),
    /<ol\b|<ul\b/i.test(snapshot.html),
    /\bcompared with\b|\bvs\.?\b|\bversus\b/.test(lowerText),
  ].filter(Boolean).length;
  const schemaAligned = snapshot.schemaTypes.length > 0;
  // Legal/utility pages (HIPAA notices, accessibility statements, …) will never
  // carry FAQs, provider names, or service language — judging them by the
  // service-page rubric just manufactures Partial noise. Those checks are N/A.
  const isUtility = isUtilityPage(snapshot.finalUrl);
  // Only flag genuinely unsupported claims. Bare "best" is too common in dental
  // copy ("best smile", "best care") to be a useful signal on its own.
  const hasRiskyClaim =
    /\bguaranteed\b|\bpainless\b|#\s?1\b|\bnumber one\b|\bbest in (the )?(state|country|area|city|region|world|dmv)\b|\bworld[- ]?class\b|\btop[- ]?rated\b/i.test(
      snapshot.text,
    );

  return [
    check({
      category: "page_source_readiness",
      check_id: "content.primary_intent",
      status: snapshot.title && snapshot.metaDescription ? "pass" : "partial",
      weight: 4,
      points: snapshot.title && snapshot.metaDescription ? 4 : 2,
      remediation: "Add clear title and description text that states the page intent directly.",
      evidence: [{ evidence_type: "metadata", source: snapshot.finalUrl, value: { title: snapshot.title, metaDescription: snapshot.metaDescription } }],
    }),
    check({
      category: "page_source_readiness",
      check_id: "content.specificity",
      status: isUtility ? "not_applicable" : hasSpecificity(snapshot) ? "pass" : "partial",
      weight: 4,
      points: !isUtility && hasSpecificity(snapshot) ? 4 : !isUtility ? 2 : 0,
      remediation: "Add practice-specific service, location, provider, and outcome language.",
      evidence: [{ evidence_type: "identity", source: snapshot.finalUrl, value: snapshot.identity as Record<string, unknown> }],
    }),
    check({
      category: "page_source_readiness",
      check_id: "content.evidence_units",
      status: isUtility ? "not_applicable" : evidenceUnitCount >= 3 ? "pass" : evidenceUnitCount > 0 ? "partial" : "fail",
      weight: 5,
      points: isUtility ? 0 : evidenceUnitCount >= 3 ? 5 : evidenceUnitCount > 0 ? 2.5 : 0,
      remediation: "Add source-ready blocks such as FAQs, short definitions, steps, comparisons, statistics, or proof snippets.",
      evidence: [{ evidence_type: "evidence_units", source: snapshot.finalUrl, value: { evidenceUnitCount } }],
    }),
    check({
      category: "page_source_readiness",
      check_id: "content.claim_support",
      status: hasRiskyClaim ? "partial" : "pass",
      weight: 3,
      points: hasRiskyClaim ? 1.5 : 3,
      remediation: "Qualify or support superlative/high-risk claims with visible evidence.",
      evidence: [{ evidence_type: "claim_scan", source: snapshot.finalUrl, value: { riskyClaimLanguage: hasRiskyClaim } }],
    }),
    check({
      category: "page_source_readiness",
      check_id: "content.schema_reinforcement",
      status: schemaAligned ? "pass" : "partial",
      weight: 2,
      points: schemaAligned ? 2 : 1,
      remediation: "Add structured data that matches visible content.",
      evidence: [{ evidence_type: "schema_types", source: snapshot.finalUrl, value: { schemaTypes: snapshot.schemaTypes } }],
    }),
    check({
      category: "page_source_readiness",
      check_id: "content.page_type_fit",
      status: isUtility ? "not_applicable" : inferPageType(snapshot) ? "pass" : "partial",
      weight: 2,
      points: !isUtility && inferPageType(snapshot) ? 2 : !isUtility ? 1 : 0,
      remediation: "Make the page type obvious: home, service, location, provider, blog/post, or contact.",
      evidence: [{ evidence_type: "page_type", source: snapshot.finalUrl, value: { pageType: inferPageType(snapshot), isUtilityPage: isUtility } }],
    }),
  ];
}

export function isUtilityPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /legal|privacy|terms|accessibility|hipaa|disclaimer|cookie|sitemap|404/.test(path);
  } catch {
    return false;
  }
}

function hasSpecificity(snapshot: UrlAuditSnapshot): boolean {
  return Boolean(
    snapshot.identity.phone ||
    snapshot.identity.address ||
    (snapshot.identity.services && snapshot.identity.services.length >= 2) ||
    (snapshot.identity.providers && snapshot.identity.providers.length > 0),
  );
}

function inferPageType(snapshot: UrlAuditSnapshot): string | null {
  const path = new URL(snapshot.finalUrl).pathname.toLowerCase();
  const text = snapshot.text.toLowerCase();
  if (path === "/" || path === "") return "home";
  if (/contact|appointment/.test(path + text)) return "contact";
  if (/location|directions|hours/.test(path + text)) return "location";
  if (/doctor|provider|team|about/.test(path + text)) return "provider";
  if (/blog|news|post/.test(path)) return "post";
  if ((snapshot.identity.services || []).length > 0) return "service";
  return null;
}
