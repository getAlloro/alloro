/**
 * B2 CRO-lift rewrite — the rewrite honesty gate (Value #6).
 *
 * B2 generates page-section copy with an LLM. The spine's `enforceHonesty`
 * (util.taste-profile-honesty) catches banned *keywords* — rank/visibility
 * promises, guarantees, invented dollar/multiplier metrics. But an LLM rewrite
 * can slip a SUBTLE over-claim that is not a banned keyword: an unprovable
 * superlative ("the gentlest dentist," "best in town," "unparalleled,"
 * "award-winning"), fabricated social proof ("trusted by thousands"), an implied
 * promise ("you'll love it," "we'll make you smile"), or an absolute
 * comfort/outcome claim ("painless," "smiles that last a lifetime"). Those get
 * rubber-stamped by an owner who does not scrutinize — the exact failure this
 * layer exists to stop.
 *
 * So B2's gate is STRICTER than the spine's, by design (Corey's guardrail,
 * 2026-07-15; hardened after a Fable-5 adversary pass). It:
 *   - scans a BROAD set of subtle-over-claim classes (superlatives, social
 *     proof, implied promises, absolute outcomes) — not a tiny allowlist,
 *   - INDEPENDENTLY re-scans the hard-banned classes (guarantee / rank /
 *     invented metric) with a STRICT negation guard, so a banned word smuggled
 *     past the spine's looser negation (e.g. "we don't just fix teeth — we
 *     promise a painless experience") is still caught here,
 *   - scans the VISIBLE ATTRIBUTE text (alt / title / aria-label) a stripped-
 *     tag pass would miss,
 *   - decodes the full entity set and runs a second NO-GAP pass so split-tag /
 *     char-ref smuggling ("b&#x65;st", "fin<b></b>est") cannot hide a claim.
 *
 * It composes the spine's `enforceHonesty` as an ADDITIONAL layer (union of
 * reason codes — the gate can only get stricter, never looser). A rewrite must
 * pass at generation (before it is approvable) AND at execution (before it
 * publishes).
 *
 * ⛔ MEASURED STATE — DO NOT TRUST THIS GATE (independent refutation, 2026-07-16).
 * A fresh adversary ran 96 realistic strings through `gateRewrite`. Result:
 *   - **54/74 (73%) of realistic over-claims PASS** (`ok:true`). It is a ~60-token
 *     denylist; any paraphrase walks through ("foremost", "in a league of their
 *     own", "trusted by more families than any other", "your comfort is assured").
 *   - **11/22 (50%) of HONEST lines are wrongly BLOCKED** — and they are exactly
 *     the specific, verifiable copy this system exists to produce: a "$120" fee,
 *     "6 new patients each Tuesday", "First Page Road", a real *Elite* Sports
 *     Dentistry credential. Since `ok:false` DROPS the rewrite, the gate pushes
 *     copy AWAY from checkable specifics toward vague unfalsifiable warmth —
 *     the very Value #6 failure it was built to stop. (The earlier claim here,
 *     that over-blocking merely costs a regenerate, was WRONG.)
 *   - The NEGATION GUARD whitewashes real brags: "Our patients don't call us the
 *     best dentist in town for nothing" passes WITH the banned word `best`.
 *   - Unicode (zero-width space, homoglyphs, accents) defeats the entity/no-gap
 *     defense entirely, which only blocks the split-tag case it was aimed at.
 * The prior "hardened → 0 slips" note was SELF-GRADED against the first
 * adversary's own patched strings — an answer key, not a test. This is not a
 * residual; the gap is the majority of the space. A regex denylist cannot carry
 * Value #6 here. B2 therefore ships DISABLED, and an independent LLM honesty
 * judge is REQUIRED before it can be enabled — not an optional v2.
 *
 * B2-LOCAL on purpose: it does NOT mutate the spine's shared `enforceHonesty`
 * (that would destabilize #160's contract + tests). NOTE (residual, honest): a
 * regex gate cannot cover the open-ended space of over-claims; owner approval is
 * the ultimate backstop (nothing auto-publishes). An independent LLM honesty
 * judge is the tracked v2 hardening (spec `plans/07152026-cro-lift-rewrite`,
 * adjacent/backlog).
 *
 * Pure + dependency-free (beyond the spine's `enforceHonesty`): text scanners,
 * deterministically testable with plain strings.
 */

import { enforceHonesty, type HonestyResult } from "./util.taste-profile-honesty";

// ---------------------------------------------------------------------------
// HTML → visible text (what a visitor actually reads/hears)
// ---------------------------------------------------------------------------

