import logger from "../../lib/logger";

/**
 * Link Checker
 *
 * Validates all internal links. Finds broken links with fuzzy suggestions.
 * No LLM needed — deterministic analysis.
 */

interface LinkRecommendation {
  flagType: string;
  targetType: "page_section" | "layout" | "post";
  targetId: string;
  targetLabel: string;
  targetMeta: Record<string, unknown>;
  recommendation: string;
  instruction: string;
  currentHtml: string;
}

interface LinkCheckerInput {
  layouts: Array<{ field: string; html: string; projectId: string }>;
  pages: Array<{
    id: string; path: string;
    sections: Array<{ name: string; content: string; index: number }>;
  }>;
  posts: Array<{ id: string; title: string; content: string }>;
  existingPaths: string[];
  existingPostSlugs: string[];
  existingRedirects: Array<{ from_path: string; to_path: string }>;
  menuItems?: Array<{ label: string; url: string; menu_slug: string }>;
}

interface CheckContext {
  targetType: "page_section" | "layout" | "post";
  targetId: string;
  targetLabel: string;
  targetMeta: Record<string, unknown>;
  currentHtml: string;
}

export function analyzeBrokenLinks(input: LinkCheckerInput): LinkRecommendation[] {
  const results: LinkRecommendation[] = [];
  const validPaths = new Set<string>(input.existingPaths);
  for (const slug of input.existingPostSlugs) {
    validPaths.add(`/${slug}`);
  }
  const allValid = [...validPaths];

  for (const layout of input.layouts) {
    if (!layout.html) continue;
    const ctx: CheckContext = {
      targetType: "layout", targetId: layout.projectId,
      targetLabel: `Layout > ${capitalize(layout.field)}`,
      targetMeta: { layout_field: layout.field }, currentHtml: layout.html,
    };
    results.push(...findBroken(layout.html, validPaths, allValid, ctx));
  }

  for (const page of input.pages) {
    for (const sec of page.sections) {
      if (!sec.content || sec.content.length < 10) continue;
      if (sec.content.trim().length < 100 && /\{\{.*\}\}/.test(sec.content)) continue;
      const ctx: CheckContext = {
        targetType: "page_section", targetId: page.id,
        targetLabel: `${page.path} > ${sec.name}`,
        targetMeta: { section_index: sec.index, section_name: sec.name, page_path: page.path },
        currentHtml: sec.content,
      };
      results.push(...findBroken(sec.content, validPaths, allValid, ctx));
    }
  }

  for (const post of input.posts) {
    if (!post.content) continue;
    const ctx: CheckContext = {
      targetType: "post", targetId: post.id,
      targetLabel: `Post: ${post.title}`,
      targetMeta: {}, currentHtml: post.content,
    };
    results.push(...findBroken(post.content, validPaths, allValid, ctx));
  }

  // --- Orphan page detection ---
  results.push(...findOrphanPages(input));

  logger.info(`[LinkChecker] Found ${results.length} issue(s) (broken links + orphans)`);
  return results;
}

function findOrphanPages(input: LinkCheckerInput): LinkRecommendation[] {
  const results: LinkRecommendation[] = [];

  // Collect ALL internal hrefs from all sources
  const linkedPaths = new Set<string>();
  const hrefRegex = /href=["'](\/[^"'#?]*)["']/g;

  // From layouts (header/footer — most important for nav links)
  for (const layout of input.layouts) {
    if (!layout.html) continue;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(layout.html)) !== null) {
      linkedPaths.add(normPath(match[1]));
    }
  }

  // From page sections
  for (const page of input.pages) {
    for (const sec of page.sections) {
      if (!sec.content) continue;
      let match: RegExpExecArray | null;
      while ((match = hrefRegex.exec(sec.content)) !== null) {
        linkedPaths.add(normPath(match[1]));
      }
    }
  }

  // From posts
  for (const post of input.posts) {
    if (!post.content) continue;
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(post.content)) !== null) {
      linkedPaths.add(normPath(match[1]));
    }
  }

  // From menu items
  if (input.menuItems) {
    for (const item of input.menuItems) {
      if (item.url && item.url.startsWith("/")) {
        linkedPaths.add(normPath(item.url));
      }
    }
  }

  // Check each page path — is it linked from anywhere?
  const skipPaths = new Set(["/"]); // Homepage doesn't need internal links
  const projectId = input.layouts[0]?.projectId || "";

  for (const pagePath of input.existingPaths) {
    if (skipPaths.has(pagePath)) continue;
    const norm = normPath(pagePath);

    if (!linkedPaths.has(norm)) {
      // Find the best place to suggest adding a link
      const suggestion = suggestLinkPlacement(pagePath, input);

      results.push({
        flagType: "fix_orphan_page",
        targetType: suggestion.targetType,
        targetId: suggestion.targetId,
        targetLabel: suggestion.targetLabel,
        targetMeta: {
          ...suggestion.targetMeta,
          orphan_path: pagePath,
        },
        recommendation: `Orphan page: "${pagePath}" is not linked from any page, layout, or menu. Visitors and search engines can't discover it.`,
        instruction: suggestion.instruction,
        currentHtml: suggestion.currentHtml,
      });
    }
  }

  return results;
}

