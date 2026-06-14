/**
 * Leadgen Account-Linking Service
 *
 * Bridges `auth-otp` onboarding to `leadgen_sessions`. When a user completes
 * their first OTP verify and a new `users` row is created, we walk back to
 * the leadgen tracking data and mark the matching session(s) as
 * `account_created` — populating `user_id` + `converted_at` so the admin
 * funnel can measure conversion.
 *
 * Matching strategy (union of both, deduped):
 *   1. Explicit `sessionId` (carried through the signup URL as `?ls=<uuid>`)
 *   2. Case-insensitive email match on `leadgen_sessions.email`
 *
 * Idempotent by design — an `account_created` event row is the "already
 * linked" marker. If it exists for a candidate session, we skip. This means
 * calling `linkAccountCreation` twice for the same user never produces two
 * events, and a duplicate OTP verify races harmlessly.
 *
 * Fire-and-forget: all errors are caught + logged. This function must never
 * bubble an exception back into the OTP verify handler — tracking failures
 * are not allowed to fail auth.
 */

import { db } from "../../../database/connection";
import type { ILeadgenSession } from "../../../models/LeadgenSessionModel";
import logger from "../../../lib/logger";

export interface LinkAccountCreationOptions {
  email: string;
  /**
   * Accepts `number` OR numeric `string` because `users.id` is `bigint` in
   * Postgres and the `pg` driver returns bigints as strings by default
   * (avoids JS number precision loss). Coerced internally to a safe
   * integer before writing.
   */
  userId: number | string;
  sessionId?: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value);
}

/**
 * Find candidate leadgen sessions for the given email / session id.
 * Returns the session id + the match reason for downstream event_data.
 */
async function findCandidateSessions(opts: {
  email: string;
  sessionId?: string;
}): Promise<Array<{ id: string; matchedVia: "session_id" | "email" }>> {
  const normalizedEmail = opts.email.toLowerCase();
  const sessionIdValid = isValidUuid(opts.sessionId);

  const query = db<ILeadgenSession>("leadgen_sessions").select("id", "email");

  if (sessionIdValid) {
    query.where(function () {
      this.where("id", opts.sessionId as string).orWhereRaw(
        "LOWER(email) = ?",
        [normalizedEmail]
      );
    });
  } else {
    query.whereRaw("LOWER(email) = ?", [normalizedEmail]);
  }

  const rows = (await query) as Array<Pick<ILeadgenSession, "id" | "email">>;

  // Tag each candidate with the match reason. If both match, session_id wins.
  return rows.map((row) => ({
    id: row.id,
    matchedVia:
      sessionIdValid && row.id === opts.sessionId ? "session_id" : "email",
  }));
}

/**
 * Links a newly-created user to their pre-signup leadgen session(s).
 *
 * Never throws. Intended to be called fire-and-forget from the OTP verify
 * handler:
 *
 *   linkAccountCreation({ email, userId: user.id, sessionId: ls }).catch(() => {});
 *
 * Internally everything is already try/catch'd; the outer `.catch` is belt
 * and suspenders for the caller.
 */
export async function linkAccountCreation(
  opts: LinkAccountCreationOptions
): Promise<void> {
  try {
    if (!opts.email || typeof opts.email !== "string") {
      logger.info({ detail: {
                email: opts.email,
              } }, "[LeadgenAccountLinking] invalid email arg");
      return;
    }

    // users.id is `bigint` in Postgres → pg driver returns it as a string
    // by default. Accept both number and numeric-string forms here, coerce
    // once, then work with the number everywhere. Previous strict
    // `typeof === "number"` guard silently rejected every valid signup —
    // causing the account_created event to never fire in production.
    const rawUserId = opts.userId;
    const userIdNum: number =
      typeof rawUserId === "number"
        ? rawUserId
        : typeof rawUserId === "string" && /^\d+$/.test(rawUserId)
          ? Number(rawUserId)
          : NaN;
    if (!Number.isFinite(userIdNum) || !Number.isSafeInteger(userIdNum)) {
      logger.info({ detail: {
                userId: rawUserId,
                typeofUserId: typeof rawUserId,
              } }, "[LeadgenAccountLinking] invalid userId arg");
      return;
    }

    const candidates = await findCandidateSessions({
      email: opts.email,
      sessionId: opts.sessionId,
    });

    if (candidates.length === 0) {
      // Diagnostic — silent return masked the real cause of "account_created
      // never fires" for ages. Now we always log when no candidate session
      // matches so future-us can see it in pm2 logs immediately.
      logger.info({ detail: {
                email: opts.email,
                sessionId: opts.sessionId ?? null,
                userId: userIdNum,
              } }, "[LeadgenAccountLinking] no candidate sessions");
      return;
    }

    const now = new Date();

    for (const candidate of candidates) {
      try {
        // Idempotency check — skip if this session already has an
        // account_created event.
        const existing = await db("leadgen_events")
          .select("id")
          .where({ session_id: candidate.id, event_name: "account_created" })
          .first();

        if (existing) {
          continue;
        }

        await db.transaction(async (trx) => {
          await trx("leadgen_events").insert({
            session_id: candidate.id,
            event_name: "account_created",
            event_data: JSON.stringify({
              user_id: userIdNum,
              linked_via: candidate.matchedVia,
            }),
            created_at: now,
          });

          await trx("leadgen_sessions")
            .where({ id: candidate.id })
            .update({
              final_stage: "account_created",
              completed: true,
              user_id: userIdNum,
              converted_at: now,
              last_seen_at: now,
              updated_at: now,
            });
        });

        logger.info({ detail: {
                      session_id: candidate.id,
                      user_id: userIdNum,
                      matched_via: candidate.matchedVia,
                    } }, "[LeadgenAccountLinking] linked session");
      } catch (innerErr) {
        // Per-session failure — log + continue so one bad row doesn't drop
        // the rest. The idempotency check above means a retry is safe.
        logger.error({ err: {
                      session_id: candidate.id,
                      user_id: userIdNum,
                      error: innerErr,
                    } }, "[LeadgenAccountLinking] failed to link session");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "[LeadgenAccountLinking] linkAccountCreation error:");
  }
}
