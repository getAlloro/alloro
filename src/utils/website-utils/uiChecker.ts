import logger from "../../lib/logger";

/**
 * UI Checker
 *
 * Analyzes HTML structure for layout/markup integrity issues.
 * Includes color consistency checks against project brand colors.
 * No LLM needed — pure deterministic HTML analysis.
 */

interface UiRecommendation {
  flagType: string;
  targetType: "page_section" | "layout" | "post";
  targetId: string;
  targetLabel: string;
  targetMeta: Record<string, unknown>;
  recommendation: string;
  instruction: string;
  currentHtml: string;
}

interface UiCheckerInput {
  layouts: Array<{ field: string; html: string; projectId: string }>;
  pages: Array<{
    id: string;
    path: string;
    sections: Array<{ name: string; content: string; index: number }>;
  }>;
  posts: Array<{ id: string; title: string; content: string }>;
  brandColors?: { primary?: string | null; accent?: string | null };
}

interface CheckContext {
  targetType: "page_section" | "layout" | "post";
  targetId: string;
  targetLabel: string;
  targetMeta: Record<string, unknown>;
  currentHtml: string;
}

export function analyzeUiIntegrity(input: UiCheckerInput): UiRecommendation[] {
  const results: UiRecommendation[] = [];

  // Collect colors from layouts (header/footer = color source of truth)
  const layoutColors = new Set<string>();
  for (const layout of input.layouts) {
    if (layout.html) extractHexColors(layout.html).forEach((c) => layoutColors.add(c.toLowerCase()));
  }

  const brandPrimary = input.brandColors?.primary?.toLowerCase() || null;
  const brandAccent = input.brandColors?.accent?.toLowerCase() || null;

  for (const layout of input.layouts) {
    if (!layout.html || layout.html.trim().length < 50) continue;
    const ctx: CheckContext = {
      targetType: "layout", targetId: layout.projectId,
      targetLabel: `Layout > ${capitalize(layout.field)}`,
      targetMeta: { layout_field: layout.field }, currentHtml: layout.html,
    };
    results.push(...runChecks(layout.html, ctx, false));
  }

  for (const page of input.pages) {
    for (const section of page.sections) {
      if (!section.content || section.content.trim().length < 50) continue;
      if (section.content.trim().length < 100 && /\{\{.*\}\}/.test(section.content)) continue;
      const ctx: CheckContext = {
        targetType: "page_section", targetId: page.id,
        targetLabel: `${page.path} > ${section.name}`,
        targetMeta: { section_index: section.index, section_name: section.name, page_path: page.path },
        currentHtml: section.content,
      };
      results.push(...runChecks(section.content, ctx, true));
      results.push(...checkColorConsistency(section.content, ctx, brandPrimary, brandAccent, layoutColors));
    }
  }

  for (const post of input.posts) {
    if (!post.content || post.content.trim().length < 50) continue;
    const ctx: CheckContext = {
      targetType: "post", targetId: post.id,
      targetLabel: `Post: ${post.title}`,
      targetMeta: {}, currentHtml: post.content,
    };
    results.push(...runChecks(post.content, ctx, false));
  }

  logger.info(`[UIChecker] Found ${results.length} issue(s)`);
  return results;
}

function runChecks(html: string, ctx: CheckContext, isSection: boolean): UiRecommendation[] {
  const r: UiRecommendation[] = [];
  r.push(...checkDuplicateClasses(html, ctx));
  r.push(...checkConflictingUtilities(html, ctx));
  r.push(...checkInlineStyles(html, ctx));
  r.push(...checkAbsolutePositioning(html, ctx));
  r.push(...checkNestedAnchors(html, ctx));
  r.push(...checkEmptyVisibleElements(html, ctx));
  r.push(...checkImagesWithoutDimensions(html, ctx));
  r.push(...checkLowContrastText(html, ctx));
  if (isSection) {
    r.push(...checkMissingContainer(html, ctx));
    r.push(...checkMissingAlloroSection(html, ctx));
  }
  return r;
}

// ---------------------------------------------------------------------------
// Color consistency check
// ---------------------------------------------------------------------------

