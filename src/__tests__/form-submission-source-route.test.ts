/**
 * Layer 2 acceptance — source PROVENANCE survives the real request path.
 *
 * The unit tests in sourceAttribution.test.ts prove the derivation. This file
 * proves the thing the review actually asked about (§5.2): that what reaches the
 * PERSISTED ROW carries the method next to the label, so a browser's claim can
 * never be stored with a server classification's authority.
 *
 * It drives the real Express app over HTTP (real router, real validation
 * middleware, real controller, real host filtering) via Supertest. Only the DB
 * model and the external services are mocked — the DB write is captured and
 * asserted instead of executed, because this repo has no local Postgres and the
 * shared dev DB must never take an unmerged migration (AGENTS.md deploy path).
 */

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findPublicActiveById: vi.fn(),
    findActiveByHostnameOrDomain: vi.fn(),
  },
}));
vi.mock("../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: {
    create: vi.fn(),
    markAsFlagged: vi.fn(),
  },
}));
vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: { findByProjectAndPlatform: vi.fn() },
}));
vi.mock("../services/formRecipientRoutingService", () => ({
  resolveWebsiteFormRecipients: vi.fn(),
}));

import { app } from "./helpers/app";
import { ProjectModel } from "../models/website-builder/ProjectModel";
import { FormSubmissionModel } from "../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../models/website-builder/WebsiteIntegrationModel";
import { resolveWebsiteFormRecipients } from "../services/formRecipientRoutingService";
import logger from "../lib/logger";

const ROUTE = "/api/websites/form-submission";

/** Own hosts → drpavan.sites.getalloro.com + drpavanendo.com (see the controller). */
const PROJECT = {
  id: "proj-1",
  hostname: "drpavan",
  generated_hostname: null,
  custom_domain: "drpavanendo.com",
  custom_domain_alt: null,
  organization_id: 7,
  recipients: [],
  primary_color: "#0e8988",
};

/** A trusted form type skips the AI/spam path — irrelevant to attribution. */
const BASE_BODY = {
  projectId: "proj-1",
  formName: "Contact Us",
  formType: "onboarding",
  contents: { Name: "Sam Rivera", Email: "sam@example.com" },
};

