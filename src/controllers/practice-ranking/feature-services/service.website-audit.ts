import axios from "axios";
import {
  isRetryableExternalError,
  RetryAttemptRecord,
  runWithRetry,
} from "./service.ranking-resilience";
import {
  extractSchemaTypes,
  getHtmlAttr,
  getHtmlTitle,
  getMetaContent,
  includesAddressHint,
  normalizeDigits,
  normalizeWebsiteUrl,
  stripHtmlTags,
} from "./service.website-audit-parser";

export type WebsiteAuditStatus = "success" | "partial" | "failed" | "skipped";
export type WebsiteCheckStatus = "pass" | "warn" | "fail" | "unknown";

export interface WebsiteAuditCheck {
  key: string;
  label: string;
  status: WebsiteCheckStatus;
  detail?: string;
}

export interface WebsiteAuditContext {
  phone?: string | null;
  addressLines?: string[];
}

export interface WebsiteAuditResult {
  status: WebsiteAuditStatus;
  auditType: "website_basics";
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  responseTimeMs: number | null;
  redirectCount: number | null;
  checks: WebsiteAuditCheck[];
  title: string | null;
  metaDescription: string | null;
  canonical: string | null;
  schemaTypes: string[];
  retryAttempts?: RetryAttemptRecord[];
  error?: string;
  lcp: null;
  fid: null;
  cls: null;
  performanceScore: null;
  accessibilityScore: null;
  bestPracticesScore: null;
  seoScore: null;
  hasLocalSchema: boolean | null;
  hasOrganizationSchema: boolean | null;
  hasReviewSchema: boolean | null;
  hasFaqSchema: boolean | null;
  mobileFriendly: boolean | null;
  https: boolean | null;
}

const REQUEST_TIMEOUT_MS = 15000;
const AUXILIARY_TIMEOUT_MS = 5000;

async function isReachable(url: string): Promise<boolean> {
  try {
    const response = await axios.get(url, {
      timeout: AUXILIARY_TIMEOUT_MS,
      maxRedirects: 2,
      validateStatus: (status) => status < 500,
    });
    return response.status >= 200 && response.status < 400;
  } catch {
    return false;
  }
}

function failedResult(
  url: string,
  status: WebsiteAuditStatus,
  error: string,
  retryAttempts: RetryAttemptRecord[] = [],
): WebsiteAuditResult {
  return {
    status,
    auditType: "website_basics",
    url,
    finalUrl: null,
    httpStatus: null,
    responseTimeMs: null,
    redirectCount: null,
    checks: [],
    title: null,
    metaDescription: null,
    canonical: null,
    schemaTypes: [],
    retryAttempts,
    error,
    lcp: null,
    fid: null,
    cls: null,
    performanceScore: null,
    accessibilityScore: null,
    bestPracticesScore: null,
    seoScore: null,
    hasLocalSchema: null,
    hasOrganizationSchema: null,
    hasReviewSchema: null,
    hasFaqSchema: null,
    mobileFriendly: null,
    https: null,
  };
}

