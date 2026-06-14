/**
 * Slot Generator — on-demand LLM fill for Create Page slots.
 *
 * Takes a project + template_page and runs a single LLM call that produces
 * concrete text values for every text-type slot using the full identity
 * context. Used by the "Rewrite all from identity" button in
 * CreatePageModal. URL-type slots are skipped (cannot be invented).
 */

import { runAgent } from "../../../agents/service.llm-runner";
import { ProjectIdentityModel } from "../../../models/website-builder/ProjectIdentityModel";
import { TemplatePageModel } from "../../../models/website-builder/TemplatePageModel";
import {
  buildStableIdentityContext,
  type ProjectIdentity,
} from "../feature-utils/util.identity-context";
import {
  hasUsableIdentityForSlotGeneration,
  parseProjectIdentity,
} from "../feature-utils/util.project-identity";

interface SlotDef {
  key: string;
  label: string;
  type: "text" | "url";
  description?: string;
  placeholder?: string;
}

export async function generateSlotValuesFromIdentity(
  projectId: string,
  templatePageId: string,
  pageContext?: string,
): Promise<{ values: Record<string, string> }> {
  const identity =
    await ProjectIdentityModel.findByProjectId<ProjectIdentity>(projectId);
  if (!identity || !hasUsableIdentityForSlotGeneration(identity)) {
    throw new Error("IDENTITY_NOT_READY");
  }

  const templatePage = await TemplatePageModel.findNameDynamicSlotsById(
    templatePageId
  );
  if (!templatePage) throw new Error("TEMPLATE_PAGE_NOT_FOUND");

  const rawSlots = parseProjectIdentity<SlotDef[]>(templatePage.dynamic_slots);
  const allSlots: SlotDef[] = Array.isArray(rawSlots) ? rawSlots : [];
  const textSlots = allSlots.filter((s) => s && s.key && s.type !== "url");

  if (textSlots.length === 0) return { values: {} };

  const stableContext = buildStableIdentityContext(identity);

  const slotLines = textSlots
    .map((s) => {
      const desc = s.description ? ` — ${s.description}` : "";
      return `- "${s.key}" (${s.label})${desc}`;
    })
    .join("\n");

  const system = [
    "You fill in slot values for a template page on a dental/medical practice website.",
    "Use the project identity below to write concrete, on-brand copy for each requested slot.",
    "Match the practice's voice and tone. Do not invent services, doctors, or credentials that are not in identity.",
    "Output ONLY a JSON object of the form { \"values\": { \"<slot_key>\": \"<generated text>\" } }.",
    "Keep each value concise — matches the length implied by the slot description (1–2 sentences for tagline-style, a comma-separated list for list-style, etc.).",
    "For list-style slots (certifications, service areas, topics), output a comma-separated string, not an array.",
    "",
    "## PROJECT IDENTITY",
    stableContext,
  ].join("\n");

  const userParts: string[] = [
    `Page: ${templatePage.name || "(unnamed)"}`,
    "",
    "Generate a value for each of these slots:",
    slotLines,
  ];
  if (pageContext && pageContext.trim()) {
    userParts.push("", `Page context from admin: ${pageContext.trim()}`);
  }
  userParts.push(
    "",
    'Respond with ONLY the JSON object: {"values": {"slot_key": "text", ...}}.',
  );

  const result = await runAgent({
    systemPrompt: system,
    userMessage: userParts.join("\n"),
    maxTokens: 2048,
  });

  const parsed = result.parsed;
  const out: Record<string, string> = {};
  const values = parsed?.values && typeof parsed.values === "object" ? parsed.values : {};
  const allowedKeys = new Set(textSlots.map((s) => s.key));
  for (const [k, v] of Object.entries(values)) {
    if (!allowedKeys.has(k)) continue;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (!trimmed) continue;
    out[k] = trimmed;
  }

  return { values: out };
}
