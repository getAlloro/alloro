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

export interface SourceSignals {
  /** Frontend-captured first-touch entry source (primary). */
  bodySource?: string | null;
  /** Explicit utm_source, if the entry link carried one (also first-touch). */
  utmSource?: string | null;
  /** The submit request's Referer header (weak cross-site fallback only). */
  referer?: string | null;
  /** The site's own domains — an internal referer is NOT a source. */
  projectHosts?: string[];
}

/**
 * Derive the honest source channel of a submission, or null when unknown.
 * Precedence: frontend first-touch (bodySource / utmSource) → cross-site
 * Referer → null. Never guesses.
 */
export function deriveSubmissionSource(signals: SourceSignals): string | null {
  const { bodySource, utmSource, referer, projectHosts = [] } = signals;

  // 1. Frontend-captured first-touch source wins — the real entry channel.
  //    Try body then utm; a junk value that fails normalization falls through
  //    to the next signal instead of shadowing it (don't lose a good utm_source
  //    because bodySource was garbage).
  for (const raw of [bodySource, utmSource]) {
    if (raw && raw.trim()) {
      const normalized = normalizeSource(raw);
      if (normalized) return normalized;
    }
  }

  // 2. Fallback: the submit Referer, but ONLY if it's a cross-site referral
  //    straight to the form. No first-touch + no usable referer → unknown (null).
  if (!referer || !referer.trim()) return null;
  const host = hostOf(referer);
  if (!host) return null;

  // The site's own pages are internal navigation, not a source.
  const owned = projectHosts
    .filter(Boolean)
    .map((h) => h.toLowerCase().replace(/^www\./, ""));
  if (owned.some((h) => host === h || host.endsWith("." + h))) return null;

  return classifyReferrerHost(host);
}
