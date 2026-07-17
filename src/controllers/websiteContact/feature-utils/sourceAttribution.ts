/**
 * Source attribution for form submissions — the capture half of the connection-
 * measurement moat (Slice 4). Pure + deterministic so it is fully unit-testable.
 *
 * THE HONEST DESIGN (learned by building): the *submit* request's Referer is the
 * practice's own page the form sits on — internal navigation, NOT where the
 * visitor originally came from. The real source is the visitor's FIRST TOUCH
 * (the channel that brought them to the site), captured on landing and carried
 * to the submit by the frontend as a `source` field (or a `utm_source`). This
 * helper therefore trusts the frontend-supplied first-touch first, and uses the
 * submit Referer only as a weak cross-site fallback.
 *
 * We NEVER guess. If we don't have a first-touch and the Referer is missing,
 * unparseable, or internal to the site, the source is null. A null source reads
 * as "we don't know," which is true (Value #6) — better than inventing an
 * attribution we can't stand behind. The by-source counts a null lands in are
 * surfaced honestly as "unknown," never folded into a real channel.
 *
 * PROVENANCE IS STORED, NOT COLLAPSED (§5.2 / §5.4): the channel label alone
 * cannot say whether the visitor's browser CLAIMED it or whether we CLASSIFIED
 * it ourselves. Those are not the same evidence, so `deriveSubmissionSource`
 * returns the label AND the `method` that produced it, and both are persisted
 * (`source` + `source_method`). Downstream reporting reads the method to decide
 * how a number may be described; it can no longer mistake a claim for proof.
 */

const MAX_SOURCE_LEN = 100;

/**
 * HOW a source label was produced — persisted alongside the label so no reader
 * has to guess at its authority. Ordered strongest-evidence last is deliberate:
 * every tier here is client-INFLUENCED, they just differ in who did the work.
 *
 * - `client_label`    — `body.source` / `body.utm_source`. The page told us the
 *                       channel outright. We allow-list it against a closed
 *                       vocabulary, but the CLAIM is the visitor's, not ours.
 * - `client_referrer` — `body.first_touch_referrer`. The page told us a URL and
 *                       WE classified it. Our label, their input.
 * - `header_referrer` — the submit's `Referer` header. Set by the browser rather
 *                       than by page JS, and classified by us. The strongest of
 *                       the three — and still forgeable by a non-browser client.
 */
export type SourceMethod = "client_label" | "client_referrer" | "header_referrer";

/**
 * The honest confidence tier of a method. NOTHING here is "verified" — a public
 * submit endpoint means every signal is ultimately client-supplied or
 * client-forgeable, so no submission source may EVER be reported as verified
 * attribution (Value #6). The distinction we can honestly draw is narrower:
 *
 * - `claimed`  — the visitor's page supplied it (a label, or the URL we read).
 * - `observed` — the browser sent it on the request and we classified it.
 * - `unknown`  — no usable signal; the source is null.
 *
 * Reporting language follows from this: `claimed` reads as "reported as", never
 * "came from". This map is the ONE place that judgement lives.
 */
export type SourceConfidence = "claimed" | "observed" | "unknown";

export const SOURCE_METHOD_CONFIDENCE: Readonly<
  Record<SourceMethod, Exclude<SourceConfidence, "unknown">>
> = {
  client_label: "claimed",
  client_referrer: "claimed",
  header_referrer: "observed",
};

/** Type guard for a `source_method` value read back off a row (DB text is untyped). */
export function isSourceMethod(value: unknown): value is SourceMethod {
  return (
    value === "client_label" ||
    value === "client_referrer" ||
    value === "header_referrer"
  );
}

/**
 * The honest confidence of a stored `source_method`. An absent/unrecognized
 * method is "unknown" — never silently upgraded to a tier we can't stand behind.
 */
export function sourceConfidence(method: unknown): SourceConfidence {
  return isSourceMethod(method) ? SOURCE_METHOD_CONFIDENCE[method] : "unknown";
}

