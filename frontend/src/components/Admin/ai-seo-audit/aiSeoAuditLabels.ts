import type {
  AiSeoCategoryId,
  AiSeoExternalMatchState,
  AiSeoResultStatus,
} from "../../../api/aiSeoAudit";

export type LabelInfo = { label: string; tip: string };

/** Plain-English names + hover explanations for the five scoring categories. */
export const CATEGORY_INFO: Record<AiSeoCategoryId, LabelInfo> = {
  access_indexability: {
    label: "Findability",
    tip: "Can search engines and AI assistants actually reach, crawl, and read this page?",
  },
  page_source_readiness: {
    label: "Content Readiness",
    tip: "Is the content specific, well-structured, and easy for AI to quote and summarize?",
  },
  entity_external_consistency: {
    label: "Business Consistency",
    tip: "Do your name, phone, and address match across your website, its code, and the wider web?",
  },
  connected_performance: {
    label: "Connected Data",
    tip: "Are Google Search Console and Google Business Profile connected and feeding in real data?",
  },
  authority_market: {
    label: "Reputation",
    tip: "Do reviews and mentions around the web build trust in your business?",
  },
};

/** Plain-English names + explanations for a single check's outcome. */
export const STATUS_INFO: Record<AiSeoResultStatus, LabelInfo> = {
  pass: {
    label: "Good",
    tip: "This check passed — nothing to do here.",
  },
  partial: {
    label: "Partial",
    tip: "Partly there. Some of this passed but it isn't fully met yet — a quick win to improve.",
  },
  fail: {
    label: "Needs fixing",
    tip: "This check didn't pass and is worth addressing.",
  },
  unavailable: {
    label: "No data",
    tip: "Couldn't be measured — usually a missing connection (like Search Console). This does NOT lower your score.",
  },
  not_applicable: {
    label: "N/A",
    tip: "This check doesn't apply to this page.",
  },
};

/** Plain-English names + explanations for how an off-site listing compares. */
export const EXTERNAL_STATE_INFO: Record<AiSeoExternalMatchState, LabelInfo> = {
  consistent: {
    label: "Matches",
    tip: "This listing's business details line up with your website.",
  },
  conflicting: {
    label: "Mismatch",
    tip: "This listing shows different details than your site — e.g. a different phone number or address. Worth correcting the listing.",
  },
  missing_on_site: {
    label: "Missing on your site",
    tip: "This listing shows useful business info that your own website doesn't display.",
  },
  external_candidate: {
    label: "Unverified",
    tip: "We found this listing but couldn't confirm its details against your site — review it manually.",
  },
  ambiguous_entity: {
    label: "Possible mix-up",
    tip: "The name matches but nothing else lined up — this could be a different or similarly named business.",
  },
  unavailable: {
    label: "Couldn't read",
    tip: "This source couldn't be opened or compared.",
  },
};

/** Plain-English names + explanations for each individual check. */
export const CHECK_INFO: Record<string, LabelInfo> = {
  "access.final_status": {
    label: "Page loads successfully",
    tip: "The page returns a healthy response instead of an error or broken redirect chain.",
  },
  "access.fetch_failed": {
    label: "Page couldn't be loaded",
    tip: "The audit couldn't open this page at all — usually a DNS, redirect, or blocking issue.",
  },
  "access.robots_allowed": {
    label: "Crawlers aren't blocked",
    tip: "Robots.txt and CDN rules don't stop search engines or AI bots from reading the page.",
  },
  "access.indexable_snippet_eligible": {
    label: "Allowed in search results",
    tip: "The page isn't hidden from search by a 'noindex' or 'nosnippet' tag.",
  },
  "access.canonical": {
    label: "Canonical tag is correct",
    tip: "The page's canonical tag points to itself, not off to a different URL.",
  },
  "access.discovery": {
    label: "Easy to discover",
    tip: "The page appears in the sitemap and is linked from other pages.",
  },
  "access.rendered_text": {
    label: "Content is real text",
    tip: "The main content is readable text, not locked inside images or scripts.",
  },
  "content.primary_intent": {
    label: "Clear purpose",
    tip: "The title and description make it obvious what the page is about.",
  },
  "content.specificity": {
    label: "Specific, not generic",
    tip: "Uses real service, location, and provider details instead of vague filler.",
  },
  "content.evidence_units": {
    label: "Answer-ready content",
    tip: "Has FAQs, definitions, steps, or stats that an AI can quote directly.",
  },
  "content.claim_support": {
    label: "Claims are backed up",
    tip: "Avoids unsupported superlatives like 'best' or '#1' without visible proof.",
  },
  "content.schema_reinforcement": {
    label: "Structured data present",
    tip: "Includes schema markup that reinforces the visible content.",
  },
  "content.page_type_fit": {
    label: "Clear page type",
    tip: "It's obvious whether this is a home, service, location, provider, or contact page.",
  },
  "entity.site_extractable": {
    label: "Business info is visible",
    tip: "Name, phone, and address are present and readable on the page.",
  },
  "entity.schema_visible_match": {
    label: "Schema matches the page",
    tip: "Business schema (LocalBusiness) matches what visitors actually see.",
  },
  "entity.connected_canonical_match": {
    label: "Verified business record",
    tip: "A connected Alloro or Google record confirms the official business details.",
  },
  "entity.external_consistency": {
    label: "Referenced across the web",
    tip: "Your business is referenced on third-party sites (directories, social). Confirmed matches earn full credit; possible mismatches are advisory only.",
  },
  "entity.high_confidence_mismatch": {
    label: "No flagged mismatches",
    tip: "Whether any external listing has a possible mismatch worth a manual review. These are leads to check, not confirmed errors.",
  },
  "connected.gsc_active": {
    label: "Search Console connected",
    tip: "Google Search Console is connected and has recent performance data.",
  },
  "connected.url_gsc_rows": {
    label: "Page seen in Search Console",
    tip: "This specific page shows up in Google Search Console's data.",
  },
  "connected.gbp_profile": {
    label: "Business Profile connected",
    tip: "Google Business Profile data is connected for this location.",
  },
  "connected.audit_history": {
    label: "History building",
    tip: "Running repeat audits over time enables before/after comparison.",
  },
  "authority.reviews": {
    label: "Reviews signal",
    tip: "Review volume and rating pulled from Google Business Profile.",
  },
  "authority.external_corroboration": {
    label: "Web mentions confirm you",
    tip: "External profiles corroborate your business instead of creating confusion.",
  },
};

function prettifyFallback(value: string): string {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function checkInfo(checkId: string): LabelInfo {
  return CHECK_INFO[checkId] ?? { label: prettifyFallback(checkId), tip: "" };
}

export function categoryInfo(id: AiSeoCategoryId, fallbackLabel: string): LabelInfo {
  return CATEGORY_INFO[id] ?? { label: fallbackLabel, tip: "" };
}
