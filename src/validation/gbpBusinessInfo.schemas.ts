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

/** google.type.TimeOfDay — hours 0-24 (24 = end-of-day close), minutes 0-59. */
const timeOfDaySchema = z.object({
  hours: z.number().int().min(0).max(24).optional(),
  minutes: z.number().int().min(0).max(59).optional(),
  seconds: z.number().int().min(0).max(59).optional(),
  nanos: z.number().int().min(0).optional(),
});

/** One open/close window in RegularHours.periods. */
const timePeriodSchema = z.object({
  openDay: z.enum(DAYS_OF_WEEK),
  closeDay: z.enum(DAYS_OF_WEEK),
  openTime: timeOfDaySchema,
  closeTime: timeOfDaySchema,
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
