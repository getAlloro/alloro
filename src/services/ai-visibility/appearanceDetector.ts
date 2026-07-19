import { getDomain } from "tldts";
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
 *   us.com") is not a citation of us;
 * - a host that merely ENDS WITH our stored domain is not our host: under a
 *   public suffix ("co.uk") every competitor ends with it, so ownership is
 *   compared as REGISTRABLE DOMAIN (eTLD+1), never as a string suffix;
 * - a URL is only evidence when it is one: `javascript://us.com/…` parses to
 *   hostname "us.com" but cites nothing, so only http(s) can prove a citation.
 *
 * Every ambiguous case DROPS the claim rather than guessing, because a missed
 * mention is a gap while a fabricated mention is a lie — we tell an owner they
 * were mentioned when they were not. The two errors are NOT symmetric and are
 * never traded off, so this detector deliberately errs toward the miss.
 *
 * - `mentioned` = the practice name (or GBP title) appears as a WHOLE entity —
 *   not extended on either side into a longer, different business name — OR the
 *   practice's own domain is genuinely cited.
 * - `cited` = the practice's own site is the host of a citation, proved from a
 *   PARSED http(s) URL's hostname (never a substring of the URL string) and
 *   matched by REGISTRABLE-DOMAIN equality. A practice identity with no
 *   registrable domain ("co.uk", "com") proves nothing and fails closed. A title
 *   proves a citation only for an engine whose adapter declares the title
 *   canonical AND whose title IS a bare host.
 * - `position` = raw 1-based line index where the name first appears AS A WHOLE
 *   ENTITY; diagnostic only, NEVER rendered as a rank.
 */

/**
 * ONE alphabet, shared by the matcher and every guard.
 *
 * THE ROOT CAUSE OF A WHOLE FABRICATION CLASS: the matcher's boundary test said
 * "any non-alphanumeric ends a token" (`(?<![A-Za-z0-9])`) while the guards used
 * small hand-listed ASCII sets (`[A-Z0-9]`, three space characters). The two
 * DISAGREED about what a character is, and every fabrication lived in that gap:
 * "Muñoz Family Dental" recorded a mention for `Family Dental` while "Munoz
 * Family Dental" correctly did not — the ONLY difference being the "ñ", which
 * the guard's `[A-Za-z0-9]` token body could not cross. That is ordinary engine
 * output about a competitor, not an adversarial input: Muñoz, Hernández, Peña,
 * Nguyễn and Ángel are the surname stock of US dental practice names.
 *
 * Enumerating more characters cannot fix this — the gap is infinite while a list
 * is finite. So the classes below are UNICODE PROPERTY based and are the single
 * definition both sides read. Every regex built from them carries the `u` flag.
 */
/** What a token is MADE of: any letter, digit, or combining mark. `\p{M}` matters
 * — decomposed "Nguyễn" carries its diacritic as a separate mark. */
const ALNUM = "[\\p{L}\\p{N}\\p{M}]";
/** What can START a proper name: an uppercase or titlecase letter, a digit
 * ("1st Family Dental"), or a CASELESS letter (`\p{Lo}` — CJK/Arabic/Hebrew have
 * no capitals, so a case test is blind to them and would let a longer name
 * through). */
const UPPER = "[\\p{Lu}\\p{Lt}\\p{N}\\p{Lo}]";
/**
 * What can CONTINUE a name to the RIGHT — the same, MINUS digits.
 *
 * The asymmetry is deliberate and load-bearing. A digit BEFORE the name is part
 * of a business name ("1st Family Dental", "32 Smile Dental"). A digit AFTER it,
 * across a separator, is almost never a name and almost always a rating or a
 * distance — "**Smile Dental** — 4.8 stars", "Smile Dental - 2.1 miles" is the
 * single most common shape in an engine's ranked list. Treating that "4" as a
 * name continuation drops the most ordinary real mention there is.
 * (A connector still admits digits — "Smile Dental on 5th" is a name, and a
 * rating never follows "of"/"on"/"at" — so RIGHT_CONNECTOR_NAME uses UPPER.)
 */
