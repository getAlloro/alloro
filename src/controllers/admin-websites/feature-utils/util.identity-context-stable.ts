/**
 * Identity Context — stable (cached) context block.
 *
 * Builds the portion of the LLM context that is identical across every
 * component call for a project, so it can be cached. Pure function: no LLM,
 * no DB.
 */

import type { ProjectIdentity } from "./util.identity-context-types";
import { kvLines, shortLocationLabel } from "./util.identity-context-format";

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
