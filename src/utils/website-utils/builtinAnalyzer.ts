import logger from "../../lib/logger";

/**
 * Built-in Analysis Flags
 *
 * Deterministic, token-free checks that run before LLM analysis.
 * Catches broken links, bad HTML, architecture violations, and content issues.
 */

export interface BuiltinRecommendation {
  flagType: string;
  targetType: "page_section" | "layout" | "post";
  targetId: string;
  targetLabel: string;
  targetMeta: Record<string, unknown>;
  recommendation: string;
  instruction: string;
  currentHtml: string;
}

interface AnalyzerInput {
  layouts: Array<{ field: string; html: string; projectId: string }>;
  pages: Array<{
    id: string;
    path: string;
    sections: Array<{ name: string; content: string; index: number }>;
  }>;
  posts: Array<{ id: string; title: string; content: string }>;
  existingPaths: string[];
  existingPostSlugs: string[];
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function analyzeBuiltinFlags(input: AnalyzerInput): BuiltinRecommendation[] {
  const results: BuiltinRecommendation[] = [];
  const allPhones: Array<{ phone: string; label: string }> = [];

  // --- Layouts ---
  for (const layout of input.layouts) {
    if (!layout.html || layout.html.trim().length === 0) continue;

    const label = `Layout > ${capitalize(layout.field)}`;
    const ctx: CheckContext = {
      targetType: "layout",
      targetId: layout.projectId,
      targetLabel: label,
      targetMeta: { layout_field: layout.field },
      currentHtml: layout.html,
    };

    results.push(...checkBrokenInternalLinks(layout.html, input.existingPaths, input.existingPostSlugs, ctx));
    results.push(...checkNestedAnchors(layout.html, ctx));
    results.push(...checkEmptyHrefs(layout.html, ctx));
    results.push(...checkHtmlExtensionLinks(layout.html, ctx));
    results.push(...checkHardcodedNav(layout.html, layout.field, ctx));
    results.push(...checkDuplicateHoneypots(layout.html, ctx));
    results.push(...checkPlaceholderText(layout.html, ctx));
    results.push(...checkHardcodedCopyright(layout.html, ctx));
    allPhones.push(...extractPhones(layout.html, label));
  }

  // --- Pages ---
  const h1CountByPage = new Map<string, number>();

  for (const page of input.pages) {
    let pageH1Count = 0;

    for (const section of page.sections) {
      if (!section.content || section.content.trim().length === 0) continue;
      if (section.content.trim().length < 100 && /\{\{.*\}\}/.test(section.content)) continue;

      const label = `${page.path} > ${section.name}`;
      const ctx: CheckContext = {
        targetType: "page_section",
        targetId: page.id,
        targetLabel: label,
        targetMeta: { section_index: section.index, section_name: section.name, page_path: page.path },
        currentHtml: section.content,
      };

      results.push(...checkBrokenInternalLinks(section.content, input.existingPaths, input.existingPostSlugs, ctx));
      results.push(...checkNestedAnchors(section.content, ctx));
      results.push(...checkEmptyHrefs(section.content, ctx));
      results.push(...checkHtmlExtensionLinks(section.content, ctx));
      results.push(...checkMissingAltText(section.content, ctx));
      results.push(...checkDuplicateHoneypots(section.content, ctx));
      results.push(...checkPlaceholderText(section.content, ctx));
      results.push(...checkHardcodedCopyright(section.content, ctx));

      const h1Matches = section.content.match(/<h1[\s>]/gi);
      if (h1Matches) pageH1Count += h1Matches.length;
      allPhones.push(...extractPhones(section.content, label));
    }

    h1CountByPage.set(page.path, pageH1Count);
  }

  // --- Posts ---
  for (const post of input.posts) {
    if (!post.content || post.content.trim().length === 0) continue;

    const label = `Post: ${post.title}`;
    const ctx: CheckContext = {
      targetType: "post",
      targetId: post.id,
      targetLabel: label,
      targetMeta: {},
      currentHtml: post.content,
    };

    results.push(...checkBrokenInternalLinks(post.content, input.existingPaths, input.existingPostSlugs, ctx));
    results.push(...checkNestedAnchors(post.content, ctx));
    results.push(...checkEmptyHrefs(post.content, ctx));
    results.push(...checkHtmlExtensionLinks(post.content, ctx));
    results.push(...checkMissingAltText(post.content, ctx));
    results.push(...checkPlaceholderText(post.content, ctx));
    allPhones.push(...extractPhones(post.content, label));
  }

  // --- Cross-target: multiple H1 ---
  for (const [pagePath, count] of h1CountByPage) {
    if (count > 1) {
      const page = input.pages.find((p) => p.path === pagePath);
      if (page && page.sections.length > 0) {
        results.push({
          flagType: "fix_seo",
          targetType: "page_section",
          targetId: page.id,
          targetLabel: `${pagePath} > ${page.sections[0].name}`,
          targetMeta: { section_index: 0, section_name: page.sections[0].name, page_path: pagePath },
          recommendation: `Page "${pagePath}" has ${count} H1 tags — should have exactly one. Demote extras to H2.`,
          instruction: `This page has ${count} <h1> tags. Keep the most important one as <h1> and change all others to <h2>.`,
          currentHtml: page.sections[0].content,
        });
      }
    }
  }

  // --- Cross-target: phone inconsistency ---
  // Multi-location practices legitimately have different numbers (one per office).
  // Only flag if there are more than 6 unique numbers (likely a data issue) or if
  // a number appears only once (possible typo).
  const uniquePhones = new Set(allPhones.map((p) => normalizePhone(p.phone)));
  if (uniquePhones.size > 6 && input.layouts.length > 0) {
    results.push({
      flagType: "fix_content",
      targetType: "layout",
      targetId: input.layouts[0].projectId,
      targetLabel: "Site-wide",
      targetMeta: {},
      recommendation: `Found ${uniquePhones.size} different phone numbers across the site — this seems unusually high. Verify all numbers are correct.`,
      instruction: `${uniquePhones.size} unique phone numbers detected. Verify each belongs to a real office location.`,
      currentHtml: "",
    });
  }

  logger.info(`[BuiltinAnalyzer] Found ${results.length} flag(s)`);
  return results;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

interface CheckContext {
  targetType: "page_section" | "layout" | "post";
  targetId: string;
  targetLabel: string;
  targetMeta: Record<string, unknown>;
  currentHtml: string;
}

function checkBrokenInternalLinks(
  html: string,
  existingPaths: string[],
  existingPostSlugs: string[],
  ctx: CheckContext
): BuiltinRecommendation[] {
  const results: BuiltinRecommendation[] = [];
  const hrefRegex = /href=["'](\/([\w\-\/]+))["']/g;
  let match: RegExpExecArray | null;
  const checked = new Set<string>();

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (checked.has(href)) continue;
    checked.add(href);
    if (href === "/" || href.startsWith("/#") || href.startsWith("/api/")) continue;

    const normalized = href.endsWith("/") ? href.slice(0, -1) : href;
    if (existingPaths.includes(normalized)) continue;

    const segments = normalized.split("/").filter(Boolean);
    if (segments.length === 2 && existingPostSlugs.includes(`${segments[0]}/${segments[1]}`)) continue;

    results.push({
      flagType: "fix_broken_link",
      ...ctx,
      recommendation: `Broken internal link: "${href}" — no page or post exists at this path.`,
      instruction: `The link href="${href}" points to a non-existent page. Update the URL, remove the link, or create the target page.`,
    });
  }

  return results;
}

function checkNestedAnchors(html: string, ctx: CheckContext): BuiltinRecommendation[] {
  if (/<a\s[^>]*>(?:(?!<\/a>)[\s\S])*<a\s/gi.test(html)) {
    return [{
      flagType: "fix_html",
      ...ctx,
      recommendation: "Nested anchor tags (<a> inside <a>) — invalid HTML causing navigation issues.",
      instruction: "Remove the outer <a> tag or restructure. Nested <a> tags are invalid HTML.",
    }];
  }
  return [];
}

function checkEmptyHrefs(html: string, ctx: CheckContext): BuiltinRecommendation[] {
  const visibleEmpty = (html.match(/href=["']#?["'](?![^>]*data-alloro-hidden)/g) || []).length;
  if (visibleEmpty > 0) {
    return [{
      flagType: "fix_broken_link",
      ...ctx,
      recommendation: `Found ${visibleEmpty} link(s) with empty or "#" href — dead links.`,
      instruction: `Update href="#" links to point to actual pages, or remove them.`,
    }];
  }
  return [];
}

function checkHtmlExtensionLinks(html: string, ctx: CheckContext): BuiltinRecommendation[] {
  const matches = html.match(/href=["'][^"']*\.html["']/gi);
  if (matches && matches.length > 0) {
    return [{
      flagType: "fix_broken_link",
      ...ctx,
      recommendation: `Found ${matches.length} link(s) with .html extensions — old site artifacts. Alloro uses clean URLs.`,
      instruction: `Remove .html extensions from all href values. "about.html" → "/about", "services.html" → "/services".`,
    }];
  }
  return [];
}

function checkMissingAltText(html: string, ctx: CheckContext): BuiltinRecommendation[] {
  const missing = html.match(/<img(?![^>]*\balt=)[^>]*>/gi);
  if (missing && missing.length > 0) {
    return [{
      flagType: "fix_seo",
      ...ctx,
      recommendation: `Found ${missing.length} image(s) missing alt text — hurts accessibility and SEO.`,
      instruction: `Add descriptive alt attributes to all <img> tags missing them.`,
    }];
  }
  return [];
}

function checkHardcodedNav(html: string, layoutField: string, ctx: CheckContext): BuiltinRecommendation[] {
  if (layoutField !== "header" && layoutField !== "footer") return [];
  if (/\{\{\s*menu\s/.test(html)) return [];

  const navMatch = html.match(/<(?:nav|ul)[^>]*>[\s\S]*?<\/(?:nav|ul)>/gi);
  if (navMatch) {
    for (const nav of navMatch) {
      const linkCount = (nav.match(/<a\s/gi) || []).length;
      if (linkCount >= 3) {
        return [{
          flagType: "fix_architecture",
          ...ctx,
          recommendation: `${capitalize(layoutField)} has hardcoded navigation (${linkCount} links). Should use {{ menu }} shortcode.`,
          instruction: `Replace hardcoded nav with {{ menu id='${layoutField === "header" ? "main-menu" : "footer-menu"}' }} shortcode.`,
        }];
      }
    }
  }
  return [];
}

function checkDuplicateHoneypots(html: string, ctx: CheckContext): BuiltinRecommendation[] {
  const hp1 = html.match(/<input[^>]*name=["']website_url["'][^>]*type=["']hidden["'][^>]*>/gi) || [];
  const hp2 = html.match(/<input[^>]*type=["']hidden["'][^>]*name=["']website_url["'][^>]*>/gi) || [];
  const total = new Set([...hp1, ...hp2]).size;

  if (total > 1) {
    return [{
      flagType: "fix_html",
      ...ctx,
      recommendation: `Found ${total} duplicate honeypot inputs — only one needed.`,
      instruction: `Remove all but one <input name="website_url" type="hidden"> element.`,
    }];
  }
  return [];
}

function checkPlaceholderText(html: string, ctx: CheckContext): BuiltinRecommendation[] {
  const patterns = [
    { regex: /lorem ipsum/i, label: "Lorem ipsum" },
    { regex: /\[placeholder\]/i, label: "[placeholder]" },
    { regex: /\bTBD\b/, label: "TBD" },
    { regex: /example\.com/i, label: "example.com" },
  ];

  for (const p of patterns) {
    if (p.regex.test(html)) {
      return [{
        flagType: "fix_content",
        ...ctx,
        recommendation: `Found placeholder text "${p.label}" — needs real content.`,
        instruction: `Replace "${p.label}" with actual content.`,
      }];
    }
  }
  return [];
}

function checkHardcodedCopyright(html: string, ctx: CheckContext): BuiltinRecommendation[] {
  const currentYear = new Date().getFullYear().toString();
  const match = html.match(/©\s*(20\d{2})/);
  if (match && match[1] !== currentYear) {
    return [{
      flagType: "fix_content",
      ...ctx,
      recommendation: `Copyright year hardcoded as ${match[1]} — should be ${currentYear}.`,
      instruction: `Update copyright year from ${match[1]} to ${currentYear}.`,
    }];
  }
  return [];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPhones(html: string, label: string): Array<{ phone: string; label: string }> {
  return (html.match(/(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) || [])
    .map((p) => ({ phone: p, label }));
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

function formatPhone(digits: string): string {
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return digits;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