const RIGHT_HEAD = "[\\p{Lu}\\p{Lt}\\p{Lo}]";
/**
 * Horizontal whitespace — ANY of it, Unicode-wide, but never a line break.
 * `[ \t ]` knew three characters; an engine emitting a narrow no-break
 * space (U+202F), a thin space (U+2009) or an ideographic space (U+3000) walked
 * straight past every guard, so "Bright<U+202F>Smile Dental" recorded a mention
 * while the identical text with an ASCII space did not.
 * A NEWLINE is deliberately excluded: an entity never spans lines, so
 * "…Dental\n2. Other Co" stays a list, not a longer name.
 */
const H = "[^\\S\\r\\n]";
/**
 * Characters that JOIN two parts of one entity rather than ending it: markdown
 * emphasis, an ampersand/plus/slash, any dash, and the zero-width characters.
 */
const JOIN = "*_`~&+/\\-\\u2010-\\u2015\\u200b-\\u200d\\u2060\\ufeff";
/**
 * One separator, used SYMMETRICALLY on both sides.
 *
 * The left guard knew markdown, slashes and zero-widths; the right guard knew
 * only spaces and dashes. That asymmetry was itself a fabrication: "**Bright**
 * Smile Dental" correctly dropped while "**Smile Dental** Group" — its mirror
 * image — recorded a mention, as did "Smile Dental/Orthodontics" and "Smile
 * Dental<ZWSP>group". A separator is a separator whichever side it falls on.
 */
