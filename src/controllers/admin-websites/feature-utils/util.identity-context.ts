/**
 * Identity Context Builder
 *
 * Translates a project_identity document into a stable cached block and a
 * variable per-component payload. Pure function: no LLM, no DB.
 */

import * as cheerio from "cheerio";

export type GradientPresetId =
  | "smooth"
  | "lean-primary"
  | "lean-accent"
  | "soft-lean-primary"
  | "soft-lean-accent"
  | "warm-middle"
  | "quick-transition"
  | "long-transition";

type StopDef = {
  role: "from" | "to" | "mix";
  position: number;
  mix_ratio?: number;
};

const PRESET_STOPS: Record<GradientPresetId, StopDef[]> = {
  smooth: [
    { role: "from", position: 0 },
    { role: "to", position: 100 },
  ],
  "lean-primary": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 65 },
    { role: "to", position: 100 },
  ],
  "lean-accent": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 35 },
    { role: "to", position: 100 },
  ],
  "soft-lean-primary": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 58 },
    { role: "to", position: 100 },
  ],
  "soft-lean-accent": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.5, position: 42 },
    { role: "to", position: 100 },
  ],
  "warm-middle": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.35, position: 30 },
    { role: "mix", mix_ratio: 0.65, position: 70 },
    { role: "to", position: 100 },
  ],
  "quick-transition": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.25, position: 40 },
    { role: "mix", mix_ratio: 0.75, position: 60 },
    { role: "to", position: 100 },
  ],
  "long-transition": [
    { role: "from", position: 0 },
    { role: "mix", mix_ratio: 0.35, position: 20 },
    { role: "mix", mix_ratio: 0.65, position: 80 },
    { role: "to", position: 100 },
  ],
};

