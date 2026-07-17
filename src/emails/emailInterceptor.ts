/**
 * Email Interceptor
 *
 * Decides whether this process may send live email by verifying the
 * machine's own identity: live sending is allowed only when the box's
 * public IP is among the DNS A records of app.getalloro.com. Anywhere
 * else (dev.getalloro.com, localhost, CI, unknown) every email is
 * intercepted: recipients rewritten to dave@getalloro.com strictly,
 * cc/bcc stripped, subject prefixed with "[Intercepted] ".
 *
 * Deliberately ignores env vars, NODE_ENV, and request Host headers —
 * configuration can be copied between machines, identity cannot. Any
 * failure to determine identity (DNS error, IP lookup timeout) fails
 * closed into interception. Interception reroutes; it never drops mail.
 */

import axios from "axios";
import { promises as dns } from "dns";
import net from "node:net";
import logger from "../lib/logger";

const LIVE_HOST = "app.getalloro.com";
const INTERCEPT_RECIPIENT = "dave@getalloro.com";
const SUBJECT_PREFIX = "[Intercepted] ";
const PUBLIC_IP_SERVICE = "https://checkip.amazonaws.com";
const CHECK_TIMEOUT_MS = 5_000;
const VERDICT_TTL_MS = 10 * 60 * 1000;
const WORKTREE_TEST_MODE_ENV = "ALLORO_WORKTREE_TEST_MODE";
const WORKTREE_TEST_MODE_VALUE = "true";
const WORKTREE_EMAIL_TRANSPORT = "n8n";

let cachedVerdict: { live: boolean; expiresAt: number } | null = null;
let inFlightCheck: Promise<boolean> | null = null;

export function isWorktreeEmailCaptureMode(): boolean {
  return process.env[WORKTREE_TEST_MODE_ENV] === WORKTREE_TEST_MODE_VALUE;
}

function normalizeHostname(value: string): string {
  const hostname = value.trim().toLowerCase();
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    return hostname.slice(1, -1);
  }
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

function isLocalCaptureHostname(value: string): boolean {
  const hostname = normalizeHostname(value);
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return true;
  if (net.isIP(hostname) === 4) return Number(hostname.split(".", 1)[0]) === 127;
  return hostname === "::1" || hostname.startsWith("::ffff:127.");
}

export function assertWorktreeEmailCaptureConfiguration(): void {
  if (!isWorktreeEmailCaptureMode()) return;
  if (process.env.EMAIL_DEFAULT_TRANSPORT !== WORKTREE_EMAIL_TRANSPORT) {
    throw new Error(
      "Worktree email mode requires EMAIL_DEFAULT_TRANSPORT=n8n.",
    );
  }

  const webhookValue = process.env.ALLORO_EMAIL_SERVICE_WEBHOOK;
  let webhookUrl: URL;
  try {
    webhookUrl = new URL(webhookValue ?? "");
  } catch {
    throw new Error(
      "Worktree email mode requires a valid local email capture webhook.",
    );
  }
  const port = Number(webhookUrl.port);
  if (
    webhookUrl.protocol !== "http:"
    || webhookUrl.username !== ""
    || webhookUrl.password !== ""
    || !isLocalCaptureHostname(webhookUrl.hostname)
    || !Number.isInteger(port)
    || port <= 0
    || port > 65_535
  ) {
    throw new Error(
      "Worktree email mode requires an HTTP webhook on loopback or *.localhost with an explicit port.",
    );
  }
}

async function fetchOwnPublicIp(): Promise<string> {
  const response = await axios.get(PUBLIC_IP_SERVICE, {
    timeout: CHECK_TIMEOUT_MS,
    responseType: "text",
  });
  return String(response.data).trim();
}

async function checkIsLiveSender(): Promise<boolean> {
  try {
    const [liveIps, ownIp] = await Promise.all([
      dns.resolve4(LIVE_HOST),
      fetchOwnPublicIp(),
    ]);
    return ownIp.length > 0 && liveIps.includes(ownIp);
  } catch (error) {
    logger.warn(
      {
        operation: "email-live-sender-check",
        liveHost: LIVE_HOST,
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Email sender identity check failed closed.",
    );
    return false;
  }
}

/**
 * True only when this machine's public IP matches an A record of
 * app.getalloro.com. Verdict is cached for VERDICT_TTL_MS; concurrent
 * callers share a single in-flight check.
 */
export async function isLiveSender(): Promise<boolean> {
  if (isWorktreeEmailCaptureMode()) {
    assertWorktreeEmailCaptureConfiguration();
    return false;
  }
  if (cachedVerdict && Date.now() < cachedVerdict.expiresAt) {
    return cachedVerdict.live;
  }
  if (!inFlightCheck) {
    inFlightCheck = checkIsLiveSender()
      .then((live) => {
        cachedVerdict = { live, expiresAt: Date.now() + VERDICT_TTL_MS };
        return live;
      })
      .finally(() => {
        inFlightCheck = null;
      });
  }
  return inFlightCheck;
}

export interface InterceptableEmail {
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
}

export interface InterceptionResult<T extends InterceptableEmail> {
  payload: T;
  intercepted: boolean;
  /** Every address (to/cc/bcc) the email would have reached. */
  originalRecipients: string[];
}

/**
 * Returns the payload untouched on the live sender; otherwise returns a
 * copy rerouted to the intercept recipient only, with cc/bcc emptied and
 * the subject prefixed.
 */
export async function interceptEmailPayload<T extends InterceptableEmail>(
  payload: T
): Promise<InterceptionResult<T>> {
  const originalRecipients = [
    ...payload.recipients,
    ...(payload.cc || []),
    ...(payload.bcc || []),
  ];

  if (isWorktreeEmailCaptureMode()) {
    assertWorktreeEmailCaptureConfiguration();
    return {
      payload,
      intercepted: true,
      originalRecipients,
    };
  }

  if (await isLiveSender()) {
    return {
      payload,
      intercepted: false,
      originalRecipients: payload.recipients,
    };
  }

  const intercepted = {
    ...payload,
    recipients: [INTERCEPT_RECIPIENT],
    cc: [],
    bcc: [],
    subject: `${SUBJECT_PREFIX}${payload.subject}`,
  } as T;

  return { payload: intercepted, intercepted: true, originalRecipients };
}

// Prime the verdict cache at startup so the first email doesn't pay for
// the network round-trips; a failed warm-up just re-checks on first send.
if (isWorktreeEmailCaptureMode()) {
  assertWorktreeEmailCaptureConfiguration();
} else if (process.env.VITEST !== "true") {
  void isLiveSender().catch((error: unknown) => {
    logger.error(
      {
        operation: "email-live-sender-warmup",
        errorType: error instanceof Error ? error.name : "UnknownError",
      },
      "Email sender identity warm-up failed.",
    );
  });
}

// Export configuration for testing
export const interceptorConfig = {
  liveHost: LIVE_HOST,
  interceptRecipient: INTERCEPT_RECIPIENT,
  subjectPrefix: SUBJECT_PREFIX,
  verdictTtlMs: VERDICT_TTL_MS,
  worktreeTestModeEnv: WORKTREE_TEST_MODE_ENV,
};
