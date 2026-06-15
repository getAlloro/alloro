/**
 * Slot Pre-fill Mapper
 *
 * Given a project and a set of slot definitions (from template_page.dynamic_slots
 * or template.layout_slots), returns the pre-filled values derived from the
 * project's project_identity. Deterministic — no LLM call. Used by the create-page
 * modal and the Layouts tab to populate slot inputs with sensible defaults.
 */

import { ProjectIdentityModel } from "../../../models/website-builder/ProjectIdentityModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { TemplatePageModel } from "../../../models/website-builder/TemplatePageModel";
import { TemplateModel } from "../../../models/website-builder/TemplateModel";
import { parseProjectIdentity } from "../feature-utils/util.project-identity";

interface SlotDef {
  key: string;
  label: string;
  type: "text" | "url";
  description?: string;
}

// ---------------------------------------------------------------------------
// Mapping — slot key → extractor function (reads from identity, returns string)
// ---------------------------------------------------------------------------

type IdentityType = Record<string, any>;

const EXTRACTORS: Record<string, (identity: IdentityType) => string | null> = {
  // Homepage slots
  certifications_credentials: (id) =>
    joinList(id.content_essentials?.certifications) ||
    joinList(uniqueDoctorCredentials(id)),
  unique_value_proposition: (id) => str(id.content_essentials?.unique_value_proposition),
  gallery_source_url: (id) => findImageUrl(id, "gallery"),
  faq_focus_topics: (id) => joinList(id.content_essentials?.review_themes),

  // About slots
  practice_founding_story: (id) => str(id.content_essentials?.founding_story),
  practice_values: (id) => joinList(id.content_essentials?.core_values),

  // Contact slots
  parking_directions: () => null, // free-form, no default
  insurance_accepted_list: (id) =>
    joinList(
      (id.content_essentials?.certifications || []).filter((c: string) =>
        /insurance|delta|cigna|aetna|metlife|guardian|unitedhealthcare/i.test(c),
      ),
    ),
  new_patient_forms_url: () => null,

  // Consultation slots — free-form, no identity mapping
  consultation_types: () => null,
  what_to_expect: () => null,
  consultation_form_fields: () => null,

  // Insurance & financial
  accepted_insurance_list: () => null,
  payment_options: () => null,
  billing_policy: () => null,
  cost_estimate_process: () => null,

  // Emergency — free-form, no identity mapping
  emergency_hours_policy: () => null,
  common_emergencies_handled: () => null,
  emergency_contact_details: () => null,
  first_aid_instructions: () => null,

  // Layout slots (templates.layout_slots)
  logo_url: (id) => str(id.brand?.logo_s3_url),
  logo_alt_text: (id) => str(id.brand?.logo_alt_text) || str(id.business?.name),
  social_links: (id) => {
    const social = id.content_essentials?.social_links;
    if (!social || typeof social !== "object") return null;
    const urls = Object.values(social).filter(
      (v): v is string => typeof v === "string" && v.trim().length > 0,
    );
    return urls.length > 0 ? urls.join("\n") : null;
  },
  nav_cta_text: () => null,
  footer_service_areas: (id) => joinList(id.content_essentials?.service_areas),
  custom_footer_legal_text: () => null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v.trim() || null;
  return String(v);
}

function joinList(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  return v.filter((x) => typeof x === "string" && x.trim()).join(", ") || null;
}

/**
 * Unique, deduped list of credentials across all non-stale doctors. Used as a
 * fallback for practice-level certifications when the dedicated
 * `content_essentials.certifications` is empty — admin-editable, so running
 * this on every warmup would overwrite hand-tuned values, but on first
 * prefill it's strictly additive.
 */
function uniqueDoctorCredentials(identity: IdentityType): string[] {
  const doctors = identity.content_essentials?.doctors;
  if (!Array.isArray(doctors) || doctors.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of doctors) {
    if (!d || d.stale) continue;
    const creds = Array.isArray(d.credentials) ? d.credentials : [];
    for (const c of creds) {
      if (typeof c !== "string") continue;
      const key = c.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(c.trim());
    }
  }
  return out;
}

function findImageUrl(identity: IdentityType, useCase: string): string | null {
  const images = identity.extracted_assets?.images;
  if (!Array.isArray(images)) return null;
  const match = images.find((img: any) =>
    img.use_case && String(img.use_case).toLowerCase().includes(useCase.toLowerCase()),
  );
  return match?.s3_url || match?.source_url || null;
}

// ---------------------------------------------------------------------------
// PUBLIC API
// ---------------------------------------------------------------------------

/**
 * Given a project and slot definitions, return pre-filled values by key.
 * Only returns keys for which a non-null value was extracted.
 */
export function getPrefilledSlotValues(
  identity: IdentityType | null,
  slotDefinitions: SlotDef[],
): Record<string, string> {
  if (!identity) return {};
  const result: Record<string, string> = {};
  for (const slot of slotDefinitions) {
    const extractor = EXTRACTORS[slot.key];
    if (!extractor) continue;
    const value = extractor(identity);
    if (value) result[slot.key] = value;
  }
  return result;
}

/**
 * Fetch pre-filled values for a specific template page.
 */
export async function getPageSlotPrefill(
  projectId: string,
  templatePageId: string,
): Promise<{ slots: SlotDef[]; values: Record<string, string> }> {
  const identity = await ProjectIdentityModel.findByProjectId(projectId);

  const templatePage = await TemplatePageModel.findDynamicSlotsById(templatePageId);

  const slots: SlotDef[] =
    parseProjectIdentity(templatePage?.dynamic_slots) || [];

  return {
    slots,
    values: getPrefilledSlotValues(identity, slots),
  };
}

/**
 * Fetch pre-filled values for the layout slots of the project's template.
 */
export async function getLayoutSlotPrefill(
  projectId: string,
): Promise<{ slots: SlotDef[]; values: Record<string, string> }> {
  const project = await ProjectModel.findById(projectId);

  if (!project) return { slots: [], values: {} };

  const template = project.template_id
    ? await TemplateModel.findLayoutSlotsById(project.template_id)
    : null;

  const identity = await ProjectIdentityModel.findByProjectId(projectId);
  const slots: SlotDef[] = parseProjectIdentity(template?.layout_slots) || [];

  return {
    slots,
    values: getPrefilledSlotValues(identity, slots),
  };
}
