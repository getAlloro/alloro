/**
 * GBP business-info write-back route schemas (src/routes/gbpAutomation.ts).
 *
 * §11.2 — input validation happens at the route level via schemas from
 * `validation/` applied as middleware. This endpoint stages a live external
 * update to the owner's Google Business Profile, and it is NEW (no legacy
 * clients), so the schema is ENFORCED from day one — the same decision as
 * `purchaseLocationSchema` in billing.schemas.ts.
 *
 * Shape notes:
 *   • Only the writable slice-1 fields are accepted (title, categories,
 *     phoneNumbers, websiteUri, regularHours, profile). Every other key —
 *     including storefrontAddress, which is deliberately not writable in this
 *     slice (see feature-utils/gbpBusinessInfo.ts) — is stripped at the
 *     boundary and never reaches the controller.
 *   • Nested Google shapes (category, phone, hours) are validated structurally
 *     against the Business Information API v1 messages, and unknown nested
 *     keys are stripped so only known keys can travel outward.
 *   • The controller's allowlist/sanitizer (parseBusinessInfoDraftInput) stays
 *     as defense in depth behind this boundary.
 */

import { z } from "zod";

const DAYS_OF_WEEK = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

/** google.type.TimeOfDay bounds. 24:00:00.000000000 is Google's end-of-day close. */
const END_OF_DAY_HOUR = 24;
const MAX_NANOS = 999_999_999;
const NANOS_PER_SECOND = 1_000_000_000;
const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;

/**
 * google.type.TimeOfDay — hours 0-24 (24 = end-of-day close), minutes/seconds
 * 0-59, nanos 0-999,999,999.
 *
 * The per-field ranges alone would still admit shapes Google rejects, so the
 * refinement closes the gap: hour 24 is the *end-of-day sentinel*, valid only as
 * exactly 24:00:00.000000000 — `24:59` is not a real time and must not travel
 * outward to a live profile.
 */
const timeOfDaySchema = z
  .object({
    hours: z.number().int().min(0).max(END_OF_DAY_HOUR).optional(),
    minutes: z.number().int().min(0).max(59).optional(),
    seconds: z.number().int().min(0).max(59).optional(),
    nanos: z.number().int().min(0).max(MAX_NANOS).optional(),
  })
  .superRefine((time, ctx) => {
    if (
      time.hours === END_OF_DAY_HOUR &&
      ((time.minutes ?? 0) > 0 || (time.seconds ?? 0) > 0 || (time.nanos ?? 0) > 0)
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "hour 24 is end-of-day and must be exactly 24:00:00 (no minutes, seconds, or nanos)",
      });
    }
  });

/**
 * An absent TimeOfDay field means zero (Google's convention: an empty openTime
 * is midnight), so ordering compares full nanos-of-day with 0 defaults.
 */
function timeOfDayToNanosOfDay(time: z.infer<typeof timeOfDaySchema>): number {
  const seconds =
    (time.hours ?? 0) * SECONDS_PER_HOUR +
    (time.minutes ?? 0) * SECONDS_PER_MINUTE +
    (time.seconds ?? 0);
  return seconds * NANOS_PER_SECOND + (time.nanos ?? 0);
}

/**
 * One open/close window in RegularHours.periods.
 *
 * Ordering is only meaningful WITHIN a single day. When `closeDay` differs from
 * `openDay` the period legitimately crosses midnight (open MONDAY 18:00 → close
 * TUESDAY 02:00), and a close earlier than the open is exactly how Google
 * expresses that — so overnight windows are deliberately left unconstrained.
 * A same-day window, though, must close strictly after it opens; equal times are
 * a zero-length window, not a real one. Open 00:00 → close 24:00 (open all day)
 * stays valid under this rule.
 */
const timePeriodSchema = z
  .object({
    openDay: z.enum(DAYS_OF_WEEK),
    closeDay: z.enum(DAYS_OF_WEEK),
    openTime: timeOfDaySchema,
    closeTime: timeOfDaySchema,
  })
  .superRefine((period, ctx) => {
    if (period.openDay !== period.closeDay) {
      return;
    }
    if (timeOfDayToNanosOfDay(period.closeTime) <= timeOfDayToNanosOfDay(period.openTime)) {
      ctx.addIssue({
        code: "custom",
        path: ["closeTime"],
        message:
          "closeTime must be after openTime on the same day; use a later closeDay for a window that crosses midnight",
      });
    }
  });

/** RegularHours — up to 8 windows per day across 7 days. */
const regularHoursSchema = z.object({
  periods: z.array(timePeriodSchema).max(56),
});

/** A Business Profile category reference (categories/gcid:*). */
const categorySchema = z.object({
  name: z.string().trim().min(1).max(255),
  displayName: z.string().trim().max(255).optional(),
});

const categoriesSchema = z
  .object({
    primaryCategory: categorySchema.optional(),
    additionalCategories: z.array(categorySchema).max(20).optional(),
  })
  .refine(
    (value) =>
      value.primaryCategory !== undefined ||
      (value.additionalCategories?.length ?? 0) > 0,
    { message: "categories must include a primaryCategory or additionalCategories" }
  );

/** Loose international phone shape: digits plus common separators, 3-30 chars. */
const phoneStringSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^\+?[\d\s\-().]+$/, "phone numbers may only contain digits and separators");

const phoneNumbersSchema = z
  .object({
    primaryPhone: phoneStringSchema.optional(),
    additionalPhones: z.array(phoneStringSchema).max(2).optional(),
  })
  .refine(
    (value) =>
      value.primaryPhone !== undefined || (value.additionalPhones?.length ?? 0) > 0,
    { message: "phoneNumbers must include a primaryPhone or additionalPhones" }
  );

/**
 * POST /api/gbp-automation/business-info/draft — { fields, locationId? }.
 * `locationId` is read by the location-scope layer and clientContext; keep it.
 * All fields are optional individually, but at least one writable field must
 * survive parsing (an empty update can never produce an updateMask).
 */
export const businessInfoDraftSchema = z.object({
  locationId: z
    .union([z.number().int().positive(), z.string().trim().min(1).max(32)])
    .optional(),
  fields: z
    .object({
      title: z.string().trim().min(1).max(100).optional(),
      categories: categoriesSchema.optional(),
      phoneNumbers: phoneNumbersSchema.optional(),
      websiteUri: z
        .string()
        .trim()
        .min(1)
        .max(2048)
        .regex(/^https?:\/\//i, "websiteUri must be an http(s) URL")
        .optional(),
      regularHours: regularHoursSchema.optional(),
      profile: z
        .object({ description: z.string().trim().min(1).max(750) })
        .optional(),
    })
    .refine((fields) => Object.values(fields).some((value) => value !== undefined), {
      message: "Provide at least one profile field to update.",
    }),
});

export type BusinessInfoDraftBody = z.infer<typeof businessInfoDraftSchema>;
