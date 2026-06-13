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

const LIVE_HOST = "app.getalloro.com";
const INTERCEPT_RECIPIENT = "dave@getalloro.com";
const SUBJECT_PREFIX = "[Intercepted] ";
const PUBLIC_IP_SERVICE = "https://checkip.amazonaws.com";
const CHECK_TIMEOUT_MS = 5_000;
const VERDICT_TTL_MS = 10 * 60 * 1000;

let cachedVerdict: { live: boolean; expiresAt: number } | null = null;
let inFlightCheck: Promise<boolean> | null = null;

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
  } catch {
    return false;
  }
}

/**
 * True only when this machine's public IP matches an A record of
 * app.getalloro.com. Verdict is cached for VERDICT_TTL_MS; concurrent
 * callers share a single in-flight check.
 */
export async function isLiveSender(): Promise<boolean> {
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
  if (await isLiveSender()) {
    return {
      payload,
      intercepted: false,
      originalRecipients: payload.recipients,
    };
  }

  const originalRecipients = [
    ...payload.recipients,
    ...(payload.cc || []),
    ...(payload.bcc || []),
  ];

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
void isLiveSender();

// Export configuration for testing
export const interceptorConfig = {
  liveHost: LIVE_HOST,
  interceptRecipient: INTERCEPT_RECIPIENT,
  subjectPrefix: SUBJECT_PREFIX,
  verdictTtlMs: VERDICT_TTL_MS,
};
