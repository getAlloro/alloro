/**
 * Owner Weekly Digest — configuration and the send kill-switch.
 *
 * The weekly "here is what Alloro did for you" recap is a CLIENT-FACING send:
 * it reaches a real practice owner's inbox. It therefore ships DISABLED and only
 * sends when `OWNER_WEEKLY_DIGEST_ENABLED` is explicitly `true` in the runtime
 * environment. Landing this code starts no emails; enabling it is a deliberate,
 * server-side config change (§5.1 — the switch lives in env, not in code).
 *
 * Named constants per §4.2 so the cadence and limits are read here, not buried
 * as literals in the worker and service.
 *
 * OPERATOR NOTE — `OWNER_WEEKLY_DIGEST_ENABLED`
 *   default: unset (off). Set to exactly `true` in the server env file
 *   (`/etc/alloro/dev.env` or `/etc/alloro/app.env`) to enable. There is no
 *   `.env.example` in this repo to document it in.
 *
 *   Setting it `true` does NOT by itself reach a practice owner. The email
 *   interceptor (src/emails/emailInterceptor.ts) allows a live send only when
 *   the machine's own public IP is a DNS A record of app.getalloro.com; every
 *   other machine — dev, localhost, CI — is rerouted to dave@getalloro.com with
 *   the subject prefixed. So on dev, `true` means "send me the copies";
 *   on the production box it means real owner inboxes.
 */

/** Cron: 13:00 UTC every Monday (≈ start of the US work-week morning). */
export const OWNER_WEEKLY_DIGEST_CRON = "0 13 * * 1";

/** Schedule timezone — the cron above is evaluated in UTC. */
export const OWNER_WEEKLY_DIGEST_TZ = "UTC";

/** BullMQ job id for the repeatable schedule (idempotent re-registration). */
export const OWNER_WEEKLY_DIGEST_JOB_ID = "weekly-owner-digest";

/** Trailing window the "what Alloro did" recap covers, in days. */
export const OWNER_WEEKLY_DIGEST_WINDOW_DAYS = 7;

/** How many recent dated work items to list in the email body. */
export const OWNER_WEEKLY_DIGEST_RECENT_ITEMS_MAX = 6;

/**
 * Page size for the proof-receipt read. The summary counts come from a grouped
 * query over the whole window regardless of this, so it only bounds how many
 * dated items are available to list; keep it a little above the display max.
 */
export const OWNER_WEEKLY_DIGEST_ITEM_SCAN_LIMIT = 25;

/**
 * The send kill-switch. Off unless the env value is exactly `true`
 * (case-insensitive). Any other value — unset, empty, "false", garbage —
 * keeps it off, so a misconfiguration fails closed and never emails owners.
 */
export function isOwnerWeeklyDigestEnabled(): boolean {
  return String(process.env.OWNER_WEEKLY_DIGEST_ENABLED ?? "")
    .trim()
    .toLowerCase() === "true";
}
