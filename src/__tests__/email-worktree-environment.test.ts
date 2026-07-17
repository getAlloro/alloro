import { beforeEach, describe, expect, it, vi } from "vitest";

const { dotenvConfig } = vi.hoisted(() => ({
  dotenvConfig: vi.fn(),
}));

vi.mock("dotenv", () => ({
  config: dotenvConfig,
  default: {
    config: dotenvConfig,
  },
}));

async function loadEmailService() {
  return import("../emails/emailService");
}

describe("emailService worktree environment loading", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("EMAIL_DEFAULT_TRANSPORT", "n8n");
    vi.stubEnv(
      "ALLORO_EMAIL_SERVICE_WEBHOOK",
      "http://127.0.0.1:43125/email",
    );
    vi.stubEnv("ALLORO_EMAIL_LOG_DIR", "/tmp/alloro-email-test");
  });

  it("does not read the checkout dotenv file in worktree test mode", async () => {
    vi.stubEnv("ALLORO_WORKTREE_TEST_MODE", "true");

    await loadEmailService();

    expect(dotenvConfig).not.toHaveBeenCalled();
  });

  it("keeps normal dotenv loading outside worktree test mode", async () => {
    vi.stubEnv("ALLORO_WORKTREE_TEST_MODE", "false");

    await loadEmailService();

    expect(dotenvConfig).toHaveBeenCalled();
  });
});
