import { extractDomainFromUrl } from "../../places/feature-utils/domainExtractor";
import logger from "../../../lib/logger";

export interface DomainCheckResult {
  status: "valid" | "warning" | "unreachable";
  message: string;
}

const DOMAIN_REGEX = /^[a-z0-9]+([-.][a-z0-9]+)*\.[a-z]{2,}$/;

/**
 * Known firewall/challenge page signatures in response bodies.
 */
const FIREWALL_SIGNATURES = [
  "cf-browser-verification",
  "cf_chl_opt",
  "challenge-platform",
  "Just a moment...",
  "Checking your browser",
  "sucuri_cloudproxy",
  "Access Denied",
  "Attention Required! | Cloudflare",
];

/**
 * Block SSRF: reject domains that resolve to internal/private ranges.
 */
function isSafeDomain(domain: string): boolean {
  const blocked = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]",
    "metadata.google.internal",
    "169.254.169.254",
  ];

  if (blocked.includes(domain.toLowerCase())) return false;
  if (domain.match(/^10\./)) return false;
  if (domain.match(/^172\.(1[6-9]|2\d|3[01])\./)) return false;
  if (domain.match(/^192\.168\./)) return false;

  return true;
}

/**
 * Check if a domain is reachable and not behind a firewall.
 *
 * Returns:
 * - valid: domain responds with HTML, no firewall detected
 * - warning: domain responds but looks like a firewall/challenge page
 * - unreachable: domain does not respond at all
 */
export async function checkDomain(domain: string): Promise<DomainCheckResult> {
  const cleaned = domain.trim().toLowerCase();

  if (!DOMAIN_REGEX.test(cleaned)) {
    return { status: "unreachable", message: "Invalid domain format" };
  }

  if (!isSafeDomain(cleaned)) {
    return { status: "unreachable", message: "Invalid domain format" };
  }

  try {
    const response = await fetch(`https://${cleaned}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; AlloroBot/1.0; +https://getalloro.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(10_000),
      redirect: "follow",
    });

    if (!response.ok) {
      // 403/503 often indicate firewall
      if (response.status === 403 || response.status === 503) {
        return {
          status: "warning",
          message: `Domain returned ${response.status} — possible firewall or bot protection`,
        };
      }

      return {
        status: "unreachable",
        message: `Domain returned HTTP ${response.status}`,
      };
    }

    const contentType = response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return {
        status: "warning",
        message: "Domain did not return HTML content",
      };
    }

    // Read a portion of the body to check for firewall signatures
    const body = await response.text();
    const snippet = body.substring(0, 5000).toLowerCase();

    for (const sig of FIREWALL_SIGNATURES) {
      if (snippet.includes(sig.toLowerCase())) {
        return {
          status: "warning",
          message:
            "Domain appears to be behind a firewall or bot protection — this may limit our ability to analyze your website",
        };
      }
    }

    return { status: "valid", message: "Domain is reachable" };
  } catch (error: any) {
    logger.error(
      `[DomainCheck] Failed to reach ${cleaned}: ${error.message}`
    );

    return {
      status: "unreachable",
      message: "Could not reach this domain — please verify the URL is correct",
    };
  }
}

/**
 * Extract a clean domain from a GBP websiteUri.
 * Re-exports the shared utility for convenience.
 */
export { extractDomainFromUrl };
