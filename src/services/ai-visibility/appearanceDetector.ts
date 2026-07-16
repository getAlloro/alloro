import {
  AppearanceDetection,
  EngineCitation,
  EngineRawResult,
  PracticeIdentity,
} from "./types";

/**
 * Deterministic appearance detection over one engine's raw result. Pure: no IO.
 *
 * ANTI-FABRICATION is the binding rule (spec + aeo-measurement-spec.md §3), and
 * the rule is IDENTITY, NOT RESEMBLANCE. A positive is recorded only when the
 * text identifies THIS practice. Resemblance is not identity:
 *
 * - a name our name merely PREFIXES ("Smile Dental Group") is another business;
 * - a name our name is merely a SUFFIX of ("Bright Smile Dental") is another business;
 * - a domain appearing ANYWHERE in a URL string ("directory.example/?ref=us.com")
 *   is not the host that was cited;
 * - a domain appearing in a third party's citation TITLE ("Directory profile for
 *   us.com") is not a citation of us.
 *
 * Every ambiguous case DROPS the claim rather than guessing, because a missed
 * mention is a gap while a fabricated mention is a lie — we tell an owner they
 * were mentioned when they were not. The two errors are NOT symmetric and are
 * never traded off, so this detector deliberately errs toward the miss.
 *
 * - `mentioned` = the practice name (or GBP title) appears as a WHOLE entity —
 *   not extended on either side into a longer, different business name — OR the
 *   practice's own domain is genuinely cited.
 * - `cited` = the practice's own HOST is the host of a citation, proved from a
 *   PARSED URL's hostname (never a substring of the URL string), matched by host
 *   equality/subdomain. A title proves a citation only for an engine whose
 *   adapter declares the title canonical AND whose title IS a bare host.
 * - `position` = raw 1-based line index where the name first appears AS A WHOLE
 *   ENTITY; diagnostic only, NEVER rendered as a rank.
 */

/** Horizontal whitespace only: a NEWLINE ends an entity, so "…Dental\n2. Other
 * Co" is a list, not a longer name. */
const H = "[ \\t\\u00a0]";

/**
 * Lowercase words that continue a business name ("Smile Dental group"). Case is
 * not a reliable signal — an engine may lowercase a suffix — so these are
 * rejected in any case. Cost: a genuine "Smile Dental care about patients" is
 * dropped. That is the safe direction.
 */
const NAME_SUFFIX_WORDS = [
  "group",
  "dental",
  "dentistry",
  "dentist",
  "dentists",
  "orthodontics",
  "orthodontist",
  "ortho",
  "endodontics",
  "endodontist",
  "periodontics",
  "periodontist",
  "prosthodontics",
  "oral",
  "surgery",
  "surgical",
  "implants",
  "implant",
  "associates",
  "assoc",
  "clinic",
  "center",
  "centre",
  "care",
  "health",
  "healthcare",
  "family",
  "smiles",
  "smile",
  "practice",
  "partners",
  "studio",
  "spa",
  "office",
  "offices",
  "pediatric",
  "cosmetic",
  "aesthetics",
  "llc",
  "llp",
  "pc",
  "pllc",
  "inc",
  "pa",
  "ltd",
  "co",
  "corp",
  "plc",
  "dds",
  "dmd",
  "md",
];

/**
 * Lowercase connectors that FORM longer business names ("Smile Dental of
 * Austin"). Deliberately NOT prepositions that only ever read as prose ("in",
 * "for", "by") — rejecting those would cost real mentions and buy no safety.
 * "and" IS included: "Smile Dental and Braces" (a name) cannot be told from
 * "Smile Dental and Bright Ortho" (a list), and ambiguity drops the claim.
 */
const NAME_CONNECTOR_WORDS = ["of", "at", "and", "on"];