function clampN(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = (hex || "").replace(/^#/, "");
  const v =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const n = parseInt(v, 16);
  if (Number.isNaN(n) || v.length !== 6) return { r: 0, g: 0, b: 0 };
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (x: number) => clampN(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function mixHex(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from);
  const b = hexToRgb(to);
  const r = clampN(ratio, 0, 1);
  return rgbToHex(
    a.r + (b.r - a.r) * r,
    a.g + (b.g - a.g) * r,
    a.b + (b.b - a.b) * r,
  );
}

/**
 * Expand a preset ID into CSS stops. Mirrors the frontend helper in
 * GradientPicker.tsx.
 */
export function buildGradientStopsCss(
  from: string,
  to: string,
  preset: GradientPresetId | null | undefined,
): string {
  const active: GradientPresetId = preset && preset in PRESET_STOPS ? preset : "smooth";
  return PRESET_STOPS[active]
    .map((s) => {
      const color =
        s.role === "from"
          ? from
          : s.role === "to"
            ? to
            : mixHex(from, to, s.mix_ratio ?? 0.5);
      return `${color} ${s.position}%`;
    })
    .join(", ");
}

export interface ProjectIdentity {
  version?: number;
  business?: {
    name?: string | null;
    category?: string | null;
    phone?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    rating?: number | null;
    review_count?: number | null;
    website_url?: string | null;
    place_id?: string | null;
    hours?: unknown;
  };
  brand?: {
    primary_color?: string | null;
    accent_color?: string | null;
    gradient_enabled?: boolean;
    gradient_from?: string | null;
    gradient_to?: string | null;
    gradient_direction?: string | null;
    gradient_text_color?: "white" | "dark" | null;
    gradient_preset?: GradientPresetId | null;
    logo_s3_url?: string | null;
    logo_alt_text?: string | null;
  };
  voice_and_tone?: {
    archetype?: string | null;
    tone_descriptor?: string | null;
    voice_samples?: string[];
  };
  content_essentials?: {
    unique_value_proposition?: string | null;
    founding_story?: string | null;
    core_values?: string[];
    certifications?: string[];
    service_areas?: string[];
    social_links?: Record<string, string | null>;
    review_themes?: string[];
    featured_testimonials?: Array<{
      author?: string | null;
      rating?: number | null;
      text?: string | null;
    }>;
    doctors?: Array<{
      name: string;
      source_url: string | null;
      short_blurb: string | null;
      credentials?: string[];
      location_place_ids?: string[];
      last_synced_at: string;
      stale?: boolean;
    }>;
    services?: Array<{
      name: string;
      source_url: string | null;
      short_blurb: string | null;
      last_synced_at: string;
      stale?: boolean;
    }>;
  };
  locations?: Array<{
    id?: string;
    source?: "gbp" | "manual";
    place_id?: string | null;
    name: string;
    address: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    phone: string | null;
    rating: number | null;
    review_count: number | null;
    category: string | null;
    website_url: string | null;
    hours: unknown;
    last_synced_at: string;
    is_primary: boolean;
    warmup_status: "ready" | "failed" | "pending";
    warmup_error?: string;
    stale?: boolean;
  }>;
  extracted_assets?: {
    images?: Array<ImageManifestEntry>;
    discovered_pages?: Array<{ url?: string | null; title?: string | null; content_excerpt?: string | null }>;
  };
  meta?: {
    warmup_status?: string | null;
  };
}

export interface ImageManifestEntry {
  source_url?: string | null;
  s3_url?: string | null;
  description?: string | null;
  use_case?: string | null;
  resolution?: string | null;
  is_logo?: boolean;
  usability_rank?: number | null;
}

export interface ComponentContext {
  componentName: string;
  templateMarkup: string;
  variableUserMessage: string;
  imageManifest: Array<{
    id: string;
    description: string | null;
    use_case: string | null;
    resolution: string | null;
  }>;
  /** Slot groups that were stripped from the template before the AI saw it. */
  strippedSlotGroups: string[];
  /** True when every slot in the template was skipped — pipeline should skip the whole component. */
  skipGeneration: boolean;
}

// ---------------------------------------------------------------------------
// STABLE CONTEXT (cached across component calls)
// ---------------------------------------------------------------------------

export function buildStableIdentityContext(identity: ProjectIdentity): string {
  const b = identity.business || {};
  const br = identity.brand || {};
  const v = identity.voice_and_tone || {};
  const ce = identity.content_essentials || {};

  const parts: string[] = [];

  parts.push("## BUSINESS");
  parts.push(
    kvLines({
      Name: b.name,
      Category: b.category,
      Phone: b.phone,
      Address: [b.address, b.city, b.state, b.zip].filter(Boolean).join(", "),
      Website: b.website_url,
      Rating: b.rating ? `${b.rating}/5 (${b.review_count || 0} reviews)` : null,
    }),
  );

  const locations = Array.isArray(identity.locations)
    ? identity.locations.filter((l) => l && !l.stale && l.name)
    : [];

  if (locations.length > 1) {
    parts.push(`\n## LOCATIONS (${locations.length} total)`);
    parts.push(
      "This practice operates across multiple locations. Mention each by name when copy references \"our locations\" or similar:",
    );
    const sorted = [...locations].sort(
      (a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0),
    );
    for (const l of sorted) {
      const city = shortLocationLabel(l.address);
      const bits = [l.name, city].filter(Boolean).join(" — ");
      const primary = l.is_primary ? " (primary)" : "";
      parts.push(`  - ${bits}${primary}`);
    }
    parts.push(
      "Do NOT emit hyperlinks to individual location pages — those public routes are not live yet. Reference locations as plain text.",
    );
  }

  const doctors = Array.isArray(ce.doctors)
    ? ce.doctors.filter((d) => d && !d.stale && d.name)
    : [];
  const services = Array.isArray(ce.services)
    ? ce.services.filter((s) => s && !s.stale && s.name)
    : [];

  if (doctors.length > 0 || services.length > 0) {
    parts.push("\n## CONTENT ESSENTIALS");
    if (doctors.length > 0) {
      parts.push("Doctors (use credentials verbatim; don't invent titles):");
      for (const d of doctors.slice(0, 25)) {
        const creds =
          Array.isArray(d.credentials) && d.credentials.length > 0
            ? ` — ${d.credentials.join(", ")}`
            : "";
        parts.push(`  - ${d.name}${creds}`);
        if (d.short_blurb) parts.push(`      ${d.short_blurb}`);
      }
    }
    if (services.length > 0) {
      parts.push("Services:");
      for (const s of services.slice(0, 25)) {
        parts.push(`  - ${s.name}`);
        if (s.short_blurb) parts.push(`      ${s.short_blurb}`);
      }
    }
  }

  parts.push("\n## BRAND");
  const brandLines: Record<string, unknown> = {
    "Primary color": br.primary_color,
    "Accent color": br.accent_color,
  };
  if (br.gradient_enabled) {
    brandLines["Gradient"] = `${br.gradient_from} to ${br.gradient_to} (${br.gradient_direction})`;
    brandLines["Gradient preset"] = br.gradient_preset || "balanced";
    brandLines["Gradient text color"] = br.gradient_text_color || "white";
  }
  if (br.logo_s3_url) {
    brandLines["Logo URL"] = br.logo_s3_url;
    brandLines["Logo alt"] = br.logo_alt_text;
  }
  parts.push(kvLines(brandLines));

  parts.push("\n## VOICE & TONE");
  parts.push(kvLines({ Archetype: v.archetype, Tone: v.tone_descriptor }));

  if (v.voice_samples && v.voice_samples.length > 0) {
    parts.push("\nVoice samples to match:");
    for (const sample of v.voice_samples.slice(0, 3)) {
      parts.push(`  - "${sample}"`);
    }
  }

  const colorRules = [
    "\n## COLOR UTILITY CLASSES",
    "- bg-primary, text-primary - solid primary color",
    "- bg-accent, text-accent - solid accent color",
    br.gradient_enabled
      ? "- bg-gradient-brand, text-gradient-brand - gradient between primary and accent. Use for hero backgrounds and accent headings."
      : null,
    "- bg-primary-subtle, bg-accent-subtle - subtle tinted variants",
    "Never use Tailwind opacity variants like bg-primary/10 - they don't work.",
  ];
  parts.push(colorRules.filter(Boolean).join("\n"));

  return parts.join("\n");
}

/**
 * Best-effort "city, ST" label from a full street address. Falls back to the
 * trimmed address when the comma-split doesn't look like a US address.
 * Used only for LLM context — no callers rely on exact formatting.
 */
function shortLocationLabel(address: string | null | undefined): string | null {
  if (!address) return null;
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 3) {
    const city = parts[parts.length - 3];
    const stateZip = parts[parts.length - 2];
    const st = stateZip.split(/\s+/)[0];
    return st ? `${city}, ${st}` : city;
  }
  if (parts.length === 2) return parts[1];
  return parts[0] || null;
}

function kvLines(obj: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined || v === "") continue;
    out.push(`- ${k}: ${v}`);
  }
  return out.join("\n") || "- (unset)";
}

