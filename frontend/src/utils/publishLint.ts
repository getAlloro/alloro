import { headExternalResource } from "../api";

export type PublishLintWarning = {
  type: "missing-alt" | "dead-internal-link" | "heading-jump" | "large-image";
  message: string;
};

const LARGE_IMAGE_BYTES = 500 * 1024;
const MAX_IMAGE_SIZE_CHECKS = 20;

function normalizePath(href: string): string {
  const withoutQuery = href.split(/[?#]/)[0];
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery;
}

function findMissingAlt(doc: Document): PublishLintWarning[] {
  const missing = Array.from(doc.querySelectorAll("img")).filter(
    (img) => !(img.getAttribute("alt") || "").trim(),
  );
  if (missing.length === 0) return [];
  return [
    {
      type: "missing-alt",
      message: `${missing.length} image${missing.length === 1 ? "" : "s"} missing alt text`,
    },
  ];
}

function findDeadInternalLinks(
  doc: Document,
  knownPaths: string[],
): PublishLintWarning[] {
  const known = new Set(knownPaths.map(normalizePath));
  const dead = new Set<string>();

  doc.querySelectorAll('a[href^="/"]').forEach((anchor) => {
    const href = normalizePath(anchor.getAttribute("href") || "");
    if (href && !known.has(href)) dead.add(href);
  });

  return Array.from(dead)
    .slice(0, 5)
    .map((href) => ({
      type: "dead-internal-link" as const,
      message: `Internal link to ${href} matches no page`,
    }));
}

function findHeadingJumps(doc: Document): PublishLintWarning[] {
  const sections = doc.querySelectorAll("[data-alloro-section]");
  const jumps: string[] = [];

  sections.forEach((section) => {
    const name = section.getAttribute("data-alloro-section") || "section";
    let previousLevel = 0;
    section.querySelectorAll("h1, h2, h3, h4, h5, h6").forEach((heading) => {
      const level = Number(heading.tagName.slice(1));
      if (previousLevel > 0 && level > previousLevel + 1) {
        jumps.push(`${name} (h${previousLevel} → h${level})`);
      }
      previousLevel = level;
    });
  });

  return jumps.slice(0, 3).map((detail) => ({
    type: "heading-jump" as const,
    message: `Heading level jump in ${detail}`,
  }));
}

/**
 * Best-effort image weight check via HEAD content-length. S3/CDN CORS may
 * block these requests entirely — failures are silently skipped so the lint
 * never delays or breaks publishing.
 */
async function findLargeImages(doc: Document): Promise<PublishLintWarning[]> {
  const urls = Array.from(doc.querySelectorAll("img"))
    .map((img) => img.getAttribute("src") || "")
    .filter((src) => /^https?:\/\//.test(src))
    .slice(0, MAX_IMAGE_SIZE_CHECKS);

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const response = await headExternalResource(url);
      const length = Number(response.headers.get("content-length") || 0);
      return { url, length };
    }),
  );

  const heavy = results
    .filter(
      (r): r is PromiseFulfilledResult<{ url: string; length: number }> =>
        r.status === "fulfilled" && r.value.length > LARGE_IMAGE_BYTES,
    )
    .map((r) => r.value);

  return heavy.slice(0, 5).map(({ url, length }) => ({
    type: "large-image" as const,
    message: `${url.split("/").pop() || "image"} is ${(length / 1024 / 1024).toFixed(1)} MB — consider compressing`,
  }));
}

/**
 * Advisory pre-publish checks on the assembled page HTML. Never blocks
 * publishing — results render as dismissible warning chips in the publish
 * confirmation.
 */
export async function runPublishLint(
  html: string,
  knownPaths: string[],
): Promise<PublishLintWarning[]> {
  const doc = new DOMParser().parseFromString(html, "text/html");

  const warnings: PublishLintWarning[] = [
    ...findMissingAlt(doc),
    ...findDeadInternalLinks(doc, knownPaths),
    ...findHeadingJumps(doc),
  ];

  try {
    warnings.push(...(await findLargeImages(doc)));
  } catch {
    // Image weight check is strictly best-effort.
  }

  return warnings;
}