/** Decode the entities a browser would render, so smuggled char-refs cannot
 * hide a word from the scanners. Handles named basics + decimal + hex refs. */
function decodeEntities(s: string): string {
  const named: Record<string, string> = {
    nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
    mdash: "—", ndash: "–", hellip: "…",
    lsquo: "'", rsquo: "'", ldquo: '"', rdquo: '"', deg: "°",
  };
  return (s ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex) => {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return _m; }
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      try { return String.fromCodePoint(parseInt(dec, 10)); } catch { return _m; }
    })
    .replace(/&([a-z]+);/gi, (_m, name) => named[name.toLowerCase()] ?? _m);
}

/** Pull the human-visible attribute values (tooltips, alt text, a11y labels)
 * into the text stream — over-claims live here too and a plain tag-strip drops
 * them (adversary F3). */
function extractVisibleAttributes(html: string): string {
  const attrs = ["alt", "title", "aria-label", "aria-description", "placeholder"];
  const out: string[] = [];
  const re = new RegExp(`\\b(?:${attrs.join("|")})\\s*=\\s*("([^"]*)"|'([^']*)')`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    out.push(m[2] ?? m[3] ?? "");
  }
  return out.join(" ");
}

/**
 * Strip HTML to the human-readable text a visitor would actually see. Includes
 * visible attribute text; tags become a space so words stay separated. Not a
 * security sanitizer — a text extractor for honesty scanning.
 */