function checkColorConsistency(
  html: string,
  ctx: CheckContext,
  brandPrimary: string | null,
  brandAccent: string | null,
  layoutColors: Set<string>
): UiRecommendation[] {
  const issues: string[] = [];

  // Check 1: Hardcoded hex colors that should be bg-primary/bg-accent/text-primary/text-accent
  const allHexColors = extractAllHexFromHtml(html);
  if (allHexColors.length > 0) {
    const unique = [...new Set(allHexColors)].slice(0, 5);
    issues.push(`Uses hardcoded hex colors (${unique.join(", ")}) — should use bg-primary/text-primary/bg-accent/text-accent CSS classes instead`);
  }

  // Check 2: Section has NO brand color classes at all (no bg-primary, text-primary, bg-accent, text-accent)
  const hasBrandClass = /\b(?:bg-primary|text-primary|bg-accent|text-accent|border-primary|border-accent)\b/.test(html);

  // Only flag substantial sections that use colored elements but no brand classes
  if (!hasBrandClass && html.length > 500) {
    // Check if section has buttons, backgrounds, or colored text that should use brand colors
    const hasColoredElements = /bg-(?:gray-[789]00|slate-[789]00|black|white)\b/.test(html) ||
      /<(?:a|button)[^>]*class="[^"]*bg-/.test(html);

    if (hasColoredElements) {
      issues.push(`Section has no brand color classes (bg-primary, text-primary, bg-accent, text-accent) — buttons, accents, and colored backgrounds should use brand colors`);
    }
  }

  // Check 3: Buttons/CTAs not using brand color classes
  const buttonMatches = html.match(/<(?:a|button)[^>]*class="([^"]*)"[^>]*>/gi) || [];
  if (buttonMatches.length > 0) {
    const buttonsWithoutBrand = buttonMatches.filter((b) =>
      (b.includes("bg-") || b.includes("border-")) &&
      !b.includes("bg-primary") && !b.includes("bg-accent") &&
      !b.includes("border-primary") && !b.includes("border-accent") &&
      !b.includes("bg-white") && !b.includes("bg-transparent") &&
      !b.includes("bg-gray-") // Neutral grays are fine for secondary buttons
    );
    if (buttonsWithoutBrand.length > 0) {
      issues.push(`${buttonsWithoutBrand.length} button(s)/CTA(s) don't use brand color classes — should use bg-primary, bg-accent, or text-primary`);
    }
  }

  if (issues.length > 0) {
    return [{
      flagType: "fix_ui",
      ...ctx,
      recommendation: `Color issue: ${issues.join(". ")}.`,
      instruction: `Use Alloro's CSS custom property classes for brand colors: bg-primary, text-primary, bg-accent, text-accent, border-primary, border-accent. Never hardcode hex values for brand colors. Primary buttons: bg-primary text-white. Accent elements: bg-accent or text-accent. Dark section backgrounds: bg-primary. Links/highlights: text-accent.`,
    }];
  }

  return [];
}

function extractAllHexFromHtml(html: string): string[] {
  const colors: string[] = [];
  // Match ALL Tailwind arbitrary hex values: bg-[#xxx], text-[#xxx], from-[#xxx], to-[#xxx], border-[#xxx], etc.
  const pattern = /(?:bg|text|border|from|to|via|ring|shadow|divide|placeholder|accent|fill|stroke)-\[#([a-fA-F0-9]{3,8})\]/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    colors.push(`#${match[1].toLowerCase()}`);
  }
  // Also inline styles
  const inlinePattern = /(?:color|background(?:-color)?|border-color):\s*#([a-fA-F0-9]{3,8})/gi;
  while ((match = inlinePattern.exec(html)) !== null) {
    colors.push(`#${match[1].toLowerCase()}`);
  }
  return colors;
}

function extractHexColors(html: string): string[] {
  const colors: string[] = [];
  // Match hex colors in Tailwind arbitrary values: bg-[#xxx], text-[#xxx], border-[#xxx]
  const twPattern = /(?:bg|text|border|from|to|via|ring|shadow|divide|placeholder|accent)-\[#([a-fA-F0-9]{3,8})\]/gi;
  let match: RegExpExecArray | null;
  while ((match = twPattern.exec(html)) !== null) {
    colors.push(`#${match[1]}`);
  }
  // Match inline style hex colors
  const inlinePattern = /(?:color|background(?:-color)?|border-color):\s*#([a-fA-F0-9]{3,8})/gi;
  while ((match = inlinePattern.exec(html)) !== null) {
    colors.push(`#${match[1]}`);
  }
  return colors;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkDuplicateClasses(html: string, ctx: CheckContext): UiRecommendation[] {
  const classRegex = /class="([^"]*)"/g;
  let match: RegExpExecArray | null;
  const dupes: string[] = [];
  while ((match = classRegex.exec(html)) !== null) {
    const classes = match[1].split(/\s+/).filter(Boolean);
    const seen = new Set<string>();
    for (const cls of classes) {
      if (seen.has(cls)) dupes.push(cls);
      seen.add(cls);
    }
  }
  if (dupes.length > 0) {
    const unique = [...new Set(dupes)].slice(0, 5);
    return [{ flagType: "fix_ui", ...ctx,
      recommendation: `Duplicate CSS classes: ${unique.join(", ")}${dupes.length > 5 ? ` (+${dupes.length - 5} more)` : ""}.`,
      instruction: `Remove duplicate classes — each should appear once per element: ${unique.join(", ")}`,
    }];
  }
  return [];
}