// ---------------------------------------------------------------------------
// PER-COMPONENT CONTEXT
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// SLOT → TEMPLATE SECTION STRIPPER
// ---------------------------------------------------------------------------

/**
 * Keyword signatures for each skippable slot. Used by `stripSkippedSlotGroups`
 * when a template subtree is not explicitly annotated with `data-slot-group`.
 *
 * Rule: include the subtree if EITHER its `data-slot-group` attribute matches
 * the slot key, OR its text content contains any of these keywords (case-
 * insensitive). If neither, the subtree is untouched.
 *
 * Annotations win when present. Keywords are the pragmatic fallback until every
 * template page has been annotated via a future data migration.
 */
const SLOT_TO_SECTION_KEYWORDS: Record<string, string[]> = {
  gallery_source_url: ["gallery", "portfolio", "before-after", "before/after", "before & after", "smile gallery"],
  faq_focus_topics: ["faq", "frequently asked", "common questions"],
  certifications_credentials: ["certifications", "credentials", "awards", "board certified", "memberships"],
  unique_value_proposition: [], // baked into hero copy — never safe to strip wholesale
  practice_founding_story: ["our story", "founding story", "how we started", "our history"],
  practice_values: ["our values", "core values", "what we believe"],
  parking_directions: ["parking", "directions", "how to find"],
  insurance_accepted_list: ["insurance", "accepted plans", "payment options"],
};

/**
 * Strip template subtrees tied to skipped slot keys before the markup hits the AI.
 *
 * Resolution order per subtree candidate:
 *   1. `data-slot-group="<key>"` match — strip.
 *   2. Text content contains a keyword from `SLOT_TO_SECTION_KEYWORDS[key]` — strip.
 *   3. Neither — leave alone.
 *
 * Scans direct children of the root `<section>` only. If the entire section
 * body becomes empty, the caller should skip generation for this component.
 */
