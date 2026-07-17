import { beforeEach, describe, expect, it, vi } from "vitest";

const { axiosGet, dnsResolve4 } = vi.hoisted(() => ({
  axiosGet: vi.fn(),
  dnsResolve4: vi.fn(),
}));

vi.mock("axios", () => ({
  default: {
    get: axiosGet,
  },
}));

vi.mock("dns", () => ({
  promises: {
    resolve4: dnsResolve4,
  },
}));

const LOCAL_CAPTURE_WEBHOOK = "http://127.0.0.1:43125/email";

async function loadInterceptor() {
  return import("../emails/emailInterceptor");
}

describe("emailInterceptor worktree capture mode", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("ALLORO_WORKTREE_TEST_MODE", "true");
    vi.stubEnv("EMAIL_DEFAULT_TRANSPORT", "n8n");
    vi.stubEnv("ALLORO_EMAIL_SERVICE_WEBHOOK", LOCAL_CAPTURE_WEBHOOK);
  });

  it("preserves local capture evidence without public IP or DNS discovery", async () => {
    const { interceptEmailPayload } = await loadInterceptor();
    const payload = {
      recipients: ["recipient@example.test"],
      cc: ["copy@example.test"],
      bcc: ["audit@example.test"],
      subject: "Synthetic worktree email",
      body: "<p>Fixture body</p>",
    };

    const result = await interceptEmailPayload(payload);

    expect(result).toEqual({
      payload,
      intercepted: true,
      originalRecipients: [
        "recipient@example.test",
        "copy@example.test",
        "audit@example.test",
      ],
    });
    expect(axiosGet).not.toHaveBeenCalled();
    expect(dnsResolve4).not.toHaveBeenCalled();
  });

  it("fails fast when the worktree webhook is not local", async () => {
    vi.stubEnv(
      "ALLORO_EMAIL_SERVICE_WEBHOOK",
      "https://email.example.test/capture?token=synthetic-secret",
    );

    await expect(loadInterceptor()).rejects.toThrow(
      "requires an HTTP webhook on loopback",
    );
    expect(axiosGet).not.toHaveBeenCalled();
    expect(dnsResolve4).not.toHaveBeenCalled();
  });

  it("retains the normal live-sender identity check outside worktree mode", async () => {
    vi.stubEnv("ALLORO_WORKTREE_TEST_MODE", "false");
    dnsResolve4.mockResolvedValue(["203.0.113.10"]);
    axiosGet.mockResolvedValue({ data: "203.0.113.10\n" });
    const { isLiveSender } = await loadInterceptor();

    await expect(isLiveSender()).resolves.toBe(true);
    expect(dnsResolve4).toHaveBeenCalledWith("app.getalloro.com");
    expect(axiosGet).toHaveBeenCalledOnce();
  });
});