function suggestLinkPlacement(
  orphanPath: string,
  input: LinkCheckerInput
): {
  targetType: "page_section" | "layout";
  targetId: string;
  targetLabel: string;
  targetMeta: Record<string, unknown>;
  instruction: string;
  currentHtml: string;
} {
  const pathParts = orphanPath.split("/").filter(Boolean);
  const pageName = pathParts[pathParts.length - 1]?.replace(/-/g, " ") || orphanPath;

  // Check if it belongs under a parent path (e.g., /legal/privacy → footer)
  const isLegal = orphanPath.startsWith("/legal") || orphanPath.includes("privacy") || orphanPath.includes("accessibility") || orphanPath.includes("terms");
  const isPatientInfo = orphanPath.includes("patient") || orphanPath.includes("new-patient") || orphanPath.includes("first-visit");
  const isService = orphanPath.startsWith("/services");
  const isDoctor = orphanPath.startsWith("/doctors") || orphanPath.startsWith("/team");
  const isReferral = orphanPath.includes("refer");

  // Suggest footer for legal pages
  if (isLegal) {
    const footer = input.layouts.find((l) => l.field === "footer");
    if (footer) {
      return {
        targetType: "layout",
        targetId: footer.projectId,
        targetLabel: "Layout > Footer",
        targetMeta: { layout_field: "footer" },
        instruction: `Add a link to "${pageName}" (${orphanPath}) in the footer's Quick Links or legal links section. Or add it to the footer menu via {{ menu }} shortcode.`,
        currentHtml: footer.html,
      };
    }
  }

  // Suggest relevant page section or menu for other types
  const menuSuggestion = isService ? "services menu or services page"
    : isDoctor ? "team/doctors section or about page"
    : isPatientInfo ? "main navigation or patient resources section"
    : isReferral ? "main navigation or referring doctors section"
    : "main navigation menu or a relevant page";

  // Default: suggest adding to the header/nav
  const header = input.layouts.find((l) => l.field === "header");
  if (header) {
    return {
      targetType: "layout",
      targetId: header.projectId,
      targetLabel: "Layout > Header",
      targetMeta: { layout_field: "header" },
      instruction: `Add "${pageName}" (${orphanPath}) to the ${menuSuggestion}. Best approach: add it as a menu item via the Menus tab rather than editing HTML directly.`,
      currentHtml: header.html,
    };
  }

  // Fallback to first page
  const firstPage = input.pages[0];
  return {
    targetType: "page_section",
    targetId: firstPage?.id || "",
    targetLabel: firstPage ? `${firstPage.path} > ${firstPage.sections[0]?.name || "page"}` : "Unknown",
    targetMeta: firstPage ? { section_index: 0, section_name: firstPage.sections[0]?.name, page_path: firstPage.path } : {},
    instruction: `Add a link to "${pageName}" (${orphanPath}) in the ${menuSuggestion}.`,
    currentHtml: firstPage?.sections[0]?.content || "",
  };
}

function normPath(p: string): string {
  let n = p.trim();
  if (n.length > 1 && n.endsWith("/")) n = n.slice(0, -1);
  return n.toLowerCase();
}