export function stripSkippedSlotGroups(
  sectionHtml: string,
  skippedSlotKeys: string[],
): { html: string; strippedGroups: string[]; bodyEmpty: boolean } {
  if (!skippedSlotKeys.length) {
    return { html: sectionHtml, strippedGroups: [], bodyEmpty: false };
  }

  const $ = cheerio.load(sectionHtml, { xmlMode: false }, false);
  const root = $("section").first();
  // If there's no root section (fragment templates), walk the top-level wrapper instead.
  const scope = root.length ? root : $.root().children().first();
  if (!scope.length) {
    return { html: sectionHtml, strippedGroups: [], bodyEmpty: false };
  }

  const strippedGroups: string[] = [];

  for (const slotKey of skippedSlotKeys) {
    const keywords = SLOT_TO_SECTION_KEYWORDS[slotKey] || [];
    const annotated = scope.find(`[data-slot-group="${slotKey}"]`);
    if (annotated.length) {
      annotated.remove();
      strippedGroups.push(`${slotKey}:annotation`);
      continue;
    }
    if (!keywords.length) continue;

    // Keyword fallback: remove any direct child whose visible text includes a keyword.
    scope.children().each((_i, el) => {
      const $el = $(el);
      const text = $el.text().toLowerCase();
      for (const kw of keywords) {
        if (text.includes(kw.toLowerCase())) {
          $el.remove();
          strippedGroups.push(`${slotKey}:keyword:${kw}`);
          return;
        }
      }
    });
  }

  const out = $.html(scope);
  const bodyText = cheerio.load(out).root().text().trim();
  return {
    html: out,
    strippedGroups,
    bodyEmpty: bodyText.length === 0 && !/\{\{|\[/.test(out),
  };
}

export function buildComponentContext(
  identity: ProjectIdentity,
  component: { name: string; templateMarkup: string; type?: string },
  slotValues: Record<string, string> | undefined,
  pageContext?: string,
): ComponentContext {
  const ce = identity.content_essentials || {};
  const compName = component.name.toLowerCase();

  const parts: string[] = [];

  // Pre-compute skip list so we can strip template subtrees BEFORE the AI sees them.
  let strippedMarkup = component.templateMarkup;
  let strippedGroups: string[] = [];
  let bodyEmpty = false;
  if (slotValues) {
    const skipKeys: string[] = [];
    for (const [k, v] of Object.entries(slotValues)) {
      if (typeof v === "string" && v.trim() === "__skip__") skipKeys.push(k);
    }
    if (skipKeys.length > 0) {
      const stripped = stripSkippedSlotGroups(component.templateMarkup, skipKeys);
      strippedMarkup = stripped.html;
      strippedGroups = stripped.strippedGroups;
      bodyEmpty = stripped.bodyEmpty;
    }
  }

  parts.push(
    `## COMPONENT TO GENERATE\nName: ${component.name}\nType: ${component.type || "section"}`,
  );
  parts.push(`\n## TEMPLATE MARKUP\n\`\`\`html\n${strippedMarkup}\n\`\`\``);

  const relevantContent = extractRelevantContent(compName, ce, identity.locations);
  if (relevantContent) {
    parts.push(`\n## PAGE-SPECIFIC CONTEXT\n${relevantContent}`);
  }

  const manifest = filterImagesForComponent(
    compName,
    identity.extracted_assets?.images || [],
  );
  if (manifest.length > 0) {
    const lines = manifest.map(
      (m) =>
        `- ${m.id}: ${m.description || "(no description)"} - use_case: ${m.use_case || "?"} - resolution: ${m.resolution || "?"}`,
    );
    parts.push(
      `\n## AVAILABLE IMAGES (use the select_image tool to get actual URLs)\n${lines.join("\n")}`,
    );
  }

  if (slotValues) {
    const manual: Array<[string, string]> = [];
    const aiGenerate: string[] = [];
    const skip: string[] = [];

    for (const [k, v] of Object.entries(slotValues)) {
      if (!v) continue;
      const str = String(v).trim();
      if (!str) continue;
      if (str === "__generate__") aiGenerate.push(k);
      else if (str === "__skip__") skip.push(k);
      else manual.push([k, str]);
    }

    if (manual.length > 0) {
      parts.push(
        `\n## ADMIN-PROVIDED SLOT VALUES\n${manual.map(([k, v]) => `- ${k}: ${v}`).join("\n")}`,
      );
    }
    if (aiGenerate.length > 0) {
      parts.push(
        `\n## AI-GENERATED SLOTS (no admin value — generate appropriate content based on project identity)\n${aiGenerate.map((k) => `- ${k}`).join("\n")}`,
      );
    }
    if (skip.length > 0) {
      parts.push(
        `\n## SKIP THESE SLOTS (omit the corresponding content/section from the generated HTML entirely)\n${skip.map((k) => `- ${k}`).join("\n")}`,
      );
    }
  }

  if (pageContext && pageContext.trim()) {
    parts.push(`\n## ADDITIONAL CONTEXT FROM ADMIN\n${pageContext.trim()}`);
  }

  return {
    componentName: component.name,
    templateMarkup: strippedMarkup,
    variableUserMessage: parts.join("\n"),
    imageManifest: manifest,
    strippedSlotGroups: strippedGroups,
    skipGeneration: bodyEmpty,
  };
}

function extractRelevantContent(
  compName: string,
  ce: ProjectIdentity["content_essentials"],
  locations: ProjectIdentity["locations"],
): string | null {
  if (!ce) return null;
  const parts: string[] = [];

  const activeLocations = Array.isArray(locations)
    ? locations.filter((l) => l && !l.stale && l.name)
    : [];
  const isMultiLocation = activeLocations.length > 1;

  const addList = (label: string, items: unknown) => {
    if (!Array.isArray(items) || items.length === 0) return;
    parts.push(`**${label}:** ${items.filter(Boolean).join(", ")}`);
  };
  const addStr = (label: string, value: unknown) => {
    if (!value) return;
    parts.push(`**${label}:** ${value}`);
  };

  if (
    compName.includes("hero") ||
    compName.includes("upgrade") ||
    compName === "wrapper"
  ) {
    addStr("Unique value proposition", ce.unique_value_proposition);
    if (ce.featured_testimonials && ce.featured_testimonials.length > 0) {
      const t = ce.featured_testimonials[0];
      if (t.text) {
        parts.push(`**Top testimonial:** "${t.text}" - ${t.author || "patient"}`);
      }
    }
  }

  if (
    compName.includes("why-choose") ||
    compName.includes("whychoose") ||
    compName.includes("orthodontist") ||
    compName.includes("doctor")
  ) {
    addList("Certifications", ce.certifications);
    addList("Core values", ce.core_values);
  }

  if (
    compName.includes("doctor") ||
    compName.includes("team") ||
    compName.includes("meet") ||
    compName.includes("staff") ||
    compName.includes("provider")
  ) {
    const activeDoctors = Array.isArray(ce.doctors)
      ? ce.doctors.filter((d) => d && !d.stale && d.name)
      : [];
    if (activeDoctors.length > 0) {
      parts.push(
        "**Doctor roster (use credentials verbatim; keep blurbs as seed material, rewrite in voice):**",
      );
      for (const d of activeDoctors) {
        const creds =
          Array.isArray(d.credentials) && d.credentials.length > 0
            ? ` — ${d.credentials.join(", ")}`
            : "";
        parts.push(`  - ${d.name}${creds}`);
        if (d.short_blurb) parts.push(`      ${d.short_blurb}`);
      }
      parts.push(
        "When assigning photos to doctors, match the image whose description mentions that doctor's name (e.g., embroidered on scrubs, lab coat text). If no explicit match, prefer a solo headshot over a group photo.",
      );
    }
  }

  if (
    compName.includes("service") ||
    compName.includes("treatment") ||
    compName.includes("procedure")
  ) {
    const activeServices = Array.isArray(ce.services)
      ? ce.services.filter((s) => s && !s.stale && s.name)
      : [];
    if (activeServices.length > 0) {
      parts.push(
        "**Services offered (rewrite blurbs in voice; don't invent services not listed):**",
      );
      for (const s of activeServices) {
        parts.push(`  - ${s.name}`);
        if (s.short_blurb) parts.push(`      ${s.short_blurb}`);
      }
    }
  }

  if (compName.includes("testimonial") || compName.includes("review")) {
    if (ce.featured_testimonials && ce.featured_testimonials.length > 0) {
      parts.push("**Featured testimonials:**");
      for (const t of ce.featured_testimonials.slice(0, 5)) {
        parts.push(
          `  - "${t.text}" - ${t.author || "Anonymous"} (${t.rating || "?"} stars)`,
        );
      }
    }
  }

  if (compName.includes("faq")) {
    addList("Review themes to address", ce.review_themes);
  }

  if (compName === "footer") {
    if (ce.social_links) {
      const social = Object.entries(ce.social_links)
        .filter(([, v]) => v && typeof v === "string")
        .map(([k, v]) => `${k}: ${v}`)
        .join(", ");
      if (social) parts.push(`**Social links:** ${social}`);
    }
    addList("Service areas", ce.service_areas);
    addList("Certifications", ce.certifications);
    if (isMultiLocation) {
      parts.push("**All locations (list each by name; plain text, no links):**");
      for (const l of activeLocations) {
        const city = shortLocationLabel(l.address);
        const bits = [l.name, city, l.phone].filter(Boolean).join(" — ");
        parts.push(`  - ${bits}`);
      }
    }
  }

  if (
    compName.includes("about") ||
    compName.includes("story") ||
    compName.includes("values")
  ) {
    addStr("Founding story", ce.founding_story);
    addList("Core values", ce.core_values);
    if (isMultiLocation) {
      parts.push(
        `**Multi-location:** practice has ${activeLocations.length} locations — reflect this in any "about us" copy (e.g., "across our ${activeLocations.length} offices" rather than singular phrasing).`,
      );
    }
  }

  if (
    isMultiLocation &&
    (compName.includes("hero") ||
      compName.includes("upgrade") ||
      compName === "wrapper")
  ) {
    const cities = activeLocations
      .map((l) => shortLocationLabel(l.address))
      .filter(Boolean);
    if (cities.length > 0) {
      parts.push(
        `**Multi-location:** serving ${cities.join(", ")}. Prefer plural framing in CTAs (e.g., "find your nearest office" instead of "visit us at 123 Main St").`,
      );
    }
  }

  return parts.length > 0 ? parts.join("\n") : null;
}

function filterImagesForComponent(
  compName: string,
  images: ImageManifestEntry[],
): Array<{
  id: string;
  description: string | null;
  use_case: string | null;
  resolution: string | null;
}> {
  if (!Array.isArray(images) || images.length === 0) return [];

  const ranked = images
    .map((img, idx) => {
      const use = (img.use_case || "").toLowerCase();
      let score = 0;

      if (compName.includes("hero") || compName.includes("upgrade")) {
        if (use.includes("hero") || use.includes("banner")) score += 10;
        if (img.resolution === "high") score += 3;
      }
      if (compName.includes("gallery") || compName.includes("portfolio")) {
        if (
          use.includes("gallery") ||
          use.includes("portfolio") ||
          use.includes("before")
        )
          score += 10;
      }
      if (
        compName.includes("team") ||
        compName.includes("about") ||
        compName.includes("doctor")
      ) {
        if (
          use.includes("team") ||
          use.includes("portrait") ||
          use.includes("doctor")
        )
          score += 10;
      }
      if (compName === "header" || compName === "wrapper") {
        if (img.is_logo || use.includes("logo")) score += 20;
      }
      if (compName.includes("service") || compName.includes("why-choose")) {
        if (
          use.includes("office") ||
          use.includes("interior") ||
          use.includes("storefront")
        )
          score += 5;
      }

      score += img.usability_rank || 5;

      return { img, score, idx };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return ranked.map((r) => ({
    id: `img-${r.idx}`,
    description: r.img.description || null,
    use_case: r.img.use_case || null,
    resolution: r.img.resolution || null,
  }));
}

// ---------------------------------------------------------------------------
// IMAGE URL RESOLVER (for select_image tool)
// ---------------------------------------------------------------------------

export function resolveImageUrl(
  identity: ProjectIdentity,
  imageId: string,
): { s3_url: string | null; description: string | null } | null {
  const match = /^img-(\d+)$/.exec(imageId);
  if (!match) return null;
  const idx = parseInt(match[1], 10);
  const images = identity.extracted_assets?.images || [];
  const img = images[idx];
  if (!img) return null;
  return {
    s3_url: img.s3_url || img.source_url || null,
    description: img.description || null,
  };
}
