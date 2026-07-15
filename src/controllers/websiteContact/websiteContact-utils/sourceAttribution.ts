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
 */

const MAX_SOURCE_LEN = 100;

/** Lowercase, trim, cap, and allow only a safe channel-label charset. Unknown → null. */
export function normalizeSource(raw: string): string | null {
  const s = raw.trim().toLowerCase().slice(0, MAX_SOURCE_LEN);
  if (!s) return null;
  return /^[a-z0-9._:+-]+$/.test(s) ? s : null;
}

/** Hostname of a URL string, www-stripped, lowercased. Unparseable → null. */
export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Classify a KNOWN external referrer host into a coarse, honest channel.
 * Matches on WHOLE dotted labels, never a substring — so `plumbing.com` is a
 * plain "referral", not "bing", and `notgoogle.com` is not "google". Guessing a
 * specific channel we can't stand behind is the exact Value #6 failure this
 * module exists to prevent; an unrecognized real site is honestly a referral.
 */
export function classifyReferrerHost(host: string): string {
  const labels = host.split(".");
  const has = (name: string): boolean => labels.includes(name);
  if (has("google")) return "google";
  if (has("bing")) return "bing";
  if (has("duckduckgo")) return "duckduckgo";
  if (has("yahoo")) return "yahoo";
  if (has("facebook") || host === "fb.com" || has("fb")) return "facebook";
  if (has("instagram")) return "instagram";
  if (has("linkedin")) return "linkedin";
  if (host === "t.co" || has("twitter") || host === "x.com") return "twitter";
  if (has("youtube") || host === "youtu.be") return "youtube";
  if (has("tiktok")) return "tiktok";
  // A real external site we don't specifically recognize is honestly a referral.
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
    .map((h) => h.toLowerCase().replace(/^www\./, ""));
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
 * Derive the honest source channel of a submission, or null when unknown.
 * Precedence: explicit first-touch label (bodySource / utmSource) → the
 * classified first-touch landing referrer → the classified submit Referer →
 * null. Never guesses.
 */
export function deriveSubmissionSource(signals: SourceSignals): string | null {
  const { bodySource, utmSource, firstTouchReferer, referer, projectHosts = [] } =
    signals;

  // 1. An explicit first-touch label wins — the real entry channel.
  //    Try body then utm; a junk value that fails normalization falls through
  //    to the next signal instead of shadowing it (don't lose a good utm_source
  //    because bodySource was garbage).
  for (const raw of [bodySource, utmSource]) {
    if (raw && raw.trim()) {
      const normalized = normalizeSource(raw);
      if (normalized) return normalized;
    }
  }

  // 2. The visitor's first-touch landing referrer, classified server-side.
  //    Internal/empty/unparseable → skip to the weak submit-Referer fallback.
  const firstTouch = classifyExternalReferer(firstTouchReferer, projectHosts);
  if (firstTouch) return firstTouch;

  // 3. Weak fallback: the submit Referer (usually the internal form page → null).
  //    No usable signal anywhere → unknown (null), never a guess.
  return classifyExternalReferer(referer, projectHosts);
}