/**
 * Whether a stored source may be presented as VERIFIED attribution. Always
 * false, by design and on purpose — see SourceConfidence. It exists as a real
 * function so that any future reporting surface asking "can I call this
 * verified?" gets one answer from one place, instead of each caller inventing
 * its own (and getting it wrong). If a genuinely server-verified channel ever
 * lands (e.g. a signed click-through token), THIS is what changes.
 */
export function isVerifiedAttribution(_method: unknown): boolean {
  return false;
}

/**
 * The closed vocabulary of channel labels we accept from a CLIENT-SUPPLIED claim
 * (`body.source` / `body.utm_source`), each mapped to a CANONICAL label. The
 * submit endpoint is public, so these fields are attacker/JS-controlled free text
 * — and a marketing tool can drop a personalized `utm_source` like `jane.doe1987`
 * that carries patient PII. We therefore never store a claim verbatim: a claim
 * only counts if it resolves to a label we recognize as a real channel. Anything
 * else → null (unknown), which falls through to server-side referrer
 * classification. This is the Value #6 floor — a claim we can't stand behind is
 * unknown, not stored — and the PII guard: a name / phone / DOB / MRN is not a
 * key here, so it is never persisted. Every entry is a generic channel word.
 *
 * Mapping to a canonical (not a Set) keeps the by-source COUNTS honest: `fb`,
 * `meta`, and `facebook` all fold to one bucket instead of splintering the very
 * numbers this feature exists to make trustworthy. Only unambiguous abbreviations
 * are folded; genuinely distinct labels stay themselves. (Collapsing a specific
 * patient-comms tool like `podium`/`weave` down to `sms`/`email` is a product
 * taxonomy call, deferred — they are self-canonical here, honest as-is.)
 */
const SOURCE_LABEL_ALIASES: ReadonlyMap<string, string> = new Map([
  // search
  ["google", "google"], ["bing", "bing"], ["duckduckgo", "duckduckgo"],
  ["yahoo", "yahoo"], ["ecosia", "ecosia"], ["brave", "brave"],
  // social — brand abbreviations fold to one canonical each
  ["facebook", "facebook"], ["fb", "facebook"], ["meta", "facebook"],
  ["instagram", "instagram"], ["ig", "instagram"],
  ["linkedin", "linkedin"],
  ["twitter", "twitter"], ["x", "twitter"],
  ["youtube", "youtube"], ["yt", "youtube"],
  ["tiktok", "tiktok"], ["pinterest", "pinterest"], ["snapchat", "snapchat"],
  ["nextdoor", "nextdoor"], ["reddit", "reddit"],
  // google business surfaces — gmb / google_my_business are synonyms of GBP
  ["google_business_profile", "google_business_profile"],
  ["gmb", "google_business_profile"],
  ["google_my_business", "google_business_profile"],
  ["google_maps", "google_maps"], ["googlemaps", "google_maps"],
  ["google_ads", "google_ads"], ["googleads", "google_ads"],
  // owned outbound
  ["email", "email"], ["newsletter", "newsletter"],
  ["sms", "sms"], ["text", "sms"], ["mms", "sms"],
  ["mailer", "mailer"], ["postcard", "postcard"], ["flyer", "flyer"],
  ["print", "print"],
  ["qr", "qr"], ["qr_code", "qr"], ["qrcode", "qr"],
  // patient-comms / campaign tools (dental stack) — self-canonical (honest
  // as-is); folding them to email/sms is a deferred product taxonomy call
  ["mailchimp", "mailchimp"], ["klaviyo", "klaviyo"],
  ["constant_contact", "constant_contact"], ["hubspot", "hubspot"],
  ["birdeye", "birdeye"], ["podium", "podium"], ["weave", "weave"],
  ["solutionreach", "solutionreach"], ["lighthouse360", "lighthouse360"],
  ["smile_reminder", "smile_reminder"],
  // directories / reviews
  ["yelp", "yelp"], ["healthgrades", "healthgrades"], ["zocdoc", "zocdoc"],
  ["vitals", "vitals"], ["ratemds", "ratemds"], ["webmd", "webmd"], ["bbb", "bbb"],
  // generic mediums
  ["direct", "direct"], ["organic", "organic"], ["referral", "referral"],
  ["paid", "paid"], ["cpc", "cpc"], ["ppc", "ppc"], ["ads", "ads"],
  ["display", "display"], ["social", "social"], ["affiliate", "affiliate"],
  ["partner", "partner"], ["blog", "blog"], ["podcast", "podcast"],
  ["webinar", "webinar"], ["event", "event"], ["website", "website"],
]);

