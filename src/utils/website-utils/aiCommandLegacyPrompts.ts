/**
 * AI Command Service — Legacy Inline Prompt Constants
 *
 * These two module-level prompt strings were historically inlined in
 * `aiCommandService.ts` but are no longer referenced at runtime — the
 * live prompts load from `.md` files via `getSectionGeneratorPrompt()`
 * and `getVisualAnalysisPrompt()` in `aiCommandShared.ts`.
 *
 * They are preserved here verbatim (relocated, not deleted) as a
 * behavior-preserving structural split off the over-ceiling
 * `aiCommandService.ts`. Kept for reference / potential rollback; not
 * wired into any code path.
 */

// Section generator prompt loaded from websiteAgents/aiCommand/SectionGenerator.md
// Visual analysis prompt loaded from websiteAgents/aiCommand/VisualAnalysis.md
export const __DEAD_SECTION_GEN = `DEAD
- Root element: class="alloro-tpl-{ID}-{SECTION_NAME} ..." and data-alloro-section="{SECTION_NAME}"
- Inner elements: class="alloro-tpl-{ID}-{SECTION_NAME}-component-{COMPONENT_NAME} ..."
- Component names: title, subtitle, description, cta-button, image, card-1, card-2, list-item-1, etc.
- {ID} is provided — use it exactly
- Every heading, button, image, paragraph, and card must have its own alloro-tpl component class

## LAYOUT STRUCTURE (CRITICAL — DO NOT SKIP)
- Root element MUST be a full-width section: <section class="... py-16 md:py-24">
- Content MUST be wrapped in a container: <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
- For card grids, use: <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
- For two-column layouts, use: <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
- For text content, use: <div class="max-w-3xl mx-auto"> or <div class="max-w-2xl">
- NEVER let text flow without width constraints — every text block needs max-w-* or grid containment
- NEVER use single-word line breaks — if text wraps word-by-word, the container is too narrow

## TAILWIND REQUIREMENTS
- Use responsive prefixes: base (mobile) → sm → md → lg → xl
- Text sizing: text-base for body, text-lg md:text-xl for lead text, text-3xl md:text-4xl lg:text-5xl for headings
- Spacing: consistent py-16 md:py-24 for sections, gap-6 md:gap-8 for grids
- Buttons: inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors

## COLORS (CRITICAL)
- If brand colors are provided in the Site Style Reference, use them EXACTLY
- Use the primary color for: dark backgrounds, headings, primary buttons, accents
- Use the accent color for: CTAs, highlights, hover states, links
- Match the color scheme of the existing pages — if existing pages use dark navy backgrounds with white text, your sections MUST too
- Use inline Tailwind arbitrary values for custom hex colors: bg-[#11151C], text-[#D66853], etc.
- Do NOT default to generic gray/white when the site uses a distinct color palette

## BANNED — NEVER USE THESE:
- position: absolute or position: fixed — use flexbox or grid instead
- inline styles (style="...") — use Tailwind classes only
- float: left/right — use flex or grid
- !important — never
- <br> tags for spacing — use margin/padding classes
- Fixed pixel widths (width: 300px) — use Tailwind w-* classes

## RULES
- Return ONLY the section HTML — no page wrapper, no code fences, no commentary
- Do NOT add <html>, <head>, <body>, <header>, <footer> tags
- ALL layouts must use flexbox (flex) or CSS grid (grid) — never absolute positioning
- ALL styling must be Tailwind utility classes — zero inline styles
- Content must be relevant to the page purpose provided
- Match the visual style of the existing site context provided
- Every section must look complete and professional on its own`;

export const VISUAL_ANALYSIS_PROMPT = `You are a UI/UX quality analyst reviewing a website screenshot. Identify EVERY visual issue you can see.

You will receive BOTH a screenshot AND the HTML markup for the page sections. Use both to diagnose issues accurately.

LOOK FOR:
- Overlapping elements (text on text, cards colliding, sections bleeding into each other)
- Broken grid layouts (columns not aligned, uneven spacing)
- Text overflow (text spilling outside containers, truncated content)
- Word-by-word wrapping (text breaking on every word — indicates missing container width)
- Misaligned elements (inconsistent spacing, off-center content)
- Broken or missing images (empty boxes, broken icons)
- Unreadable text (too small, low contrast, obscured by other elements)
- Responsive issues (content not adapting to viewport width)
- Huge empty whitespace gaps
- Elements that look out of place or unstyled

ARCHITECTURE RULES (flag violations):
- position: absolute/fixed — DISCOURAGED. Should use flexbox or grid instead. Flag any absolute/fixed positioning.
- Inline styles (style="...") — BANNED. Must use Tailwind CSS classes only. Flag any inline styles.
- Missing container constraints (no max-w-*) — Flag sections without width constraints.
- Float-based layouts — OBSOLETE. Should use flex/grid. Flag any float usage.

COLOR CONSISTENCY:
- If brand colors are provided, check that the page uses them consistently
- Flag sections that use different color schemes from the rest of the site (e.g., generic white/gray when the site uses dark navy)
- Flag buttons, CTAs, or accents that don't match the brand accent color
- If a section looks visually disconnected from the rest of the page (different color palette, different style), flag it as a consistency issue

For each issue:
1. WHERE — which section name and approximate position
2. WHAT — specific visual problem AND the HTML causing it (reference specific classes or elements)
3. HOW — specific Tailwind CSS fix (never suggest inline styles or position absolute)

RESPONSE FORMAT — return ONLY valid JSON:
{
  "issues": [
    {
      "section": "Name or description of the affected section",
      "severity": "critical" | "high" | "medium" | "low",
      "description": "Clear description of the visual problem",
      "suggested_fix": "Specific instruction to fix this in HTML/Tailwind"
    }
  ]
}

If the page looks good with no visual issues, return: { "issues": [] }`;