function checkConflictingUtilities(html: string, ctx: CheckContext): UiRecommendation[] {
  const classRegex = /class="([^"]*)"/g;
  let match: RegExpExecArray | null;
  const conflicts: string[] = [];
  const prefixes = ["px-", "py-", "pt-", "pb-", "pl-", "pr-", "p-", "m-", "mx-", "my-", "mt-", "mb-", "w-", "h-"];

  while ((match = classRegex.exec(html)) !== null) {
    const base = match[1].split(/\s+/).filter((c) => !c.includes(":"));
    for (const pfx of prefixes) {
      const matching = base.filter((c) => c.startsWith(pfx) && c !== pfx.slice(0, -1));
      if (matching.length > 1) conflicts.push(matching.join(" & "));
    }
  }
  if (conflicts.length > 0) {
    const unique = [...new Set(conflicts)].slice(0, 5);
    return [{ flagType: "fix_ui", ...ctx,
      recommendation: `Conflicting Tailwind utilities: ${unique.join("; ")}. Only the last takes effect.`,
      instruction: `Remove overridden utility classes — keep only the intended value: ${unique.join("; ")}`,
    }];
  }
  return [];
}

function checkMissingContainer(html: string, ctx: CheckContext): UiRecommendation[] {
  if (/max-w-|container/.test(html) || html.length < 200) return [];
  return [{ flagType: "fix_ui", ...ctx,
    recommendation: `No container constraint (max-w-* or container). Content may stretch full-width on large screens.`,
    instruction: `Wrap inner content in <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">.`,
  }];
}

function checkInlineStyles(html: string, ctx: CheckContext): UiRecommendation[] {
  const styles = (html.match(/style="[^"]+"/g) || []).filter(
    (s) => !s.includes("display:none") && !s.includes("display: none") &&
           !s.includes("background-image") && !s.includes("background-color")
  );
  if (styles.length > 0) {
    return [{ flagType: "fix_ui", ...ctx,
      recommendation: `Found ${styles.length} inline style(s). Use Tailwind classes instead.`,
      instruction: `Convert inline styles to Tailwind utilities. Example: style="margin-top: 20px" → class="mt-5"`,
    }];
  }
  return [];
}

function checkAbsolutePositioning(html: string, ctx: CheckContext): UiRecommendation[] {
  const absoluteClasses = (html.match(/\babsolute\b/g) || []).length;
  const fixedClasses = (html.match(/\bfixed\b/g) || []).length;
  const inlineAbsolute = (html.match(/position:\s*absolute/gi) || []).length;
  const inlineFixed = (html.match(/position:\s*fixed/gi) || []).length;
  const floatUsage = (html.match(/\bfloat-(?:left|right)\b/g) || []).length + (html.match(/float:\s*(?:left|right)/gi) || []).length;

  const total = absoluteClasses + fixedClasses + inlineAbsolute + inlineFixed + floatUsage;
  if (total > 0) {
    const details: string[] = [];
    if (absoluteClasses + inlineAbsolute > 0) details.push(`${absoluteClasses + inlineAbsolute} absolute`);
    if (fixedClasses + inlineFixed > 0) details.push(`${fixedClasses + inlineFixed} fixed`);
    if (floatUsage > 0) details.push(`${floatUsage} float`);

    return [{ flagType: "fix_ui", ...ctx,
      recommendation: `Found ${details.join(", ")} positioning — use flexbox or grid instead.`,
      instruction: `Replace absolute/fixed/float with flex or grid layouts.`,
    }];
  }
  return [];
}

function checkMissingAlloroSection(html: string, ctx: CheckContext): UiRecommendation[] {
  if (html.includes("data-alloro-section") || html.includes("alloro-tpl-")) return [];
  return [{ flagType: "fix_ui", ...ctx,
    recommendation: `Missing alloro-tpl-* classes and data-alloro-section — not editable in visual editor.`,
    instruction: `Add data-alloro-section and alloro-tpl-* classes to root and key inner elements.`,
  }];
}