/**
 * Resolve a client-supplied claim label to its canonical channel, or null if it
 * is not a recognized channel. Hyphens are folded to underscores first, so
 * `google-ads` and `constant-contact` match their canonical keys. A value that
 * doesn't resolve (an unknown campaign name, or any PII-shaped string) → null.
 */
function canonicalizeSourceClaim(normalized: string): string | null {
  return SOURCE_LABEL_ALIASES.get(normalized.replace(/-/g, "_")) ?? null;
}

/** Lowercase, trim, cap, and allow only a safe channel-label charset. Unknown → null. */
export function normalizeSource(raw: string): string | null {
  const s = raw.trim().toLowerCase().slice(0, MAX_SOURCE_LEN);
  if (!s) return null;
  return /^[a-z0-9._:+-]+$/.test(s) ? s : null;
}

/** Hostname of a URL string, www-stripped, trailing-dot-stripped, lowercased. Unparseable → null. */
export function hostOf(url: string): string | null {
  try {
    // A trailing dot is a valid absolute-FQDN form (`google.com.`) — strip any
    // run of them so it can't dodge the owned-host check or the domain match.
    return new URL(url).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.+$/, "");
  } catch {
    return null;
  }
}

/**
 * The registrable domains we recognize, each mapped to its honest channel. We
 * match on the DOMAIN (exact, or as a dotted suffix), never on a bare label —
 * because the referer is attacker-controlled on a public endpoint. Label
 * matching let `google.attacker-blog.com` or `fb.somecdn.net` masquerade as a
 * real brand; domain matching does not (`attacker-blog.com` / `somecdn.net` are
 * the registrable domains, and they aren't ours to name). An unrecognized real
 * site — including a brand ccTLD we don't list — is honestly "referral", never a
 * fabricated brand: a coarse-but-true downgrade is fine, a false brand is not.
 */
const HOST_CHANNELS: ReadonlyArray<readonly [string, string]> = [
  ["google.com", "google"],
  ["bing.com", "bing"],
  ["duckduckgo.com", "duckduckgo"],
  ["yahoo.com", "yahoo"],
  ["facebook.com", "facebook"],
  ["fb.com", "facebook"],
  ["instagram.com", "instagram"],
  ["linkedin.com", "linkedin"],
  ["lnkd.in", "linkedin"],
  ["twitter.com", "twitter"],
  ["x.com", "twitter"],
  ["t.co", "twitter"],
  ["youtube.com", "youtube"],
  ["youtu.be", "youtube"],
  ["tiktok.com", "tiktok"],
];

/**
 * Classify a KNOWN external referrer host into a coarse, honest channel by
 * registrable domain (see HOST_CHANNELS). `plumbing.com` is a plain "referral",
 * not "bing"; `notgoogle.com` and `google.attacker-blog.com` are not "google".
 * An unrecognized site is honestly a referral — never a guessed brand (Value #6).
 */
export function classifyReferrerHost(host: string): string {
  for (const [domain, channel] of HOST_CHANNELS) {
    if (host === domain || host.endsWith("." + domain)) return channel;
  }
  return "referral";
}

/**
 * Classify a referer URL into an honest external channel, or null. Returns null
 * when the referer is missing, unparseable, or INTERNAL to the site (one of the
 * project's own hosts) — internal navigation is not a source. Keeps ALL host
 * classification server-side (one source of truth), so the frontend only has to
 * forward a raw referer, never re-implement channel logic.
 */
