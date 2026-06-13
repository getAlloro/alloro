import {
  normalizeComparableText,
  normalizeDomain,
  normalizePhone,
} from "./identityExtractionService";
import type {
  AiSeoExternalMatchState,
  ExtractedBusinessIdentity,
} from "./types";

export function compareExternalIdentity(
  baseline: ExtractedBusinessIdentity,
  external: ExtractedBusinessIdentity,
  pageText?: string | null,
): {
  state: AiSeoExternalMatchState;
  comparedFields: Record<string, unknown>;
} {
  const comparedFields: Record<string, unknown> = {};
  let phone = compareField(
    normalizePhone(baseline.phone),
    normalizePhone(external.phone),
  );
  // Benefit of the doubt: if the business's real phone is anywhere on the page,
  // a decoy/garbage extracted number shouldn't read as a mismatch.
  if (phone !== "consistent" && pageText && baseline.phone) {
    const want = normalizePhone(baseline.phone);
    if (want && pageText.replace(/\D/g, "").includes(want)) phone = "consistent";
  }
  const domain = compareDomain(baseline.website, external.website);
  const name = compareName(baseline.name, external.name);
  const address = compareFuzzyAddress(baseline.address, external.address, pageText);

  comparedFields.phone = phone;
  comparedFields.domain = domain;
  comparedFields.name = name;
  comparedFields.address = address;

  const values = [phone, domain, name, address];
  if (values.some((value) => value === "conflicting")) {
    return { state: "conflicting", comparedFields };
  }
  if (values.some((value) => value === "missing_on_site")) {
    return { state: "missing_on_site", comparedFields };
  }
  if (values.some((value) => value === "consistent")) {
    return { state: "consistent", comparedFields };
  }
  if (external.name && baseline.name && !nameContainsBaseline(baseline.name, external.name)) {
    return { state: "ambiguous_entity", comparedFields };
  }
  return { state: "external_candidate", comparedFields };
}

function compareField(
  baseline: string | null,
  external: string | null,
): "consistent" | "conflicting" | "missing_on_site" | "unavailable" {
  if (!baseline && external) return "missing_on_site";
  if (!baseline || !external) return "unavailable";
  return baseline === external ? "consistent" : "conflicting";
}

/**
 * Directory/listing pages rarely expose the business's canonical website in a
 * parseable way — extraction often picks up the directory's own domain — so a
 * domain mismatch is too noisy to treat as a conflict. A match is a strong
 * positive signal; anything else is left unavailable.
 */
function compareDomain(
  baseline?: string | null,
  external?: string | null,
): "consistent" | "unavailable" {
  const normalizedBaseline = normalizeDomain(baseline);
  const normalizedExternal = normalizeDomain(external);
  if (!normalizedBaseline || !normalizedExternal) return "unavailable";
  return normalizedBaseline === normalizedExternal ? "consistent" : "unavailable";
}

/**
 * Business names vary in formatting across directories (location suffixes, legal
 * entity tags, punctuation), so an exact-match comparison produces false
 * conflicts. Treat containment in either direction as consistent; a genuinely
 * different name is left unavailable here and routed to the ambiguous-entity
 * check rather than hard-flagged as a NAP conflict.
 */
function compareName(
  baseline?: string | null,
  external?: string | null,
): "consistent" | "missing_on_site" | "unavailable" {
  const normalizedBaseline = normalizeComparableText(baseline);
  const normalizedExternal = normalizeComparableText(external);
  if (!normalizedBaseline && normalizedExternal) return "missing_on_site";
  if (!normalizedBaseline || !normalizedExternal) return "unavailable";
  if (
    normalizedBaseline === normalizedExternal ||
    normalizedBaseline.includes(normalizedExternal) ||
    normalizedExternal.includes(normalizedBaseline)
  ) {
    return "consistent";
  }
  return "unavailable";
}

function compareFuzzyAddress(
  baseline?: string | null,
  external?: string | null,
  pageText?: string | null,
): "consistent" | "conflicting" | "missing_on_site" | "unavailable" {
  const normalizedBaseline = normalizeComparableText(baseline);
  const normalizedExternal = normalizeComparableText(external);
  if (!normalizedBaseline && normalizedExternal) return "missing_on_site";
  if (!normalizedBaseline || !normalizedExternal) return "unavailable";

  // Benefit of the doubt: directory pages often carry a decoy address (the site's
  // own footer). If the business's real address is present anywhere on the page,
  // don't flag a mismatch off whichever address the scraper happened to grab.
  if (baseline && addressOnPage(baseline, pageText)) return "consistent";

  const baselineNumber = normalizedBaseline.match(/\b\d{1,6}\b/)?.[0] ?? null;
  const externalNumber = normalizedExternal.match(/\b\d{1,6}\b/)?.[0] ?? null;
  const baselineTokens = new Set(
    normalizedBaseline.split(" ").filter((token) => token.length > 1),
  );
  // Shared non-numeric tokens (street name, city) confirm it's the same place
  // and guard against two different streets that happen to share a number.
  const sharedWordTokens = normalizedExternal
    .split(" ")
    .filter((token) => /[a-z]/.test(token) && baselineTokens.has(token));

  // Same street number + at least one shared word = same address, even when the
  // external listing reformats it or appends junk (e.g. scraped "Not hiring" text).
  if (
    baselineNumber &&
    externalNumber &&
    baselineNumber === externalNumber &&
    sharedWordTokens.length >= 1
  ) {
    return "consistent";
  }
  // Strong word overlap without a number conflict (e.g. suite-only differences).
  if (sharedWordTokens.length >= 4) return "consistent";
  // Different leading street numbers that don't appear in the other → real conflict.
  if (
    baselineNumber &&
    externalNumber &&
    baselineNumber !== externalNumber &&
    !normalizedExternal.includes(baselineNumber) &&
    !normalizedBaseline.includes(externalNumber)
  ) {
    return "conflicting";
  }
  return "unavailable";
}

function addressOnPage(
  baselineAddress: string,
  pageText?: string | null,
): boolean {
  const nb = normalizeComparableText(baselineAddress);
  const np = normalizeComparableText(pageText);
  if (!nb || !np) return false;
  const number = nb.match(/\b\d{1,6}\b/)?.[0];
  if (!number || !np.includes(number)) return false;
  // Require a shared street/city word too, so a bare number isn't enough.
  const words = nb.split(" ").filter((token) => /[a-z]/.test(token) && token.length > 2);
  return words.some((word) => np.includes(word));
}

function nameContainsBaseline(baseline: string, external: string): boolean {
  const normalizedBaseline = normalizeComparableText(baseline);
  const normalizedExternal = normalizeComparableText(external);
  if (!normalizedBaseline || !normalizedExternal) return false;
  return (
    normalizedBaseline.includes(normalizedExternal) ||
    normalizedExternal.includes(normalizedBaseline)
  );
}