/** The payload the controller handed to the DB for the one created submission. */
function persisted(): Record<string, unknown> {
  const create = vi.mocked(FormSubmissionModel.create);
  expect(create).toHaveBeenCalledTimes(1);
  return create.mock.calls[0][0] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  vi.mocked(ProjectModel.findPublicActiveById).mockResolvedValue(
    PROJECT as never,
  );
  vi.mocked(FormSubmissionModel.create).mockResolvedValue({
    id: "sub-1",
  } as never);
  vi.mocked(WebsiteIntegrationModel.findByProjectAndPlatform).mockResolvedValue(
    null as never,
  );
  vi.mocked(resolveWebsiteFormRecipients).mockResolvedValue({
    recipients: [],
  } as never);
  vi.spyOn(logger, "warn").mockImplementation(() => logger);
  vi.spyOn(logger, "error").mockImplementation(() => logger);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("POST /api/websites/form-submission — stored source provenance (§5.2)", () => {
  it("A1: a utm_source claim is stored as a CLAIM, not as a classification", async () => {
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, utm_source: "facebook" });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBe("facebook");
    expect(row.source_method).toBe("client_label");
  });

  it("A2: a forwarded first-touch referrer is stored as client_referrer", async () => {
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, first_touch_referrer: "https://www.google.com/" });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBe("google");
    expect(row.source_method).toBe("client_referrer");
  });

  it("A3: a cross-site submit Referer header is stored as header_referrer", async () => {
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://www.bing.com/")
      .send({ ...BASE_BODY });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBe("bing");
    expect(row.source_method).toBe("header_referrer");
  });

  it("A4: THE REVIEW FINDING — the same label 'google' stores a DIFFERENT method per signal", async () => {
    // A claim of google and a classification of google are no longer the same row.
    await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, source: "google" });
    const claimed = persisted();

    vi.mocked(FormSubmissionModel.create).mockClear();

    await request(app)
      .post(ROUTE)
      .set("Referer", "https://www.google.com/")
      .send({ ...BASE_BODY });
    const classified = persisted();

    expect(claimed.source).toBe("google");
    expect(classified.source).toBe("google");
    expect(claimed.source_method).toBe("client_label");
    expect(classified.source_method).toBe("header_referrer");
    expect(claimed.source_method).not.toBe(classified.source_method);
  });

  it("A5: an internal-only journey stores unknown — no source, no invented method", async () => {
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
  });

  it("A6: a PII-shaped utm_source reaches neither column", async () => {
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, utm_source: "jane.doe:1987-03-04" });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
    expect(JSON.stringify(row)).not.toContain("jane.doe");
  });

  // A8 in the acceptance artifact is the (waived) real-DB migration item — no
  // test can exist for it here, so the route-level series resumes at A9.
  it("A9: an oversized utm_source is DROPPED at the boundary — never stored, lead still saved", async () => {
    // Was: this asserted warn-only pass-through as correct, i.e. it codified the
    // gap. The bound is now enforced by `sanitize`, so the value never reaches
    // the controller at all — and the submission still succeeds (see A12).
    const oversized = "facebook".padEnd(200, "x"); // > the 100-char label cap

    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, utm_source: oversized });

    // The boundary dropped it, and logged the field NAME only — never the value.
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ fields: expect.arrayContaining(["utm_source"]) }),
      expect.stringContaining("sanitize"),
    );
    const warnedPayload = JSON.stringify(vi.mocked(logger.warn).mock.calls);
    expect(warnedPayload).not.toContain(oversized);

    // The lead landed; the out-of-contract label reached neither column.
    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
    expect(JSON.stringify(row)).not.toContain(oversized);
  });

  it("A10: THE REVIEW FINDING — an oversized first_touch_referrer cannot reach persistence", async () => {
    // The exact case the review named: a 3,000-character Google referrer was
    // rejected by Zod and still derived { source: "google", method:
    // "client_referrer" }, because warn-only let it reach the controller and
    // `hostOf` parses a URL of any length. The bound now actually holds, so the
    // signal is dropped and the honest answer is unknown.
    const oversizedReferrer = "https://www.google.com/search?q=" + "a".repeat(3000);

    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact") // internal → no fallback
      .send({ ...BASE_BODY, first_touch_referrer: oversizedReferrer });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).not.toBe("google");
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
  });

  it("A11: an oversized source label cannot reach persistence", async () => {
    // HONESTY: this one passes with OR without the sanitize middleware — the
    // closed allow-list already blocks it (normalizeSource truncates to 100
    // chars, and a 100-char string is never an allow-list key). It is a
    // defense-in-depth lock on the end state, NOT proof of the new guard. A10
    // and A13 are the tests that actually fail without it.
    const oversized = "google".padEnd(150, "z");

    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, source: oversized });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
    expect(JSON.stringify(row)).not.toContain(oversized);
  });

  it("A12: THE LEAD IS NEVER LOST — all three fields out of contract, submission still persists", async () => {
    // The reason this endpoint sanitizes instead of enforcing. If anyone later
    // flips these three to hard 400s, THIS test fails — and it should, because a
    // practice losing a real patient inquiry over a tracking parameter is a far
    // worse outcome than a null source.
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({
        ...BASE_BODY,
        source: "x".repeat(300),
        utm_source: "y".repeat(300),
        first_touch_referrer: "https://www.google.com/?q=" + "z".repeat(4000),
      });

    // 200, not 400 — and the visitor's actual message is in the row.
    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.contents).toMatchObject({ Name: "Sam Rivera" });
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
  });

  it("A13: sanitizing holds even when the legacy form schema fails for an unrelated reason", async () => {
    // The trap this design avoids. `hostname` here is over its 255-char cap, so
    // `formSubmissionSchema` fails as a whole and warn-mode passes the body
    // through untouched. If the attribution bound rode along inside THAT parse,
    // an unrelated long hostname would silently switch the guard off. It is its
    // own middleware precisely so this request is still sanitized.
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({
        ...BASE_BODY,
        hostname: "h".repeat(400), // busts formSubmissionSchema
        first_touch_referrer: "https://www.google.com/x?q=" + "a".repeat(3000),
      });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).not.toBe("google");
    expect(row.source).toBeNull();
  });

  it("A14: one out-of-contract field does not discard a healthy sibling", async () => {
    // Each field catches independently — a garbage `source` must not cost us a
    // perfectly good `utm_source`. (Also passes pre-fix, via the derivation's
    // own fall-through; it locks that `sanitize` did not REGRESS it — a
    // whole-object schema without per-field `.catch` would fail here.)
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, source: "s".repeat(300), utm_source: "facebook" });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBe("facebook");
    expect(row.source_method).toBe("client_label");
  });

  it("A15: a non-string attribution value is dropped, not coerced", async () => {
    // Also passes pre-fix — the controller's own `typeof === "string"` checks
    // backstop this. Kept as a lock so a future refactor that trusts the
    // boundary (per §11.2) cannot quietly regress it.
    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, utm_source: { evil: "object" }, source: 12345 });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
  });

  it("A7: the row never carries a 'verified' provenance value", async () => {
    await request(app)
      .post(ROUTE)
      .set("Referer", "https://www.google.com/")
      .send({ ...BASE_BODY, utm_source: "facebook" });

    const row = persisted();
    expect(["client_label", "client_referrer", "header_referrer"]).toContain(
      row.source_method,
    );
    expect(row.source_method).not.toBe("verified");
  });
});