export async function auditWebsite(
  candidateUrl: string,
  context: WebsiteAuditContext = {},
): Promise<WebsiteAuditResult> {
  const normalizedUrl = normalizeWebsiteUrl(candidateUrl);
  if (!normalizedUrl) {
    return failedResult(candidateUrl, "skipped", "Website URL is invalid or missing");
  }

  try {
    const startedAt = Date.now();
    const { value: response, attempts } = await runWithRetry(
      async () => {
        const response = await axios.get(normalizedUrl, {
          timeout: REQUEST_TIMEOUT_MS,
          maxRedirects: 5,
          responseType: "text",
          validateStatus: () => true,
          headers: {
            "User-Agent":
              "AlloroRankingWebsiteBasics/1.0 (+https://alloro.ai)",
          },
        });
        if (response.status >= 500) {
          throw Object.assign(
            new Error(`Website returned HTTP ${response.status}`),
            { status: response.status },
          );
        }
        return response;
      },
      {
        label: `Website basics audit ${normalizedUrl}`,
        maxAttempts: 3,
        shouldRetry: isRetryableExternalError,
      },
    );

    const html = typeof response.data === "string" ? response.data : "";
    const finalUrl =
      response.request?.res?.responseUrl || response.config?.url || normalizedUrl;
    const redirectCount = response.request?._redirectable?._redirectCount ?? 0;
    const title = getHtmlTitle(html);
    const metaDescription = getMetaContent(html, "description");
    const viewport = getMetaContent(html, "viewport");
    const robots = getMetaContent(html, "robots");
    const canonical = getHtmlAttr(
      html,
      /<link[^>]+rel=["']canonical["'][^>]*>|<link[^>]+href=["'][^"']+["'][^>]+rel=["']canonical["'][^>]*>/i,
      "href",
    );
    const schemaTypes = extractSchemaTypes(html);
    const text = stripHtmlTags(html).toLowerCase();
    const origin = new URL(finalUrl).origin;
    const phoneDigits = normalizeDigits(context.phone);
    const pageDigits = normalizeDigits(text);
    const hasPhoneHint =
      phoneDigits.length >= 7 && pageDigits.includes(phoneDigits.slice(-7));
    const hasAddressHint = includesAddressHint(text, context.addressLines || []);
    const hasNoindex = !!robots?.toLowerCase().includes("noindex");
    const hasLocalSchema = schemaTypes.some((type) =>
      ["localbusiness", "dentist", "medicalbusiness"].some((schema) =>
        type.includes(schema),
      ),
    );

    const [robotsReachable, sitemapReachable] = await Promise.all([
      isReachable(`${origin}/robots.txt`),
      isReachable(`${origin}/sitemap.xml`),
    ]);

    const checks: WebsiteAuditCheck[] = [
      {
        key: "http_status",
        label: "Website reachable",
        status:
          response.status >= 200 && response.status < 400 ? "pass" : "fail",
        detail: `HTTP ${response.status}`,
      },
      {
        key: "https",
        label: "Uses HTTPS",
        status: finalUrl.startsWith("https://") ? "pass" : "warn",
      },
      {
        key: "title",
        label: "Page title",
        status: title ? "pass" : "warn",
      },
      {
        key: "meta_description",
        label: "Meta description",
        status: metaDescription ? "pass" : "warn",
      },
      {
        key: "viewport",
        label: "Mobile viewport",
        status: viewport ? "pass" : "warn",
      },
      {
        key: "canonical",
        label: "Canonical URL",
        status: canonical ? "pass" : "unknown",
      },
      {
        key: "robots_noindex",
        label: "Not blocked by noindex",
        status: hasNoindex ? "fail" : "pass",
      },
      {
        key: "local_schema",
        label: "Local business schema",
        status: hasLocalSchema ? "pass" : "unknown",
      },
      {
        key: "phone_hint",
        label: "Phone appears on page",
        status: phoneDigits.length >= 7 ? (hasPhoneHint ? "pass" : "warn") : "unknown",
      },
      {
        key: "address_hint",
        label: "Address appears on page",
        status:
          context.addressLines && context.addressLines.length > 0
            ? hasAddressHint
              ? "pass"
              : "warn"
            : "unknown",
      },
      {
        key: "robots_txt",
        label: "robots.txt reachable",
        status: robotsReachable ? "pass" : "unknown",
      },
      {
        key: "sitemap",
        label: "Sitemap reachable",
        status: sitemapReachable ? "pass" : "unknown",
      },
    ];

    const hasFail = checks.some((check) => check.status === "fail");
    return {
      status: hasFail ? "partial" : "success",
      auditType: "website_basics",
      url: normalizedUrl,
      finalUrl,
      httpStatus: response.status,
      responseTimeMs: Date.now() - startedAt,
      redirectCount,
      checks,
      title,
      metaDescription,
      canonical,
      schemaTypes,
      retryAttempts: attempts,
      lcp: null,
      fid: null,
      cls: null,
      performanceScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      seoScore: null,
      hasLocalSchema,
      hasOrganizationSchema: schemaTypes.some((type) =>
        type.includes("organization"),
      ),
      hasReviewSchema: schemaTypes.some(
        (type) => type.includes("review") || type.includes("aggregaterating"),
      ),
      hasFaqSchema: schemaTypes.some((type) => type.includes("faq")),
      mobileFriendly: viewport ? true : null,
      https: finalUrl.startsWith("https://"),
    };
  } catch (error: any) {
    return failedResult(
      normalizedUrl,
      "failed",
      error.message || String(error),
      Array.isArray(error.retryAttempts) ? error.retryAttempts : [],
    );
  }
}
