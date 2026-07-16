/**
 * Boundary contract for the public form-submission schema (§11.2).
 *
 * THE REVIEW FINDING: `source`, `utm_source`, and `first_touch_referrer` are
 * read by formSubmissionController (~439-448), but the schema is
 * `.passthrough()` — so before this pass the boundary had no type or length
 * definition for any of them. These tests pin the definitions so a later edit
 * cannot quietly drop them back into passthrough.
 *
 * WHAT THIS PROVES, PRECISELY: the schema's own verdict (`safeParse`). It does
 * NOT prove a request is rejected — the route mounts `validate` in warn-only
 * mode by default (VALIDATION_ENFORCE gates enforcement, see middleware/
 * validate.ts), so today a would-be rejection is logged and the request
 * proceeds. That is deliberate: these definitions make the warn soak able to
 * SEE an out-of-contract field, which is the prerequisite for flipping to
 * enforce. The runtime guarantee that a bad label is never STORED comes from
 * the closed allow-list/classifier, covered in sourceAttribution.test.ts and
 * form-submission-source-route.test.ts (defense in depth — both layers, on
 * purpose).
 */

import { describe, expect, it } from "vitest";
import { formSubmissionSchema } from "../validation/websiteContact.schemas";

/** Mirrors the caps in the schema (capture contract + browser URL cap). */
const SOURCE_LABEL_MAX = 100;
const REFERRER_URL_MAX = 2048;

const BASE = {
  projectId: "proj-1",
  formName: "Contact Us",
  contents: { Name: "Sam Rivera" },
};

/** The issue codes zod raises for a given body, keyed by dotted field path. */
function issuesFor(body: Record<string, unknown>): Array<{
  field: string;
  code: string;
}> {
  const result = formSubmissionSchema.safeParse(body);
  if (result.success) return [];
  return result.error.issues.map((issue) => ({
    field: issue.path.join("."),
    code: issue.code,
  }));
}

describe("formSubmissionSchema — first-touch attribution boundary (§11.2)", () => {
  it("B1: defines all three attribution fields (they are no longer bare passthrough)", () => {
    // The regression guard for the review finding: an unknown key is tolerated
    // by passthrough, but these three must be KNOWN to the schema. An
    // out-of-contract value therefore produces an issue instead of sailing
    // through silently.
    for (const field of ["source", "utm_source", "first_touch_referrer"]) {
      const issues = issuesFor({ ...BASE, [field]: 12345 });
      expect(
        issues,
        `${field} must be defined at the boundary, not passthrough`,
      ).toContainEqual({ field, code: "invalid_type" });
    }
  });

  it("B2: accepts an in-contract first-touch payload and preserves the values", () => {
    const result = formSubmissionSchema.safeParse({
      ...BASE,
      source: "facebook",
      utm_source: "google",
      first_touch_referrer: "https://www.google.com/search?q=endodontist",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.source).toBe("facebook");
    expect(result.data.utm_source).toBe("google");
    expect(result.data.first_touch_referrer).toBe(
      "https://www.google.com/search?q=endodontist",
    );
  });

  it("B3: all three are optional — a submission without them is in contract", () => {
    // The M0 sender is not built yet; a form that forwards nothing is honest
    // "unknown", never a validation miss.
    const result = formSubmissionSchema.safeParse(BASE);
    expect(result.success).toBe(true);
  });

  // ── Error paths (§20.2) ──────────────────────────────────────────────────
  it("B4: a channel label over the capture contract's cap is out of contract", () => {
    for (const field of ["source", "utm_source"]) {
      const atCap = issuesFor({ ...BASE, [field]: "a".repeat(SOURCE_LABEL_MAX) });
      expect(atCap, `${field} at exactly the cap is in contract`).toEqual([]);

      const overCap = issuesFor({
        ...BASE,
        [field]: "a".repeat(SOURCE_LABEL_MAX + 1),
      });
      expect(overCap).toContainEqual({ field, code: "too_big" });
    }
  });

  it("B5: a referrer over the URL cap is out of contract", () => {
    const atCap = issuesFor({
      ...BASE,
      first_touch_referrer: "h".repeat(REFERRER_URL_MAX),
    });
    expect(atCap).toEqual([]);

    const overCap = issuesFor({
      ...BASE,
      first_touch_referrer: "h".repeat(REFERRER_URL_MAX + 1),
    });
    expect(overCap).toContainEqual({
      field: "first_touch_referrer",
      code: "too_big",
    });
  });

  it("B6: non-string attribution values are out of contract", () => {
    // An unbounded object/array on a public endpoint is the shape a schema is
    // supposed to name. Each must be caught as a type miss.
    const cases: Array<unknown> = [
      { nested: "object" },
      ["array"],
      42,
      true,
      null,
    ];
    for (const value of cases) {
      const issues = issuesFor({ ...BASE, source: value });
      expect(
        issues.some((i) => i.field === "source"),
        `source: ${JSON.stringify(value)} must raise an issue`,
      ).toBe(true);
    }
  });

  it("B7: an over-length label reports ONLY field names + codes (no values)", () => {
    // The middleware logs whatever the issue carries. Field names and codes are
    // safe; a zod message echoing the value would put a personalized utm (which
    // can carry patient PII) into the logs. Assert the summary shape the
    // middleware actually reads is value-free.
    const secret = "jane.doe-1987-03-04".padEnd(SOURCE_LABEL_MAX + 1, "x");
    const issues = issuesFor({ ...BASE, utm_source: secret });

    expect(issues).toContainEqual({ field: "utm_source", code: "too_big" });
    expect(JSON.stringify(issues)).not.toContain("jane.doe");
  });

  it("B8: passthrough still tolerates honeypot/anti-bot and arbitrary form keys", () => {
    // Adding the three definitions must not tighten the rest of the body —
    // the permissive-first posture for unknown keys is deliberate.
    const result = formSubmissionSchema.safeParse({
      ...BASE,
      _hp: "",
      _ts: "1721160000000",
      _jsc: "1",
      "Custom Question 4": "yes",
    });
    expect(result.success).toBe(true);
  });
});