export function classifyExternalReferer(
  referer: string | null | undefined,
  ownedHosts: string[] = [],
): string | null {
  if (!referer || !referer.trim()) return null;
  const host = hostOf(referer);
  if (!host) return null;
  const owned = ownedHosts
    .filter(Boolean)
    .map((h) => h.toLowerCase().replace(/^www\./, "").replace(/\.+$/, ""));
  if (owned.some((h) => host === h || host.endsWith("." + h))) return null;
  return classifyReferrerHost(host);
}

export interface SourceSignals {
  /** Frontend-captured first-touch entry source label (primary, if the frontend
   *  already resolved one). Normalized + used directly. */
  bodySource?: string | null;
  /** Explicit utm_source, if the entry link carried one (also first-touch). */
  utmSource?: string | null;
  /** The RAW referrer of the visitor's FIRST touch (the landing page), forwarded
   *  by the frontend. Classified server-side; internal/empty → skipped. This is
   *  the real entry channel for organic/referral traffic. */
  firstTouchReferer?: string | null;
  /** The submit request's Referer header (weak cross-site fallback only — it is
   *  usually the practice's own form page, i.e. internal → null). */
  referer?: string | null;
  /** The site's own domains — an internal referer is NOT a source. */
  projectHosts?: string[];
}

/**
 * A derived source: the channel label AND the provenance that produced it. The
 * two travel together on purpose — a label without its method invites a reader
 * to treat a visitor's claim as Alloro's finding (§5.2). `method` is null if and
 * only if `source` is null (unknown).
 */
export interface DerivedSource {
  source: string | null;
  method: SourceMethod | null;
}

/** Unknown — no usable signal. Never a guess (Value #6). */
const UNKNOWN_SOURCE: DerivedSource = { source: null, method: null };

/**
 * Derive the honest source channel of a submission WITH its provenance, or
 * unknown. Precedence (most-specific signal first, NOT most-trusted — see
 * SourceMethod): explicit first-touch label (bodySource / utmSource) → the
 * classified first-touch landing referrer → the classified submit Referer →
 * unknown. Never guesses, and never launders a claim into a classification.
 */
export function deriveSubmissionSource(signals: SourceSignals): DerivedSource {
  const { bodySource, utmSource, firstTouchReferer, referer, projectHosts = [] } =
    signals;

  // 1. An explicit first-touch label wins — it is the real entry channel, and the
  //    only signal that survives a same-site landing — but ONLY if it names a
  //    channel we recognize. These fields are client-supplied on a public
  //    endpoint, so an unrecognized value (a real campaign name we don't know,
  //    or worse, a personalized utm carrying patient PII) is NOT stored: it falls
  //    through to server-side classification. Try body then utm; a value that
  //    fails the check falls through instead of shadowing the next signal (don't
  //    lose a good utm_source because bodySource was garbage). Losing an
  //    unknown-but-real campaign label to null is the honest Value #6 trade.
  //
  //    Winning precedence does NOT promote it: it is recorded as `client_label`,
  //    so a report can say "reported as facebook", never "verified: facebook".
  for (const raw of [bodySource, utmSource]) {
    if (raw && raw.trim()) {
      const normalized = normalizeSource(raw);
      const channel = normalized ? canonicalizeSourceClaim(normalized) : null;
      if (channel) return { source: channel, method: "client_label" };
    }
  }

  // 2. The visitor's first-touch landing referrer: OUR classification of a URL
  //    the page handed us. Internal/empty/unparseable → skip to the submit
  //    Referer. Recorded as `client_referrer` — our label, their input.
  const firstTouch = classifyExternalReferer(firstTouchReferer, projectHosts);
  if (firstTouch) return { source: firstTouch, method: "client_referrer" };

  // 3. Weak fallback: the submit Referer header (usually the internal form page
  //    → null). Browser-set rather than page-set, so it is recorded as the
  //    strongest tier we have, `header_referrer` — which is still not "verified".
  const fromHeader = classifyExternalReferer(referer, projectHosts);
  if (fromHeader) return { source: fromHeader, method: "header_referrer" };

  // 4. No usable signal anywhere → unknown, never a guess.
  return UNKNOWN_SOURCE;
}
