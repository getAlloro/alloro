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