const SEP = `(?:${H}|[${JOIN}])`;

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
 * Austin", "Smiles by Design", "Dentistry for Kids").
 *
 * A BOUNDED HEURISTIC — and the earlier claim here that this was "a CLOSED class
 * that cannot grow" was WRONG, so it is corrected rather than defended. It was
 * falsified twice over: "to" was simply missing ("Smile Dental to Go" recorded a
 * mention), and the business-name space is not English — "Smile Dental de
 * Austin" and "Clínica Dental y Más" are ordinary US practice names. Function
 * words are closed PER LANGUAGE; the set of languages is not. What IS structural
 * is the open class next door: any CAPITALIZED continuation ("Smile Dental
 * Arts", "Smile Dental Excellence") is caught by RIGHT_CAPITALIZED_TOKEN, never
 * by a word list, because that set is genuinely infinite. This list only covers
 * the narrower "lowercase function word, then a capitalized head noun" shape,
 * and it is a list because the alternative — dropping on ANY lowercase word
 * before a capital — would reject "Smile Dental is Austin's best" and gut real
 * recall. Residual, named honestly: a connector from a language not listed here
 * still records.
 *
 * Included because businesses genuinely name themselves this way. EXCLUDED:
 * "in", "near", "from" — locative prepositions that read as prose ("Smile
 * Dental in Austin has good reviews") and are not an English business-naming
 * pattern; listing them would cost real mentions and buy no safety. That
 * exclusion is the deliberate recall/safety line, not an oversight.
 *
 * "and"/"or" ARE included: "Smile Dental and Braces" (a name) cannot be told
 * from "Smile Dental and Bright Ortho" (a list), and ambiguity drops the claim.
 *
 * HONEST about the weakest entry: "with" earns its place less clearly than
 * "of"/"by"/"for" (which match everyday practice names — "Smiles by Design",
 * "Dentistry for Kids"). Its recall cost is real and recurring: "Smile Dental
 * with Invisalign" and "Smile Dental with Dr. Smith" are genuine mentions this
 * drops. It stays because the asymmetry is not a preference — a gap is a gap,
 * a fabricated mention is a lie — and this file already drops every other
 * capitalized continuation for exactly that reason. Revisit it with real engine
 * output, not intuition.
 */
const NAME_CONNECTOR_WORDS = [
  // English
  "of",
  "at",
  "and",
  "on",
  "or",
  "by",
  "for",
  "to",
  "plus",
  "with",
  // Spanish — a large share of US dental practices name themselves this way
  // ("Clínica Dental de la Familia", "Smile Dental y Más").
  "de",
  "del",
  "la",
  "las",
  "el",
  "los",
  "y",
  "en",
];

/**
 * A preceding name token: an entity-initial character then a token body. Starts
 * with UPPER (not just `[A-Z]`): real practices lead with a digit ("1st Family
 * Dental", "3D Smile Dental") or a non-ASCII capital ("Ángel Dental"), and an
 * ASCII-capital-only test is blind to both. "." is excluded from the token body
 * so a LIST MARKER ("1. ", "2. ") is not mistaken for a name token — the
 * marker's "." is not a joiner, so "1. Smile Dental" still reads as the practice.
 */
const LEFT_CAPITALIZED_TOKEN = new RegExp(
  `(^|[^\\p{L}\\p{N}])${UPPER}[\\p{L}\\p{N}\\p{M}'’\\-]*${SEP}+$`,
  "u"
);
const LEFT_SYMBOL_JOIN = new RegExp(`[&+]${H}*$`, "u");
const LEFT_ANY_WORD = new RegExp(`${ALNUM}${SEP}+$`, "u");
const RIGHT_SYMBOL_JOIN = new RegExp(`^${H}*[&+]${H}*${ALNUM}`, "u");
/** Any capitalized continuation, across ANY separator — the structural guard
 * that handles the infinite set of name continuations a word list cannot.
 * Uses RIGHT_HEAD (no digits): see its note on ratings vs names. */
const RIGHT_CAPITALIZED_TOKEN = new RegExp(`^${SEP}+${RIGHT_HEAD}`, "u");
/** Plural-tolerant: a word list that knows "clinic" but not "clinics" is beaten
 * by typing one letter — "Smile Dental clinics are common" is generic prose, not
 * a mention of the practice. Uses `(?![\p{L}\p{N}])` rather than `\b`, which is
 * ASCII-only and would not fire before a non-ASCII letter. */
const RIGHT_SUFFIX_WORD = new RegExp(
  `^${SEP}+(${NAME_SUFFIX_WORDS.join("|")})s?(?![\\p{L}\\p{N}])`,
  "iu"
);
/**
 * Determiners that sit INSIDE a business name between a connector and the head
 * noun ("Smile Dental by the Bay", "Smile Dental of the Hills"). Without this
 * window the connector test looks only at the next token, sees "the", and lets
 * the longer name through.
 */
const NAME_DETERMINERS = ["the", "a", "an", "la", "el", "los", "las"];
/**
 * A connector continuing into a CAPITALIZED head noun.
 *
 * Deliberately case-SENSITIVE: `[A-Z0-9]` must mean a capital. The prior "i"
 * flag applied to the whole pattern, which silently made `[A-Z0-9]` match
 * lowercase too, so ANY word after a connector ended the entity. That was
 * invisible while the list held only "of/at/and/on", but it is the difference
 * between "Smile Dental for Kids" (a different business — capital) and "Smile
 * Dental for cleanings" (prose about ours — lowercase). Capitalization is the
 * identity signal the rest of this file already relies on, so the test reads it
 * directly. A capitalized connector ("Smile Dental Of Austin") is not lost —
 * RIGHT_CAPITALIZED_TOKEN catches it first.
 */
const RIGHT_CONNECTOR_NAME = new RegExp(
  `^${SEP}+(${NAME_CONNECTOR_WORDS.join("|")})${SEP}+((${NAME_DETERMINERS.join("|")})${SEP}+)*${UPPER}`,
  "u"
);

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The name's significant tokens, whitespace-normalized. */
function nameTokens(name: string): string[] {
  return name.trim().split(/\s+/).filter(Boolean);
}

/**
 * A matcher for the name, tolerant of whitespace but not of identity.
 *
 * Uses LOOKAROUNDS rather than `\b`: a name ending in a period ("Smile Dental
 * P.C.") has no word boundary after it, so `\b` made the practice's OWN
 * registered name undetectable — every "… P.C." / "Inc." / "D.D.S." practice was
 * permanently invisible to itself. Tokens are joined on flexible horizontal
 * whitespace so a double space in the stored name still matches the answer.
 */
function buildNameMatcher(name: string): RegExp | null {
  const tokens = nameTokens(name);
  if (!tokens.length) return null;
  const body = tokens.map(escapeRegex).join(`${H}+`);
  // The lookarounds read the SAME alphabet as the guards. With `[A-Za-z0-9]`
  // they treated a non-ASCII letter as a boundary, so "Smile Dental" matched
  // inside a longer non-ASCII token and the guards never got a chance.
  return new RegExp(`(?<!${ALNUM})${body}(?!${ALNUM})`, "giu");
}

/**
 * Does the text render this as a PROPER NAME, agreeing with the identity's own
 * capitalization?
 *
 * This is an identity signal a word list cannot express. "Perfect smile outcomes
 * vary by provider" is generic English — it does not name the practice "Perfect
 * Smile", and no list of suffix words will ever tell you so. "Family dental
 * practices are plentiful" is not the practice "Family Dental". The engine
 * capitalizes a business name; prose does not.
 *
 * Skipped when the STORED name carries no case signal (all-lowercase), because
 * then there is nothing to agree with. ALL-CAPS text still matches a title-case
 * name — every uppercase-in-identity token is uppercase there too.
 */
function capitalizationAgrees(matched: string, name: string): boolean {
  // `\p{Lu}`, not `[A-Z]`: a name whose only capitals are non-ASCII ("Ángel
  // Dental") carries a case signal that an ASCII test cannot see, and skipping
  // the check for it would let prose through as a name.
  if (!/\p{Lu}/u.test(name)) return true;
  const idTokens = nameTokens(name);
  const matchedTokens = nameTokens(matched);
  if (idTokens.length !== matchedTokens.length) return true;
  for (let i = 0; i < idTokens.length; i++) {
    if (/^\p{Lu}/u.test(idTokens[i]) && !/^\p{Lu}/u.test(matchedTokens[i])) {
      return false;
    }
  }
  return true;
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
  if (!/\p{Lu}/u.test(matched) && LEFT_ANY_WORD.test(before)) return false;

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
  const re = buildNameMatcher(name);
  if (!re) return null;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (capitalizationAgrees(m[0], name) && isWholeEntity(text, m.index, m[0])) {
      return m.index;
    }
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return null;
}

/** A real, multi-label hostname. Rejects a TLD-only or garbage practice domain
 * ("com"), which would otherwise match every .com host by suffix. */
const HOSTNAME_RE = /^([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/;

/**
 * The ONLY schemes that can carry a citation, mirroring the repo's existing
 * boundary (`services/ai-seo-audit/urlSafetyService.ts` ALLOWED_PROTOCOLS).
 * That helper is async (it does a DNS lookup) and this detector is pure/no-IO,
 * so the CHECK is shared by pattern, not by import (§4.4 — the utility exists
 * but is IO-bound and unusable here).
 *
 * `new URL()` parses an authority for ANY "scheme://host" string, so
 * `javascript://smiledental.com/%0aalert(1)` and `file://smiledental.com/etc`
 * both yield hostname `smiledental.com`. Without this allowlist each one
 * fabricated a citation AND persisted a `javascript:` URL into `cited_source`,
 * which the owner-facing UI renders as a link — fabrication and an XSS sink
 * from the same hole. §5.2.
 */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/^www\./, "");
}

/**
 * The REGISTRABLE domain (eTLD+1) of a host — the unit of ownership actually
 * sold to a registrant — or null when the host has none.
 *
 * The eTLD boundary is DATA (the Mozilla Public Suffix List), not a string
 * operation: `co.uk`, `com.au` and `github.io` are suffixes under which anyone
 * may register, so `endsWith("." + practiceDomain)` treats every UK commercial
 * site as ours. No hand-maintained denylist can track a ~10k-rule list that
 * changes; this is why a PSL parser is a dependency and not a regex (§4.4).
 *
 * `allowPrivateDomains: true` is REQUIRED, not a default. With it FALSE,
 * `alice.github.io` and `bob.github.io` both reduce to `github.io` and would
 * match each other — two unrelated practices cited as one. With it TRUE each is
 * its own registrable domain, and a bare `github.io` identity resolves to null
 * and is refused. Verified against tldts 7.4.9.
 */
function registrableDomain(host: string): string | null {
  return getDomain(host, { allowPrivateDomains: true });
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
  const hasScheme = /^[a-z][a-z0-9+.\-]*:\/\//i.test(s);
  // A schemeless value may only be a BARE HOST. Without this, a root-relative
  // path ("/smiledental.com/reviews") becomes "https:///smiledental.com/reviews",
  // whose slashes collapse to hostname smiledental.com — a path segment
  // promoted into a citation of us. No current adapter emits that shape; this
  // closes it for the next one.
  if (!hasScheme && !/^[a-z0-9]/i.test(s)) return null;
  try {
    const u = new URL(hasScheme ? s : `https://${s}`);
    if (!ALLOWED_PROTOCOLS.has(u.protocol)) return null;
    // Userinfo is never part of a plain citation, and
    // `https://smiledental.com@evil.com/` is a deceptive-link shape we must not
    // hand an owner as evidence. The existing urlSafetyService refuses it too.
    if (u.username || u.password) return null;
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

/**
 * Does this source host belong to the practice's REGISTRABLE domain?
 *
 * Compares eTLD+1 to eTLD+1 — identity of ownership, not string resemblance.
 * `sourceHost.endsWith("." + practiceDomain)` was the old test and it is wrong
 * at exactly the boundary that matters: with `practiceDomain = "co.uk"` every
 * `competitor.co.uk` "matched". Reducing BOTH sides to the registrable domain
 * makes the comparison an equality between owners.
 *
 * This preserves the real subdomain case for free: `booking.smiledental.com`
 * and `smiledental.com` share one registrable domain, so a genuine citation of
 * either still records. `practiceDomain` is pre-validated by the caller.
 */
function hostMatchesPractice(
  sourceHost: string,
  practiceDomain: string
): boolean {
  return registrableDomain(sourceHost) === practiceDomain;
}

/**
 * The citation FIELD that PROVES the practice's own site was cited, or null.
 *
 * Returns the proving field itself, so the persisted `cited_source` always
 * carries its own evidence.
 */
function findCitedSource(
  citations: EngineCitation[],
  practiceDomain: string
): string | null {
  for (const citation of citations) {
    if (citation.url) {
      const host = hostFromUrl(citation.url);
      if (host && hostMatchesPractice(host, practiceDomain)) return citation.url;
    }
    // Title: default-deny. Only an engine whose contract makes the title the
    // canonical destination may use it, and only when it IS a bare host.
    if (citation.title && citation.titleIsCanonicalHost === true) {
      const host = hostFromCanonicalTitle(citation.title);
      if (host && hostMatchesPractice(host, practiceDomain)) {
        return citation.title;
      }
    }
  }
  return null;
}

/**
 * The practice's registrable domain, or null when the stored identity cannot
 * prove ownership of anything.
 *
 * THE TRUSTED-IDENTITY BOUNDARY (§5.2). `identity.domain` is database-sourced,
 * but "first-party" is not "valid": it arrives from onboarding/import and may be
 * blank, a bare TLD, or a public suffix. Malformed identity data must FAIL
 * CLOSED — record nothing — rather than widen into an ownership root that
 * manufactures evidence about a competitor. A dropped citation is a gap; a
 * fabricated one tells an owner an AI cited them when it cited someone else.
 */
function practiceDomainFromIdentity(identity: PracticeIdentity): string | null {
  if (!identity.domain) return null;
  const host = hostFromUrl(identity.domain);
  if (!host) return null;
  return registrableDomain(host);
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

  const practiceDomain = practiceDomainFromIdentity(identity);
  const citedSource = practiceDomain
    ? findCitedSource(raw.citations ?? [], practiceDomain)
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
