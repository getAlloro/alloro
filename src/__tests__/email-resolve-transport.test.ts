import { describe, it, expect, vi, beforeEach } from "vitest";
import { resolveTransport } from "../emails/emailService";

describe("resolveTransport", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns mailgun when EMAIL_DEFAULT_TRANSPORT=mailgun", () => {
    vi.stubEnv("EMAIL_DEFAULT_TRANSPORT", "mailgun");
    expect(resolveTransport()).toBe("mailgun");
  });

  it("returns n8n when EMAIL_DEFAULT_TRANSPORT=n8n", () => {
    vi.stubEnv("EMAIL_DEFAULT_TRANSPORT", "n8n");
    expect(resolveTransport()).toBe("n8n");
  });

  it("auto-detects mailgun when API key and domain are present", () => {
    vi.stubEnv("EMAIL_DEFAULT_TRANSPORT", "");
    vi.stubEnv("MAILGUN_API_KEY", "key-abc");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.com");
    expect(resolveTransport()).toBe("mailgun");
  });

  it("falls back to n8n when Mailgun creds are missing", () => {
    vi.stubEnv("EMAIL_DEFAULT_TRANSPORT", "");
    vi.stubEnv("MAILGUN_API_KEY", "");
    vi.stubEnv("MAILGUN_DOMAIN", "");
    expect(resolveTransport()).toBe("n8n");
  });

  it("explicit override wins over auto-detect", () => {
    vi.stubEnv("EMAIL_DEFAULT_TRANSPORT", "n8n");
    vi.stubEnv("MAILGUN_API_KEY", "key-abc");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.com");
    expect(resolveTransport()).toBe("n8n");
  });
});
