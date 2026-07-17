/**
 * Layer 2 acceptance — THE LEAD SURVIVES THE ENFORCE FLAG (§5.2, §11.2).
 *
 * The sibling suite (form-submission-source-route.test.ts) proves the attribution
 * bounds hold under the DEFAULT process mode. This file proves the case that mode
 * cannot reach, and that no test in this repo covered before: what these public
 * routes do when VALIDATION_ENFORCE is set.
 *
 * WHY IT NEEDS ITS OWN FILE. `validate`'s process-wide default is computed ONCE
 * at module load (`const ENV_ENFORCE = ...` in middleware/validate.ts), and the
 * route module calls `validate(...)` at import time when the router is
 * constructed. This file therefore sets the env and loads the app ONCE in
 * `beforeAll`. Per-case full app reloads are both unnecessary and too slow for
 * Vitest's normal 5-second timeout; when one timed out, its unfinished request
 * contaminated the next case's model-call count.
 *
 * THE INVARIANT UNDER TEST: a bad, oversized, or hostile ATTRIBUTION value must
 * never cost the practice the LEAD. Attribution is our telemetry; the lead is the
 * customer's livelihood. Degrading a tracking label to "unknown" is a rounding
 * error — dropping a patient inquiry is silent, unrecoverable, and invisible to
 * the owner, who never learns the person existed and so never complains.
 *
 * Only the DB model and external services are mocked; the real router, real
 * middleware stack, and real controller run.
 */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import express, { type Express } from "express";

vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findPublicActiveById: vi.fn(),
    findActiveByHostnameOrDomain: vi.fn(),
  },
}));
vi.mock("../models/website-builder/FormSubmissionModel", () => ({
  FormSubmissionModel: { create: vi.fn(), markAsFlagged: vi.fn() },
}));
vi.mock("../models/website-builder/WebsiteIntegrationModel", () => ({
  WebsiteIntegrationModel: { findByProjectAndPlatform: vi.fn() },
}));
vi.mock("../services/formRecipientRoutingService", () => ({
  resolveWebsiteFormRecipients: vi.fn(),
}));
vi.mock(
  "../controllers/websiteContact/websiteContact-services/recaptchaService",
  () => ({ verifyRecaptcha: vi.fn() }),
);
vi.mock(
  "../controllers/websiteContact/websiteContact-services/emailWebhookService",
  () => ({
    sendEmailWebhook: vi.fn(),
    WebhookError: class WebhookError extends Error {},
  }),
);

import { ProjectModel } from "../models/website-builder/ProjectModel";
import { FormSubmissionModel } from "../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../models/website-builder/WebsiteIntegrationModel";
import { resolveWebsiteFormRecipients } from "../services/formRecipientRoutingService";
import { verifyRecaptcha } from "../controllers/websiteContact/websiteContact-services/recaptchaService";
import { sendEmailWebhook } from "../controllers/websiteContact/websiteContact-services/emailWebhookService";
import logger from "../lib/logger";

const FORM_ROUTE = "/api/websites/form-submission";
const CONTACT_ROUTE = "/api/websites/contact";

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

/**
 * One enforce-mode module graph for this file. Tests clear mock call state
 * between requests, but never reload the full app.
 */
let enforceApp: Express;
let enforceValidate: typeof import("../middleware/validate").validate;

beforeAll(async () => {
  vi.stubEnv("VALIDATION_ENFORCE", "1");
  ({ app: enforceApp } = await import("../app"));
  ({ validate: enforceValidate } = await import("../middleware/validate"));
});

afterAll(() => {
  vi.unstubAllEnvs();
});