function findBroken(
  html: string, validPaths: Set<string>, allValid: string[], ctx: CheckContext
): LinkRecommendation[] {
  const results: LinkRecommendation[] = [];
  const hrefRegex = /href=["'](\/[^"'#?]*)["']/g;
  let match: RegExpExecArray | null;
  const checked = new Set<string>();

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (checked.has(href)) continue;
    checked.add(href);
    if (href === "/" || href.startsWith("/api/")) continue;

    const norm = href.endsWith("/") && href.length > 1 ? href.slice(0, -1) : href;

    if (validPaths.has(norm) || validPaths.has(href)) continue;

    // .html variant check
    if (href.endsWith(".html")) {
      const clean = norm.replace(/\.html$/, "");
      if (validPaths.has(clean)) {
        results.push({ flagType: "fix_broken_link", ...ctx,
          targetMeta: { ...ctx.targetMeta, broken_href: href, suggested_href: clean },
          recommendation: `"${href}" uses .html extension — clean URL "${clean}" exists.`,
          instruction: `Change href="${href}" to href="${clean}".`,
        });
        continue;
      }
    }

    // Fuzzy match
    const suggestion = findClosest(norm, allValid);

    results.push({ flagType: "fix_broken_link", ...ctx,
      targetMeta: {
        ...ctx.targetMeta, broken_href: href,
        suggested_href: suggestion ? suggestion.path : "NEEDS_INPUT",
        suggestion_confidence: suggestion?.confidence,
      },
      recommendation: suggestion
        ? `Broken: "${href}" → not found. Suggested: "${suggestion.path}" (${suggestion.reason}).`
        : `Broken: "${href}" → not found. No close match — manual URL needed.`,
      instruction: suggestion
        ? `Change href="${href}" to href="${suggestion.path}".`
        : `Update href="${href}" to a valid URL or remove the link.`,
    });
  }

  return results;
}

// Semantic keyword synonyms — maps broken URL keywords to likely valid equivalents
const KEYWORD_MAP: Record<string, string[]> = {
  "appointment": ["consultation", "contact", "schedule", "booking"],
  "request": ["consultation", "contact", "schedule"],
  "schedule": ["consultation", "appointment", "booking"],
  "book": ["consultation", "appointment", "schedule"],
  "find-us": ["contact", "locations"],
  "directions": ["contact", "locations"],
  "map": ["contact", "locations"],
  "team": ["about", "our-story", "staff", "doctors"],
  "staff": ["about", "our-story", "team", "doctors"],
  "meet": ["about", "our-story", "doctors", "team"],
  "pricing": ["insurance", "financial", "payment"],
  "insurance": ["financial", "pricing", "payment"],
  "payment": ["financial", "pricing", "insurance", "pay-online"],
  "pay": ["payment", "financial", "pay-online"],
  "blog": ["news", "articles", "resources"],
  "faq": ["questions", "help", "support"],
  "reviews": ["testimonials", "patient-reviews"],
  "testimonials": ["reviews", "patient-reviews"],
  "emergency": ["urgent", "dental-emergencies"],
};

function findClosest(broken: string, validPaths: string[]): { path: string; confidence: number; reason: string } | null {
  const brokenParts = broken.split("/").filter(Boolean);
  const brokenLast = brokenParts[brokenParts.length - 1] || "";
  const brokenKeywords = brokenLast.split("-");
  let best: { path: string; confidence: number; reason: string } | null = null;

  for (const valid of validPaths) {
    const validParts = valid.split("/").filter(Boolean);
    const validLast = validParts[validParts.length - 1] || "";

    // 1. Exact last-segment match (e.g., /old/sterling-office → /locations/sterling-office)
    if (brokenLast === validLast) {
      return { path: valid, confidence: 1, reason: "exact segment match" };
    }

    // 2. Last segment contains the other
    if (brokenLast.length > 2 && (validLast.includes(brokenLast) || brokenLast.includes(validLast))) {
      const conf = 1 - levenshtein(broken, valid) / Math.max(broken.length, valid.length);
      if (conf > 0.3 && (!best || conf > best.confidence)) {
        best = { path: valid, confidence: conf, reason: "similar path" };
      }
    }

    // 3. Semantic keyword matching
    for (const keyword of brokenKeywords) {
      const synonyms = KEYWORD_MAP[keyword.toLowerCase()];
      if (synonyms) {
        for (const syn of synonyms) {
          if (validLast.includes(syn) || valid.includes(syn)) {
            const conf = 0.7; // Semantic matches get decent confidence
            if (!best || conf > best.confidence) {
              best = { path: valid, confidence: conf, reason: `"${keyword}" ≈ "${syn}"` };
            }
          }
        }
      }
    }

    // 4. Full path levenshtein
    const conf = 1 - levenshtein(broken, valid) / Math.max(broken.length, valid.length);
    if (conf > 0.5 && (!best || conf > best.confidence)) {
      best = { path: valid, confidence: conf, reason: `${Math.round(conf * 100)}% match` };
    }
  }

  return best;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