export function htmlToText(html: string): string {
  const attrText = extractVisibleAttributes(html ?? "");
  const body = (html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(`${body} ${attrText}`).replace(/\s+/g, " ").trim();
}

/**
 * A SECOND representation where tags are removed with NO gap, so an over-claim
 * split across tags ("fin<b></b>est") re-joins into the real word and cannot
 * evade a `\bword\b` boundary (adversary F4). Scanned in addition to
 * `htmlToText`, never instead of it.
 */
export function htmlToTextNoGap(html: string): string {
  const attrText = extractVisibleAttributes(html ?? "");
  const body = (html ?? "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(`${body} ${attrText}`).replace(/[ \t]+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// PATTERN SETS
// ---------------------------------------------------------------------------

// Unprovable superlatives / competitive-placement brags in the brand's own
// voice. enforceHonesty's rank rule only fires when a rank word sits next to a
// number, so these no-number brags are B2's job. Broadened after the adversary
// pass (F1) to the common marketing-superlative space.
const SUPERLATIVE_PATTERNS: RegExp[] = [
  /\bbest\b/i,
  /\bfinest\b/i,
  /\bgreatest\b/i,
  /\btop[- ]?rated\b/i,
  /\bhighest[- ]?rated\b/i,
  /\bpremier\b/i,
  /\bunmatched\b/i,
  /\bunbeatable\b/i,
  /\bunrivall?ed\b/i,
  /\bunparalleled\b/i,
  /\bsecond to none\b/i,
  /\bworld[- ]?class\b/i,
  /\bworld[- ]?renowned\b/i,
  /\brenowned\b/i,
  /\belite\b/i,
  /\baward[- ]?winning\b/i,
  /\bstate[- ]?of[- ]?the[- ]?art\b/i,
  /\bcutting[- ]?edge\b/i,
  /\btop[- ]?notch\b/i,
  /\btop of the line\b/i,
  /\bfirst[- ]?class\b/i,
  /\bgold[- ]?standard\b/i,
  /\bthe go[- ]?to\b/i,
  /\bone[- ]?of[- ]?a[- ]?kind\b/i,
  /\bone of a kind\b/i,
  /\blike no other\b/i,
  /\b(?:the )?leading (?:provider|practice|dentist|clinic|choice|expert|name|authority)\b/i,
  /\bthe only\b/i,
  /\bmost (?:trusted|experienced|advanced|caring|skilled|reliable|affordable|recommended)\b/i,
  /\b(?:nobody|no one) (?:does it|does) better\b/i,
  /\bbetter than (?:anyone|any other|the rest|the others|the competition)\b/i,
  /\bnationally (?:recognized|renowned|ranked)\b/i,
  /\bvoted (?:the )?(?:best|#?\s?1|number one)\b/i,
];

// Fabricated / unverifiable social proof — "trusted by thousands," "5-star
// rated," "voted best." (Adversary F1.)
const SOCIAL_PROOF_PATTERNS: RegExp[] = [
  /\btrusted by (?:thousands|hundreds|millions|countless|so many)\b/i,
  /\b(?:thousands|hundreds|millions) of (?:happy|satisfied|smiling|loyal)\b/i,
  /\b\d+[- ]?star(?:[- ]?rated)?\b/i,
  /\bfive[- ]?star\b/i,
];

// Implied promises / outcome guarantees addressed to the reader — the softer
// forms enforceHonesty's bare "guarantee/promise" does not reach.
const IMPLIED_PROMISE_PATTERNS: RegExp[] = [
  /\byou'?ll\b/i,
  /\byou will\b/i,
  /\bwe'?ll (?:make|get|give|ensure|help you|have you|take care)\b/i,
  /\bwe will (?:make|get|give|ensure|help you|have you|take care)\b/i,
  /\bwe promise\b/i,
  /\brest assured\b/i,
  /\byou (?:can be|are) (?:sure|certain|guaranteed)\b/i,
  /\bguaranteed to\b/i,
  /\bwalk out (?:pain[- ]?free|smiling|happy|satisfied)\b/i,
  /\bleave (?:smiling|pain[- ]?free|happy)\b/i,
  // Litotes / comparative-superlative brags ("you won't find better anywhere").
  /\byou won'?t find (?:a )?(?:better|more \w+|any \w+|anywhere)\b/i,
  /\bget(?:s|ting)? you out of pain\b/i,
];

// Absolute comfort / outcome / perfection / permanence claims (F1 permanence
// forms added: "last a lifetime," "life-changing").
const ABSOLUTE_CLAIM_PATTERNS: RegExp[] = [
  /\bpain[- ]?less\b/i,
  /\bpain[- ]?free\b/i,
  /\bgentlest\b/i,
  /\bcompletely (?:safe|painless|comfortable|relaxed)\b/i,
  /\btotally (?:safe|painless|comfortable)\b/i,
  /\b100\s?%/,
  /\bevery single\b/i,
  /\bflawless\b/i,
  /\bperfect (?:smile|results?|care|experience|visit)\b/i,
  /\balways (?:comfortable|gentle|on time|pain[- ]?free)\b/i,
  /\bnever (?:hurts?|painful|a wait|wait)\b/i,
  /\blast(?:s|ing)? a lifetime\b/i,
  /\blifetime (?:results?|smiles?)\b/i,
  /\blife[- ]?changing\b/i,
  /\btransform your (?:life|smile)\b/i,
  /\bresults? that last\b/i,
  /\b(?:walk|come|leave) (?:out )?feeling (?:brand[- ]?new|new|amazing|great|incredible)\b/i,
  /\bfeel like (?:a )?(?:new|brand[- ]?new) (?:person|you|smile)\b/i,
];

// The HARD-banned classes, mirrored from the spine so B2 catches them under its
// own STRICT negation — this is what defeats F2 (a banned word smuggled past
// the spine's looser, clause-wide negation). enforceHonesty still runs too.
const GUARANTEE_PATTERNS: RegExp[] = [
  /\bguarantee(?:d|s)?\b/i,
  /\bpromise(?:d|s)?\b/i,
  /\brisk[- ]?free\b/i,
  /\bcure(?:d|s)?\b/i,
  /\bpermanent results?\b/i,
];
const RANK_VISIBILITY_PATTERNS: RegExp[] = [
  /\brank(?:ed|ing)?\s*(?:#|no\.?|number|\d|first)/i,
  /#\s*\d/,
  /\boutrank\b/i,
  /\bno\.?\s*1\b/i,
  /\bnumber\s*(?:one|1)\b/i,
  /\btop of (?:the )?(?:google|search|maps?|the (?:page|results|map))\b/i,
  /\bmap pack\b/i,
  /\blocal pack\b/i,
  /\bfirst page\b/i,
  /\bpage one\b/i,
  /\bshow up (?:first|higher|at the top)\b/i,
  /\bget found\b/i,
  /\b(?:more|higher|better) visibility\b/i,
  /\bdominate (?:search|google|the (?:market|rankings?))\b/i,
];
const FABRICATED_METRIC_PATTERNS: RegExp[] = [
  /\$\s?\d/,
  /\b\d+(?:\.\d+)?\s?x\b/i,
  /\b\d+\+?\s+(?:new\s+)?(?:patients?|clients?|customers?|leads?|bookings?|appointments?)\b/i,
  /\bdollars\b/i,
  /\b\d[\d,]*\s*grand\b/i,
];

// ---------------------------------------------------------------------------
// STRICT NEGATION GUARD (adversary F2)
// ---------------------------------------------------------------------------

// Clause boundaries now include em/en dashes and the colon — the adversary
// smuggled over-claims across an em-dash the old guard did not treat as a break.
const CLAUSE_BREAKS = /[.!?;,:—–]/;
const NEGATORS =
  /\b(?:no|not|never|don'?t|doesn'?t|won'?t|without|cannot|can'?t|isn'?t|aren'?t|avoid)\b/i;
// Max tokens a negator may sit before the phrase it governs. Beyond this, a
// leading "not ..." no longer whitewashes a later brag ("Not your average
// clinic — the finest care" must NOT pass).
const NEGATOR_WINDOW_TOKENS = 4;

/**
 * A match is negated only when a negator ACTUALLY GOVERNS it: within the same
 * clause (breaks incl. — – :) AND within a few tokens immediately before the
 * match. This lets an honest disclaimer through ("we make no promises") while
 * refusing the "not X — but [brag]" smuggle the loose clause-wide guard allowed.
 */
function isNegated(text: string, idx: number): boolean {
  const before = text.slice(0, idx);
  let lastBreak = -1;
  for (let i = before.length - 1; i >= 0; i--) {
    if (CLAUSE_BREAKS.test(before[i])) { lastBreak = i; break; }
  }
  const clause = before.slice(lastBreak + 1);
  const tokens = clause.split(/\s+/).filter(Boolean);
  const window = tokens.slice(-NEGATOR_WINDOW_TOKENS);
  return window.some((t) => NEGATORS.test(t));
}

/** True when any pattern matches an un-negated span of the text. */
function anyUnnegatedMatch(patterns: RegExp[], text: string): boolean {
  for (const re of patterns) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text)) !== null) {
      if (!isNegated(text, m.index)) return true;
      if (m.index === g.lastIndex) g.lastIndex++;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// SCANNERS
// ---------------------------------------------------------------------------

/**
 * Scan already-extracted TEXT for the SUBTLE over-claim classes enforceHonesty
 * does not catch (superlatives, social proof, implied promises, absolute
 * outcomes). Returns every category it trips.
 */
export function scanSubtleOverclaim(text: string): HonestyResult {
  const value = (text ?? "").trim();
  const reasonCodes: string[] = [];
  if (anyUnnegatedMatch(SUPERLATIVE_PATTERNS, value)) reasonCodes.push("unprovable_superlative");
  if (anyUnnegatedMatch(SOCIAL_PROOF_PATTERNS, value)) reasonCodes.push("fabricated_social_proof");
  if (anyUnnegatedMatch(IMPLIED_PROMISE_PATTERNS, value)) reasonCodes.push("implied_promise");
  if (anyUnnegatedMatch(ABSOLUTE_CLAIM_PATTERNS, value)) reasonCodes.push("absolute_outcome_claim");
  return { ok: reasonCodes.length === 0, reasonCodes };
}

/**
 * Independently scan TEXT for the HARD-banned classes (guarantee / rank /
 * invented metric) under B2's strict negation — the layer that catches a banned
 * word smuggled past the spine's looser negation (F2). Runs IN ADDITION to
 * `enforceHonesty`, never instead of it.
 */
export function scanHardBanned(text: string): HonestyResult {
  const value = (text ?? "").trim();
  const reasonCodes: string[] = [];
  if (anyUnnegatedMatch(GUARANTEE_PATTERNS, value)) reasonCodes.push("guarantee_or_outcome_claim");
  if (anyUnnegatedMatch(RANK_VISIBILITY_PATTERNS, value)) reasonCodes.push("rank_or_visibility_promise");
  if (anyUnnegatedMatch(FABRICATED_METRIC_PATTERNS, value)) reasonCodes.push("invented_metric");
  return { ok: reasonCodes.length === 0, reasonCodes };
}

/**
 * The B2 rewrite gate. A rewritten section (HTML) is allowed only if BOTH text
 * representations (normal + no-gap) pass EVERY layer:
 *   - the spine's `enforceHonesty` (banned keywords),
 *   - B2's strict `scanHardBanned` (banned classes under strict negation),
 *   - B2's `scanSubtleOverclaim` (superlatives / social proof / promises /
 *     absolutes).
 * Scanning both representations + visible-attribute text closes the split-tag,
 * char-ref, and attribute-hiding smuggles. Returns the union of reason codes.
 *
 * Runs at generation (before a rewrite becomes approvable) and again at
 * execution (before it publishes) — defense in depth.
 */
export function gateRewrite(html: string): HonestyResult {
  const reps = [htmlToText(html), htmlToTextNoGap(html)];
  const codes = new Set<string>();
  for (const text of reps) {
    for (const code of enforceHonesty(text).reasonCodes) codes.add(code);
    for (const code of scanHardBanned(text).reasonCodes) codes.add(code);
    for (const code of scanSubtleOverclaim(text).reasonCodes) codes.add(code);
  }
  return { ok: codes.size === 0, reasonCodes: [...codes] };
}