function checkImagesWithoutDimensions(html: string, ctx: CheckContext): UiRecommendation[] {
  const imgs = (html.match(/<img[^>]*>/gi) || []).filter(
    (img) => !img.includes("width=") && !img.includes("height=") && !img.includes("w-") && !img.includes("h-")
  );
  if (imgs.length > 0) {
    return [{ flagType: "fix_ui", ...ctx,
      recommendation: `${imgs.length} image(s) without dimensions — causes layout shift.`,
      instruction: `Add width/height or Tailwind w-/h- classes to prevent CLS.`,
    }];
  }
  return [];
}

function checkNestedAnchors(html: string, ctx: CheckContext): UiRecommendation[] {
  if (/<a\s[^>]*>(?:(?!<\/a>)[\s\S])*<a\s/gi.test(html)) {
    return [{ flagType: "fix_ui", ...ctx,
      recommendation: "Nested anchor tags (<a> inside <a>) — invalid HTML.",
      instruction: "Remove outer <a> or restructure. Nested anchors are invalid.",
    }];
  }
  return [];
}

function checkEmptyVisibleElements(html: string, ctx: CheckContext): UiRecommendation[] {
  const empties = html.match(/<(?:div|section|span|p|h[1-6])\s[^>]*alloro-tpl-[^>]*>\s*<\/(?:div|section|span|p|h[1-6])>/gi);
  if (empties && empties.length > 0) {
    return [{ flagType: "fix_ui", ...ctx,
      recommendation: `${empties.length} empty element(s) with alloro-tpl classes.`,
      instruction: `Remove empty elements or add content.`,
    }];
  }
  return [];
}

function checkLowContrastText(html: string, ctx: CheckContext): UiRecommendation[] {
  const issues: string[] = [];

  // Pattern: dark background with light/muted text colors
  // Detect sections with dark backgrounds that have low-contrast text
  const hasDarkBg = /bg-(?:gray-[789]00|slate-[789]00|zinc-[789]00|neutral-[789]00|stone-[789]00|black)\b/.test(html) ||
    /bg-\[#[0-3][0-9a-fA-F]{5}\]/.test(html) || // hex colors starting with 0-3 (dark)
    /bg-primary/.test(html); // primary could be dark

  if (hasDarkBg) {
    // On dark backgrounds, these text colors are low contrast / unreadable:
    const lowContrastOnDark = [
      { pattern: /\btext-gray-[5-7]00\b/g, label: "text-gray-500/600/700" },
      { pattern: /\btext-slate-[5-7]00\b/g, label: "text-slate-500/600/700" },
      { pattern: /\btext-gray-400\b/g, label: "text-gray-400" },
      { pattern: /\btext-slate-400\b/g, label: "text-slate-400" },
    ];

    for (const check of lowContrastOnDark) {
      const matches = html.match(check.pattern);
      if (matches && matches.length > 0) {
        issues.push(`${matches.length}x ${check.label} on dark background`);
      }
    }
  }

  // Pattern: light background with very light text
  const hasLightBg = /bg-(?:white|gray-[0-2]00|slate-[0-2]00)\b/.test(html) ||
    /bg-\[#[eEfF][0-9a-fA-F]{5}\]/.test(html); // hex colors starting with e-f (light)

  if (hasLightBg) {
    const lowContrastOnLight = [
      { pattern: /\btext-gray-[2-3]00\b/g, label: "text-gray-200/300" },
      { pattern: /\btext-white\b/g, label: "text-white" },
    ];

    for (const check of lowContrastOnLight) {
      const matches = html.match(check.pattern);
      if (matches && matches.length > 0) {
        issues.push(`${matches.length}x ${check.label} on light background`);
      }
    }
  }

  // Check for text-white/60, text-white/40, etc. (low opacity white text)
  const lowOpacityWhite = html.match(/text-white\/[1-4]0/g);
  if (lowOpacityWhite && lowOpacityWhite.length > 0) {
    issues.push(`${lowOpacityWhite.length}x low-opacity white text (${[...new Set(lowOpacityWhite)].join(", ")}) — may be unreadable`);
  }

  if (issues.length > 0) {
    return [{
      flagType: "fix_ui",
      ...ctx,
      recommendation: `Low contrast text detected: ${issues.join("; ")}. Text may be unreadable.`,
      instruction: `Fix low-contrast text. On dark backgrounds, use text-white or text-gray-100/200 for readability. On light backgrounds, use text-gray-700/800/900. Replace text-white/40 or text-white/60 with text-white/80 or text-white for better legibility. Links should be clearly visible — use text-accent or underline styling.`,
    }];
  }

  return [];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