/** The payload the controller handed to the DB for the one created submission. */
function persisted(): Record<string, unknown> {
  const create = vi.mocked(FormSubmissionModel.create);
  expect(create).toHaveBeenCalledTimes(1);
  return create.mock.calls[0][0] as unknown as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
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
  vi.mocked(verifyRecaptcha).mockResolvedValue(true as never);
  vi.mocked(sendEmailWebhook).mockResolvedValue(undefined as never);
  vi.spyOn(logger, "warn").mockImplementation(() => logger);
  vi.spyOn(logger, "error").mockImplementation(() => logger);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public lead capture with VALIDATION_ENFORCE=1 (§5.2, §11.2)", () => {
  it("D1: THE REVIEW FINDING — a real patient's inquiry survives a hostile attribution value", async () => {
    // The exact round-4 case. Before the mode pin, this returned 400 with
    // { fields: ["utm_source"], issues: ["too_big"] } and NEVER called create() —
    // the practice lost a real patient because a marketing tool appended a long
    // tracking parameter the visitor never typed.
    const res = await request(enforceApp)
      .post(FORM_ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, utm_source: "u".repeat(300) });

    // The lead landed, and the patient's own details are in the row.
    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.contents).toMatchObject({
      Name: "Sam Rivera",
      Email: "sam@example.com",
    });
    // The telemetry degraded honestly instead — unknown, never a guess (Value #6).
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
  });

  it("D2: all three attribution fields out of contract — the lead still persists, none reach the row", async () => {
    // Round 3's ask, re-proved in the world round 3 could not see: over-limit
    // source, utm_source, AND first_touch_referrer cannot reach persistence, and
    // still do not cost the submission.
    const oversizedReferrer =
      "https://www.google.com/search?q=" + "a".repeat(3000);

    const res = await request(enforceApp)
      .post(FORM_ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({
        ...BASE_BODY,
        source: "x".repeat(300),
        utm_source: "y".repeat(300),
        first_touch_referrer: oversizedReferrer,
      });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.contents).toMatchObject({ Name: "Sam Rivera" });
    // Not "google" — the oversized referrer was dropped before derivation, so the
    // classifier never saw a string we would have had to invent a bound for.
    expect(row.source).toBeNull();
    expect(row.source_method).toBeNull();
    expect(JSON.stringify(row)).not.toContain("a".repeat(50));
  });

  it("D3: a healthy attribution value still classifies normally under the flag", async () => {
    // The pin must not cost us the FEATURE. Attribution still works when it is in
    // contract — this is not "turn the guard off", it is "drop the note, keep the
    // asset". Without this, D1/D2 could pass on a route that simply ignored
    // attribution entirely.
    const res = await request(enforceApp)
      .post(FORM_ROUTE)
      .set("Referer", "https://drpavanendo.com/contact")
      .send({ ...BASE_BODY, utm_source: "facebook" });

    expect(res.status).toBe(200);
    const row = persisted();
    expect(row.source).toBe("facebook");
    expect(row.source_method).toBe("client_label");
  });

  it("D4: /contact — a patient who writes at length is not turned away by the flag", async () => {
    // The same defect one route up, found by auditing the flag's blast radius
    // rather than the one line the review named. Before this QA round,
    // `message`'s 3,000-char schema bound became a live rejection under the
    // flag: 400 { fields: ["message"] }. The route now enforces types while
    // intentionally leaving legitimate patient-message length unrestricted.
    const res = await request(enforceApp).post(CONTACT_ROUTE).send({
      name: "Sam Rivera",
      phone: "555-0100",
      email: "sam@example.com",
      captchaToken: "tok",
      message: "My tooth has been hurting since ".repeat(120), // > 3,000 chars
    });

    expect(res.status).not.toBe(400);
    expect(vi.mocked(sendEmailWebhook)).toHaveBeenCalledTimes(1);
  });

  it("D5: the pin is SURGICAL — VALIDATION_ENFORCE still enforces on an unpinned route", async () => {
    // The guard against the cheap fix. "Make the lead un-rejectable" must not be
    // achieved by neutering the flag for the whole process — the auth/billing
    // soak still needs to graduate to enforce one day. This proves the flag's
    // default-mode wiring is intact. Only the broad generic-form soak opts out;
    // /contact now enforces an intentionally lead-safe string schema.
    const { z } = await import("zod");

    const app = express();
    app.use(express.json());
    // Unpinned, exactly like the auth/billing mounts: inherits the env default.
    app.post(
      "/t",
      enforceValidate(z.object({ field: z.string().max(5) })),
      (_req, res) => {
        res.status(200).json({ ok: true });
      },
    );

    const res = await request(app).post("/t").send({ field: "way too long" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});
