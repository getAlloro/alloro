/**
 * Route-level proof for the enforced /contact string boundary (§5.2, §11.2).
 *
 * The controller passes every contact field to a string-only sanitizer. The
 * route must therefore reject arrays/objects before the controller runs, while
 * keeping legitimate long patient messages intact.
 */

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
  it("preserves and delivers a legitimate long patient message", async () => {
    const marker = "LAST_CLINICAL_DETAIL";
    const message =
      "My symptoms and treatment history need more detail. ".repeat(200) +
      marker;

    const res = await request(app).post(ROUTE).send({
      ...BASE_BODY,
      message,
    });

    expect(res.status).toBe(200);
    expect(verifyRecaptcha).toHaveBeenCalledTimes(1);
    expect(sendEmailWebhook).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmailWebhook).mock.calls[0][0].body).toContain(marker);
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
});
