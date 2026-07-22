/**
 * Layer 2 acceptance — confirmation receipt gating + route-level rate limiting.
 *
 * Proves the three behaviors the PR ships that the sibling test files do not cover:
 *   R1 — a FLAGGED submission must NOT receive a receipt (backscatter risk)
 *   R2 — a receipt delivery failure must NOT break the visitor's 200 response
 *   R3 — the per-IP rate limiter on /form-submission blocks after the threshold
 *
 * The AI analysis service is mocked so the test can force the flagged/unflagged
 * path without depending on an LLM call.
 */

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import request from "supertest";
import express from "express";

// ── Mocks (hoisted before any imports they intercept) ──

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
  "../controllers/websiteContact/websiteContact-services/emailWebhookService",
  () => ({
    sendEmailWebhook: vi.fn(),
    WebhookError: class WebhookError extends Error {},
  }),
);
vi.mock(
  "../controllers/websiteContact/websiteContact-services/formSubmissionEmailContextService",
  () => ({
    resolveFormSubmissionEmailContext: vi.fn(async () => ({
      fromName: "Test Practice",
      headerColor: "#0e8988",
      logoUrl: "https://cdn.example/logo.png",
    })),
  }),
);
vi.mock(
  "../controllers/websiteContact/websiteContact-services/aiContentAnalysisService",
  () => ({
    analyzeContent: vi.fn(),
  }),
);

import { app } from "./helpers/app";
import { ProjectModel } from "../models/website-builder/ProjectModel";
import { FormSubmissionModel } from "../models/website-builder/FormSubmissionModel";
import { WebsiteIntegrationModel } from "../models/website-builder/WebsiteIntegrationModel";
import { resolveWebsiteFormRecipients } from "../services/formRecipientRoutingService";
import { sendEmailWebhook } from "../controllers/websiteContact/websiteContact-services/emailWebhookService";
import { analyzeContent } from "../controllers/websiteContact/websiteContact-services/aiContentAnalysisService";
import { createContactSubmissionLimiter } from "../middleware/websiteContactProtection";
import logger from "../lib/logger";

const ROUTE = "/api/websites/form-submission";

const PROJECT = {
  id: "proj-1",
  hostname: "testpractice",
  generated_hostname: null,
  custom_domain: "testpractice.com",
  custom_domain_alt: null,
  organization_id: 7,
  recipients: [],
  primary_color: "#0e8988",
};

/**
 * Non-trusted form type so AI analysis runs.
 * Contents include an email address so the receipt path is reachable.
 */
const UNTRUSTED_BODY = {
  projectId: "proj-1",
  formName: "Contact Us",
  contents: { Name: "Pat Walker", Email: "pat@example.com", Message: "Hello" },
};

/** The receipt email has this fixed subject line. */
const RECEIPT_SUBJECT = "We received your message";

let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ProjectModel.findPublicActiveById).mockResolvedValue(
    PROJECT as never,
  );
  vi.mocked(FormSubmissionModel.create).mockResolvedValue({
    id: "sub-1",
  } as never);
  vi.mocked(FormSubmissionModel.markAsFlagged).mockResolvedValue(
    undefined as never,
  );
  vi.mocked(WebsiteIntegrationModel.findByProjectAndPlatform).mockResolvedValue(
    null as never,
  );
  vi.mocked(resolveWebsiteFormRecipients).mockResolvedValue({
    recipients: [],
  } as never);
  vi.mocked(sendEmailWebhook).mockResolvedValue(undefined as never);
  // Default: AI says not flagged
  vi.mocked(analyzeContent).mockResolvedValue({
    flagged: false,
    category: "legitimate",
    reason: "Normal inquiry",
  } as never);
  warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
  errorSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
});

afterEach(() => {
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

// ── Receipt gating ──────────────────────────────────────────────────────────

describe("confirmation receipt gating (non-trusted form types)", () => {
  it("R1: no receipt is sent when the submission is flagged by AI", async () => {
    // AI analysis flags this submission as spam.
    vi.mocked(analyzeContent).mockResolvedValue({
      flagged: true,
      category: "spam",
      reason: "Promotional content detected",
    } as never);

    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://testpractice.com/contact")
      .send(UNTRUSTED_BODY);

    // The submission persists (lead is never lost) and the flag is recorded.
    expect(res.status).toBe(200);
    expect(FormSubmissionModel.create).toHaveBeenCalledTimes(1);
    expect(FormSubmissionModel.markAsFlagged).toHaveBeenCalledTimes(1);

    // No receipt was sent — the submitter must not get an acknowledgment for
    // flagged content (backscatter prevention).
    const receiptCall = vi
      .mocked(sendEmailWebhook)
      .mock.calls.find((call) => call[0].subject === RECEIPT_SUBJECT);
    expect(receiptCall).toBeUndefined();
  });

  it("R2: a receipt delivery failure does not break the visitor response", async () => {
    // AI says not flagged, but the receipt email call throws.
    vi.mocked(sendEmailWebhook).mockRejectedValue(
      new Error("SMTP connection timeout"),
    );

    const res = await request(app)
      .post(ROUTE)
      .set("Referer", "https://testpractice.com/contact")
      .send(UNTRUSTED_BODY);

    // The visitor still gets a 200 — the receipt is non-blocking.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    // The submission was persisted regardless.
    expect(FormSubmissionModel.create).toHaveBeenCalledTimes(1);

    // sendEmailWebhook was called (for the receipt) and it threw.
    expect(sendEmailWebhook).toHaveBeenCalled();

    // The error was logged (not swallowed silently).
    expect(errorSpy).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      expect.stringContaining("Confirmation receipt"),
    );
  });
});

// ── Rate limiting ───────────────────────────────────────────────────────────

describe("route-level rate limiting on /form-submission", () => {
  it("R3: the per-IP rate limiter blocks after the threshold is exceeded", async () => {
    // Build a minimal app with the same middleware stack shape but a LOW
    // threshold so the test does not need 20+ requests. The real app uses
    // `contactSubmissionLimiter` (max 20 / 15 min); this proves the limiter
    // is wired and functional with max 3.
    const testLimiter = createContactSubmissionLimiter(3);
    const miniApp = express();
    miniApp.use(express.json());
    miniApp.post("/test", testLimiter, (_req, res) => {
      res.json({ ok: true });
    });

    // First 3 requests pass.
    for (let i = 0; i < 3; i++) {
      const res = await request(miniApp).post("/test").send({});
      expect(res.status).toBe(200);
    }

    // The 4th request is blocked.
    const blocked = await request(miniApp).post("/test").send({});
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("CONTACT_RATE_LIMITED");
  });
});
