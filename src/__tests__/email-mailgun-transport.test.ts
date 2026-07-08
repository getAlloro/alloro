import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { sendViaMailgun } from "../emails/transport/mailgunTransport";
import type { MailgunMessage } from "../emails/types";

vi.mock("axios");
const mockedAxios = vi.mocked(axios, true);

const TEST_MESSAGE: MailgunMessage = {
  from: "Alloro <info@getalloro.com>",
  to: ["test@example.com"],
  subject: "Test",
  html: "<p>Hello</p>",
};

describe("sendViaMailgun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns error when MAILGUN_API_KEY is missing", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.com");

    const result = await sendViaMailgun(TEST_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.error).toContain("MAILGUN_API_KEY");
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it("returns error when MAILGUN_DOMAIN is missing", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-abc123");
    vi.stubEnv("MAILGUN_DOMAIN", "");

    const result = await sendViaMailgun(TEST_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.error).toContain("MAILGUN_DOMAIN");
  });

  it("sends via Mailgun API and returns the message id", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-abc123");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.com");

    mockedAxios.post.mockResolvedValueOnce({
      data: { id: "<msg-id@mail.example.com>", message: "Queued" },
      status: 200,
    });

    const result = await sendViaMailgun(TEST_MESSAGE);

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("<msg-id@mail.example.com>");
    expect(result.status).toBe(200);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.mailgun.net/v3/mail.example.com/messages",
      expect.any(String),
      expect.objectContaining({
        auth: { username: "api", password: "key-abc123" },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );
  });

  it("uses custom API base for EU region", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-abc123");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.com");
    vi.stubEnv("MAILGUN_API_BASE", "https://api.eu.mailgun.net");

    mockedAxios.post.mockResolvedValueOnce({
      data: { id: "<eu-id@mail.example.com>" },
      status: 200,
    });

    await sendViaMailgun(TEST_MESSAGE);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://api.eu.mailgun.net/v3/mail.example.com/messages",
      expect.any(String),
      expect.any(Object)
    );
  });

  it("returns error on HTTP failure without throwing", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-abc123");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.com");

    mockedAxios.post.mockRejectedValueOnce({
      response: {
        data: { message: "Domain not found" },
        status: 404,
      },
      message: "Request failed",
    });

    const result = await sendViaMailgun(TEST_MESSAGE);

    expect(result.success).toBe(false);
    expect(result.error).toBe("Domain not found");
    expect(result.status).toBe(404);
  });

  it("includes cc and bcc in the form body", async () => {
    vi.stubEnv("MAILGUN_API_KEY", "key-abc123");
    vi.stubEnv("MAILGUN_DOMAIN", "mail.example.com");

    mockedAxios.post.mockResolvedValueOnce({
      data: { id: "<id@mail.example.com>" },
      status: 200,
    });

    const message: MailgunMessage = {
      ...TEST_MESSAGE,
      cc: ["cc@example.com"],
      bcc: ["bcc@example.com"],
    };
    await sendViaMailgun(message);

    const formBody = mockedAxios.post.mock.calls[0][1] as string;
    expect(formBody).toContain("cc=cc%40example.com");
    expect(formBody).toContain("bcc=bcc%40example.com");
  });
});
