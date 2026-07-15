import {
  AppearanceDetection,
  EngineRawResult,
  PracticeIdentity,
} from "./types";

/**
 * Deterministic appearance detection over one engine's raw result. Pure: no IO.
 *
 * ANTI-FABRICATION is the binding rule (spec + aeo-measurement-spec.md §3):
 * never record a mention/citation that isn't genuinely the practice. So matching
 * is boundary-aware, NOT substring — a competitor's lookalike name or domain
 * must not produce a positive. The detector is conservative by design: it
 * prefers a MISSED positive over a FABRICATED one.
 *
 * - `mentioned` = the practice name (or GBP title) appears as a whole phrase
 *   that is NOT extended by another capitalized token (which would indicate a
 *   longer, different business name — "Smile Dental" must not match "Smile
 *   Dental Group"), OR the practice's own domain is cited.
 * - `cited` = the practice's own DOMAIN appears in a CITATION SOURCE (not prose),
 *   matched by hostname equality/subdomain — never a substring, so
 *   "bestsmiledental.com" does not match "smiledental.com".
 * - `position` = raw 1-based line index where the name first appears; diagnostic
 *   only, NEVER rendered as a rank.
 */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-phrase match not extended by a following capitalized token. */
function nameAppears(answer: string, rawName: string): boolean {
  const name = rawName.trim();
  if (!name) return false;
  const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
  const m = re.exec(answer);
  if (!m) return false;
  const after = answer.slice(m.index + name.length);
  // Immediately followed by a capitalized word → likely a prefix of a longer,
  // different business name. Reject (a false negative is safer than a fabricated hit).
  if (/^\s+[A-Z][A-Za-z0-9'&.-]*/.test(after)) return false;
  return true;
}

function normalizePracticeHost(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[:/].*$/, "");
}

/** Candidate hostnames inside a citation-source string (a URL or a title). */
function extractHosts(text: string): string[] {
  const matches =
    text.toLowerCase().match(/([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}/g) ?? [];
  return matches.map((h) => h.replace(/^www\./, ""));
}

/** Host equals the practice host, or is a subdomain of it (real "." label
 * boundary), so a lookalike superstring host never matches. */
function hostMatchesPractice(sourceHost: string, practiceHost: string): boolean {
  return sourceHost === practiceHost || sourceHost.endsWith("." + practiceHost);
}

export function detectAppearance(
  raw: EngineRawResult,
  identity: PracticeIdentity
): AppearanceDetection {
  const answer = raw.answerText ?? "";

  const nameMentioned =
    nameAppears(answer, identity.name ?? "") ||
    nameAppears(answer, identity.gbpTitle ?? "");

  let citedSource: string | null = null;
  const practiceHost = identity.domain
    ? normalizePracticeHost(identity.domain)
    : "";
  if (practiceHost) {
    for (const source of raw.citationSources ?? []) {
      const hosts = extractHosts(source);
      if (hosts.some((h) => hostMatchesPractice(h, practiceHost))) {
        citedSource = source;
        break;
      }
    }
  }
  const cited = citedSource !== null;

  const mentioned = nameMentioned || cited;

  let position: number | null = null;
  const name = (identity.name ?? "").trim();
  if (nameMentioned && name) {
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "i");
    const lines = answer.split("\n");
    const idx = lines.findIndex((l) => re.test(l));
    if (idx >= 0) position = idx + 1;
  }

  return { mentioned, cited, citedSource, position };
}
