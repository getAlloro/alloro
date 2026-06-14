/**
 * Identity Context — per-component context + image manifest.
 *
 * Builds the variable, per-component portion of the LLM context (template
 * markup, page-specific identity content, image candidates, slot directives)
 * and resolves image IDs back to URLs for the select_image tool. Pure
 * functions: no LLM, no DB.
 */

import type {
  ComponentContext,
  ImageManifestEntry,
  ProjectIdentity,
} from "./util.identity-context-types";
import { shortLocationLabel } from "./util.identity-context-format";
import { stripSkippedSlotGroups } from "./util.identity-context-slot-stripper";

// ---------------------------------------------------------------------------
// PER-COMPONENT CONTEXT
// ---------------------------------------------------------------------------

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