const LEFT_CAPITALIZED_TOKEN = new RegExp(
  `(^|[^A-Za-z0-9])[A-Z][A-Za-z0-9'’.\\-]*${H}+$`
);
const LEFT_SYMBOL_JOIN = new RegExp(`[&+]${H}*$`);
const LEFT_ANY_WORD = new RegExp(`[A-Za-z0-9]${H}+$`);
const RIGHT_SYMBOL_JOIN = new RegExp(`^${H}*[&+]${H}*[A-Za-z0-9]`);
const RIGHT_CAPITALIZED_TOKEN = new RegExp(
  `^(${H}+|${H}*[-\\u2010-\\u2015]${H}*)[A-Z0-9]`
);
const RIGHT_SUFFIX_WORD = new RegExp(
  `^${H}+(${NAME_SUFFIX_WORDS.join("|")})\\b`,
  "i"
);
const RIGHT_CONNECTOR_NAME = new RegExp(
  `^${H}+(${NAME_CONNECTOR_WORDS.join("|")})${H}+[A-Z0-9]`,
  "i"
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Is the matched text the WHOLE entity named here, rather than part of a longer,
 * different business name? This is the identity test that replaces "the string
 * appears somewhere".
 */
function isWholeEntity(text: string, index: number, matched: string): boolean {
  const before = text.slice(0, index);
  const after = text.slice(index + matched.length);

  // LEFT — an adjacent capitalized token means the real entity starts earlier
  // ("Bright Smile Dental"). A sentence-initial capital ("Visit Smile Dental")
  // is indistinguishable from a name's capital, so BOTH drop: we cannot tell,
  // therefore we do not claim.
  if (LEFT_CAPITALIZED_TOKEN.test(before)) return false;
  if (LEFT_SYMBOL_JOIN.test(before)) return false;

  // LEFT in all-lowercase prose — capitalization is the only entity boundary we
  // have; when the engine rendered the name lowercase there is none, so any
  // adjacent word ("the bright smile dental option") is ambiguous.
  if (!/[A-Z]/.test(matched) && LEFT_ANY_WORD.test(before)) return false;

  // RIGHT — a longer name continuing across a symbol ("Smile Dental &
  // Orthodontics"), a capitalized token ("Smile Dental Group"), a lowercase
  // suffix word ("Smile Dental group"), or a name-forming connector ("Smile
  // Dental of Austin").
  if (RIGHT_SYMBOL_JOIN.test(after)) return false;
  if (RIGHT_CAPITALIZED_TOKEN.test(after)) return false;
  if (RIGHT_SUFFIX_WORD.test(after)) return false;
  if (RIGHT_CONNECTOR_NAME.test(after)) return false;

  return true;
}

/**
 * Index of the FIRST occurrence that is genuinely this practice, or null.
 *
 * Scans EVERY occurrence: a lookalike earlier in the answer ("Smile Dental
 * Group") must not suppress a real mention later ("…3. Smile Dental"). Rejecting
 * only the first occurrence would turn one competitor into a missed reading.
 */
function findIdentityMatch(text: string, rawName: string): number | null {
  const name = rawName.trim();
  if (!name) return null;
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (isWholeEntity(text, m.index, m[0])) return m.index;
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return null;
}

/** A real, multi-label hostname. Rejects a TLD-only or garbage practice domain
 * ("com"), which would otherwise match every .com host by suffix. */
const HOSTNAME_RE = /^([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/;

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * The host a URL ACTUALLY points at, parsed — never scraped from the URL string.
 * `directory.example/listing?ref=smiledental.com` is cited by directory.example;
 * the query parameter is not a citation of us, and a regex over the raw string
 * cannot tell the difference.
 */
function hostFromUrl(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    const u = new URL(/^[a-z][a-z0-9+.\-]*:\/\//i.test(s) ? s : `https://${s}`);
    const host = normalizeHost(u.hostname);
    return HOSTNAME_RE.test(host) ? host : null;
  } catch {
    return null;
  }
}

/**
 * The host a canonical-title citation names — only when the title IS a bare
 * host. Independent of the adapter's declaration: a title must not merely
 * CONTAIN a domain ("Directory profile for smiledental.com"), it must be one.
 */
function hostFromCanonicalTitle(title: string): string | null {
  const t = title
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  const host = normalizeHost(t);
  return HOSTNAME_RE.test(host) ? host : null;
}

/** Host equals the practice host, or is a subdomain of it (real "." label
 * boundary), so a lookalike superstring host never matches. */
function hostMatchesPractice(sourceHost: string, practiceHost: string): boolean {
  return sourceHost === practiceHost || sourceHost.endsWith("." + practiceHost);
}

/**
 * The citation FIELD that PROVES the practice's own site was cited, or null.
 *
 * Returns the proving field itself, so the persisted `cited_source` always
 * carries its own evidence.
 */
function findCitedSource(
  citations: EngineCitation[],
  practiceHost: string
): string | null {
  for (const citation of citations) {
    if (citation.url) {
      const host = hostFromUrl(citation.url);
      if (host && hostMatchesPractice(host, practiceHost)) return citation.url;
    }
    // Title: default-deny. Only an engine whose contract makes the title the
    // canonical destination may use it, and only when it IS a bare host.
    if (citation.title && citation.titleIsCanonicalHost === true) {
      const host = hostFromCanonicalTitle(citation.title);
      if (host && hostMatchesPractice(host, practiceHost)) return citation.title;
    }
  }
  return null;
}

export function detectAppearance(
  raw: EngineRawResult,
  identity: PracticeIdentity
): AppearanceDetection {
  const answer = raw.answerText ?? "";

  const nameMatchIndex = findIdentityMatch(answer, identity.name ?? "");
  const nameMentioned =
    nameMatchIndex !== null ||
    findIdentityMatch(answer, identity.gbpTitle ?? "") !== null;

  const practiceHost = identity.domain ? hostFromUrl(identity.domain) : null;
  const citedSource = practiceHost
    ? findCitedSource(raw.citations ?? [], practiceHost)
    : null;
  const cited = citedSource !== null;

  const mentioned = nameMentioned || cited;

  // Diagnostic line of the identity-verified match — never the lookalike's line.
  const position =
    nameMatchIndex !== null
      ? answer.slice(0, nameMatchIndex).split("\n").length
      : null;

  return { mentioned, cited, citedSource, position };
}
