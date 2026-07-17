/**
 * Route-level proof for the enforced /contact string boundary (§5.2, §11.2).
 *
 * The controller passes every contact field to a string-only sanitizer. The
 * route must therefore reject arrays/objects before the controller runs, while
 * keeping legitimate long patient messages intact.
 */

import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

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

import { app } from "./helpers/app";
import { verifyRecaptcha } from "../controllers/websiteContact/websiteContact-services/recaptchaService";
import { sendEmailWebhook } from "../controllers/websiteContact/websiteContact-services/emailWebhookService";
import {
  CONTACT_MESSAGE_MAX_CHARS,
  CONTACT_RATE_LIMIT_MAX_REQUESTS,
  CONTACT_REQUEST_BODY_MAX_BYTES,
} from "../config/websiteContact";
import { createContactSubmissionLimiter } from "../middleware/websiteContactProtection";

const ROUTE = "/api/websites/contact";
const BASE_BODY = {
  name: "Sam Rivera",
  phone: "555-0100",
  email: "sam@example.com",
  captchaToken: "tok",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(verifyRecaptcha).mockResolvedValue(true as never);
  vi.mocked(sendEmailWebhook).mockResolvedValue(undefined as never);
});

describe("POST /api/websites/contact — authoritative string boundary", () => {
  it("preserves and delivers a patient message exactly at the ceiling", async () => {
    const marker = "LAST_CLINICAL_DETAIL";
    const message =
      "x".repeat(CONTACT_MESSAGE_MAX_CHARS - marker.length) + marker;

    const res = await request(app).post(ROUTE).send({
      ...BASE_BODY,
      message,
    });

    expect(res.status).toBe(200);
    expect(res.headers["ratelimit-limit"]).toBe(
      String(CONTACT_RATE_LIMIT_MAX_REQUESTS),
    );
    expect(verifyRecaptcha).toHaveBeenCalledTimes(1);
    expect(sendEmailWebhook).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmailWebhook).mock.calls[0][0].body).toContain(marker);
  });

  it("rejects a patient message one character over the ceiling", async () => {
    const res = await request(app).post(ROUTE).send({
      ...BASE_BODY,
      message: "x".repeat(CONTACT_MESSAGE_MAX_CHARS + 1),
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        details: {
          fields: expect.arrayContaining(["message"]),
          issues: expect.arrayContaining(["too_big"]),
        },
      },
    });
    expect(verifyRecaptcha).not.toHaveBeenCalled();
    expect(sendEmailWebhook).not.toHaveBeenCalled();
  });

  it("rejects a JSON request over the route-specific byte ceiling", async () => {
    const res = await request(app).post(ROUTE).send({
      ...BASE_BODY,
      message: "x".repeat(CONTACT_REQUEST_BODY_MAX_BYTES),
    });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "CONTACT_REQUEST_TOO_LARGE",
        message: "Contact form request is too large.",
        details: { maxBytes: CONTACT_REQUEST_BODY_MAX_BYTES },
      },
    });
    expect(verifyRecaptcha).not.toHaveBeenCalled();
    expect(sendEmailWebhook).not.toHaveBeenCalled();
  });

  it.each([
    ["name", ["Sam Rivera"]],
    ["phone", { raw: "555-0100" }],
    ["email", ["sam@example.com"]],
    ["captchaToken", { token: "tok" }],
    ["service", ["Root canal"]],
    ["message", { history: "long" }],
  ])("rejects a non-string %s before the controller runs", async (field, value) => {
    const res = await request(app).post(ROUTE).send({
      ...BASE_BODY,
      [field]: value,
    });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_ERROR",
        details: {
          fields: expect.arrayContaining([field]),
          issues: expect.arrayContaining(["invalid_type"]),
        },
      },
    });
    expect(verifyRecaptcha).not.toHaveBeenCalled();
    expect(sendEmailWebhook).not.toHaveBeenCalled();
  });

  it("rate-limits repeated public contact requests with a canonical error", async () => {
    const limiterApp = express();
    limiterApp.use(express.json());
    limiterApp.post(
      "/contact",
      createContactSubmissionLimiter(2),
      (_req, res) => res.status(200).json({ ok: true }),
    );

    expect((await request(limiterApp).post("/contact").send({})).status).toBe(
      200,
    );
    expect((await request(limiterApp).post("/contact").send({})).status).toBe(
      200,
    );

    const limited = await request(limiterApp).post("/contact").send({});
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({
      success: false,
      data: null,
      error: {
        code: "CONTACT_RATE_LIMITED",
        message: "Too many contact requests. Please wait before trying again.",
        details: null,
      },
    });
  });
});
