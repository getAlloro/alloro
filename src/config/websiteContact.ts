/**
 * Public website-contact intake limits.
 *
 * The patient message ceiling is intentionally generous: 32,000 characters is
 * more than ten times the historical 3,000-character cap and can hold a long
 * treatment history. The request ceiling leaves room for the other contact
 * fields and multi-byte UTF-8 text while preventing this small JSON endpoint
 * from inheriting the app-wide 50 MB allowance used by PMS imports.
 */
export const CONTACT_MESSAGE_MAX_CHARS = 32_000;
export const CONTACT_REQUEST_BODY_MAX_BYTES = 256 * 1024;

/**
 * Per-IP abuse boundary for the unauthenticated contact endpoint. Twenty
 * submissions in fifteen minutes leaves ample room for shared clinic networks
 * and retries while bounding automated webhook and email amplification.
 */
export const CONTACT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const CONTACT_RATE_LIMIT_MAX_REQUESTS = 20;
