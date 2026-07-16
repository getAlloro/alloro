/**
 * B2 — CRO-lift rewrite (Taste-Profile-driven page copy). GENERATION phase.
 *
 * Reads the business's APPROVED Taste Profile (#160 spine) and rewrites each
 * eligible page section in the business's own proven, sourced voice — then gates
 * every rewrite for honesty BEFORE it can become an approvable recommendation.
 *
 * This is compose-and-wire, NOT a new generator (§6.1 analog: `gbp-automation`
 * feature-services orchestrate; the extractors + the LLM primitive + the rail
 * stay where they are). It reuses:
 *   - `TasteProfileModel.findLatestByOrgAndLocation` (the approved profile),
 *   - `resolvePages` + `normalizeSections` (the pages/sections to rewrite),
 *   - `editHtmlContent` (the LLM edit primitive — injected so tests run without
 *     a live model),
 *   - the `ai_command_recommendations` rail (a new `taste_rewrite` target_type;
 *     no schema change — target_type is free-form text, target_meta is jsonb),
 *   - the existing approve → `executeBatch` → auto-publish path.
 * It does NOT touch `instantWebsiteGenerator.ts` (the one-shot static generator).
 *
 * HONESTY (Value #6) — the safety spine of B2:
 *   1. The instruction constrains the LLM to the profile's SOURCED facts only
 *      and forbids inventing facts/numbers/testimonials/outcomes or making any
 *      rank/visibility/guarantee/superlative/implied-promise claim.
 *   2. Every rewritten section's OUTPUT is run through `gateRewrite`
 *      (`enforceHonesty` + the B2 subtle-over-claim scanner). A section that
 *      trips EITHER is DROPPED to an audit and never becomes a recommendation —
 *      so an over-claim is never even approvable. The stored copy is re-gated
 *      at execution (`executeTasteRewrite`), so what publishes is exactly what
 *      was gated + approved.
 *
 * OWNER IS THE HERO (Value #2): this only creates DRAFT (pending) recommendations
 * on a `ready` batch. Nothing publishes until the owner approves via the existing
 * approval rail and the batch is executed.
 *
 * STATUS ENFORCEMENT: `findLatestByOrgAndLocation` returns the latest profile
 * regardless of status (it does NOT filter). B2 enforces `status === 'approved'`
 * here — a draft profile must never seed a rewrite.
 */

import { AiCommandBatchModel } from "../../../models/website-builder/AiCommandBatchModel";
import { AiCommandRecommendationModel } from "../../../models/website-builder/AiCommandRecommendationModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import { TasteProfileModel } from "../../../models/website-builder/TasteProfileModel";
import type { TasteProfile } from "./service.taste-profile";
import { normalizeSections } from "../feature-utils/util.section-normalizer";
import { resolvePages, refreshStats } from "../feature-utils/util.ai-command-shared";
import { gateRewrite } from "../feature-utils/util.taste-rewrite-honesty";
import { editHtmlContent } from "../../../utils/website-utils/aiCommandService";
import logger from "../../../lib/logger";

// ---------------------------------------------------------------------------
// PUBLIC SHAPES
// ---------------------------------------------------------------------------

export interface TasteRewriteOptions {
  /** null (default) selects the organization-level profile; a number a location. */
  locationId?: number | null;
  createdBy?: string | null;
  /** Which pages to rewrite. Defaults to "all". */
  targetPages?: string[] | "all";
}

export interface DroppedRewrite {
  page_path: string;
  section_index: number;
  section_name: string;
  /** Why the rewrite was withheld — gate reason codes, or an error marker. */
  reasonCodes: string[];
}

export interface TasteRewriteResult {
  batchId: string | null;
  /** "ready" = a batch of drafts awaits owner approval; "skipped_*" = nothing to do. */
  status: "ready" | "skipped_no_org" | "skipped_no_approved_profile";
  /** Sections a rewrite was attempted on. */
  generated: number;
  /** Rewrites that passed the gate and became pending recommendations. */
  kept: number;
  /** Rewrites withheld (gate trip or rewrite error) — never stored. */
  dropped: DroppedRewrite[];
  reason?: string;
}

/**
 * The LLM rewrite step, injected so the honesty gate + the batch orchestration
 * are testable without a live model. The production default wraps the reused
 * `editHtmlContent` primitive.
 */
export type RewriteSectionFn = (args: {
  instruction: string;
  currentHtml: string;
  targetLabel: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  costContext?: any;
}) => Promise<{ editedHtml: string }>;

const defaultRewriteFn: RewriteSectionFn = async (args) => {
  const result = await editHtmlContent(args);
  return { editedHtml: result.editedHtml };
};

// ---------------------------------------------------------------------------
// INSTRUCTION — profile → a sourced-facts-only rewrite brief
// ---------------------------------------------------------------------------

/** One bullet per sourced claim; empty groups are omitted (never fabricated). */
function factLines(label: string, values: string[]): string {
  const clean = values.map((v) => (v ?? "").trim()).filter((v) => v.length > 0);
  if (clean.length === 0) return "";
  return `${label}:\n${clean.map((v) => `- ${v}`).join("\n")}\n`;
}

/**
 * Build the rewrite instruction from the APPROVED profile. It lists the sourced
 * facts the copy may draw from and the hard honesty rules. The output gate is
 * the enforcement; this instruction is the first line of defense.
 */
export function buildRewriteInstruction(profile: TasteProfile): string {
  const facts = [
    profile.suggested_headline
      ? `Suggested headline (already honesty-checked): ${profile.suggested_headline}`
      : "",
    profile.hero_quote ? factLines("Hero quote (from a real review)", [profile.hero_quote.value]) : "",
    factLines("Praise themes (from real reviews)", (profile.praise_themes ?? []).map((c) => c.value)),
    factLines("Why customers choose this business", (profile.customer_journey?.why_they_choose ?? []).map((c) => c.value)),
    profile.unique_strength ? factLines("Unique strength", [profile.unique_strength.value]) : "",
    factLines("Credentials", (profile.credentials ?? []).map((c) => c.value)),
    factLines("Practice facts", (profile.practice_facts ?? []).map((c) => c.value)),
  ]
    .filter((s) => s.length > 0)
    .join("\n");

  return [
    `Rewrite this section's copy in the true voice of "${profile.business_name}"` +
      `${profile.business_category ? ` (${profile.business_category})` : ""}.`,
    profile.voice
      ? `Voice: ${profile.voice.archetype}${profile.voice.tone_descriptor ? `, ${profile.voice.tone_descriptor}` : ""}.`
      : "",
    "",
    "Use ONLY the sourced facts below. Do not invent facts, numbers, statistics,",
    "testimonials, awards, or outcomes. If a claim is not in this list, do not make it.",
    "",
    facts || "(No sourced facts available — make no factual claims; improve clarity and structure only.)",
    "",
    "HARD RULES (Value #6 — the copy must be true and provable):",
    "- No ranking or visibility claims (no 'get found', 'top of Google', 'rank #1', 'first page').",
    "- No guarantees or promises ('guaranteed', 'we promise', 'you'll love', 'we'll make').",
    "- No unprovable superlatives ('best', 'finest', '#1', 'top-rated', 'the only', 'premier').",
    "- No absolute outcome claims ('painless', 'completely safe', '100%', 'gentlest', 'perfect smile').",
    "- No invented dollar figures or multipliers.",
    "- Keep the same HTML structure/tags; rewrite only the human-readable text.",
    "- Return ONLY the rewritten HTML for this section. No JSON, no code fences, no commentary.",
  ]
    .filter((s) => s !== undefined)
    .join("\n");
}

// ---------------------------------------------------------------------------
// GENERATION
// ---------------------------------------------------------------------------

/** Extract a section's editable HTML, mirroring the analysis-phase reader. */
function sectionHtmlOf(section: any): string {
  return typeof section === "string" ? section : section?.content || section?.html || "";
}

function sectionNameOf(section: any, index: number): string {
  if (typeof section === "string") return `Section ${index + 1}`;
  return section?.name || section?.label || `Section ${index + 1}`;
}

/**
 * Generate a batch of DRAFT `taste_rewrite` recommendations for a project from
 * its APPROVED Taste Profile. Each rewrite is gated before it is stored; only
 * clean rewrites become pending recommendations for the owner to approve.
 *
 * Returns an audit. Creates NO batch when there is no org or no approved
 * profile (honest empty — never a draft-seeded rewrite).
 */
export async function generateTasteRewriteBatch(
  projectId: string,
  opts: TasteRewriteOptions = {},
  rewriteFn: RewriteSectionFn = defaultRewriteFn
): Promise<TasteRewriteResult> {
  const project = await ProjectModel.findRawById(projectId);
  if (!project) throw new Error(`Project ${projectId} not found`);

  const orgId: number | null = project.organization_id ?? null;
  if (orgId === null) {
    return { batchId: null, status: "skipped_no_org", generated: 0, kept: 0, dropped: [], reason: "Project has no organization_id — cannot resolve a Taste Profile." };
  }

  const locationId = opts.locationId ?? null;
  const profileRow = await TasteProfileModel.findLatestByOrgAndLocation(orgId, locationId);

  // STATUS ENFORCEMENT — the model returns the latest regardless of status; B2
  // consumes ONLY an approved profile. A draft (or absent) profile → no rewrite.
  if (!profileRow || profileRow.status !== "approved") {
    return {
      batchId: null,
      status: "skipped_no_approved_profile",
      generated: 0,
      kept: 0,
      dropped: [],
      reason: profileRow
        ? `Latest Taste Profile is status "${profileRow.status}", not "approved".`
        : "No Taste Profile exists for this org/location.",
    };
  }

  const profile = profileRow.profile;
  const instruction = buildRewriteInstruction(profile);

  const batch = await AiCommandBatchModel.insertReturning({
    project_id: projectId,
    prompt: "Taste Profile rewrite (get-considered copy in the business's true voice)",
    targets: JSON.stringify({ pages: opts.targetPages ?? "all", type: "taste_rewrite" }),
    status: "analyzing",
    created_by: opts.createdBy ?? null,
  });
  const batchId: string = batch.id;

  logger.info(`[TasteRewrite] Batch ${batchId} for project ${projectId} (org ${orgId}, location ${locationId ?? "null"})`);

  const pages = await resolvePages(projectId, opts.targetPages ?? "all");
  const dropped: DroppedRewrite[] = [];
  let generated = 0;
  let kept = 0;
  let sortOrder = 0;

  for (const page of pages) {
    const rawSections =
      typeof page.sections === "string" ? JSON.parse(page.sections) : page.sections;
    const sections = normalizeSections(rawSections);

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const sectionHtml = sectionHtmlOf(section);
      const sectionName = sectionNameOf(section, i);

      if (!sectionHtml || sectionHtml.trim().length === 0) continue;
      // Skip shortcode-only sections — nothing to rewrite (mirrors analysis phase).
      if (sectionHtml.trim().length < 100 && /\{\{.*\}\}/.test(sectionHtml)) continue;

      const targetLabel = `${page.path} > ${sectionName}`;
      generated++;

      let editedHtml: string;
      try {
        const result = await rewriteFn({
          instruction,
          currentHtml: sectionHtml,
          targetLabel,
          costContext: {
            projectId,
            eventType: "ai-command",
            metadata: {
              batch_id: batchId,
              scope: "taste-rewrite",
              page_id: page.id,
              page_path: page.path,
              section_index: i,
            },
          },
        });
        editedHtml = result.editedHtml;
      } catch (err) {
        logger.error({ err: (err as Error).message }, `[TasteRewrite] Rewrite failed for ${targetLabel}`);
        dropped.push({ page_path: page.path, section_index: i, section_name: sectionName, reasonCodes: ["rewrite_error"] });
        continue;
      }

      // THE GATE — over-claim (banned OR subtle) is dropped, never stored.
      const gate = gateRewrite(editedHtml);
      if (!gate.ok) {
        logger.warn(`[TasteRewrite] DROPPED ${targetLabel}: ${gate.reasonCodes.join(", ")}`);
        dropped.push({ page_path: page.path, section_index: i, section_name: sectionName, reasonCodes: gate.reasonCodes });
        continue;
      }

      await AiCommandRecommendationModel.insertRow({
        batch_id: batchId,
        target_type: "taste_rewrite",
        target_id: page.id,
        target_label: targetLabel,
        target_meta: JSON.stringify({
          section_index: i,
          section_name: sectionName,
          page_path: page.path,
          rewritten_html: editedHtml,
        }),
        recommendation: "Rewrite this section in the business's true voice (from the approved Taste Profile).",
        instruction,
        current_html: sectionHtml,
        sort_order: sortOrder++,
      });
      kept++;
      await refreshStats(batchId);
    }
  }

  await AiCommandBatchModel.updateStatus(batchId, "ready");
  logger.info(`[TasteRewrite] ✓ Batch ${batchId} ready: ${kept} kept, ${dropped.length} dropped of ${generated} generated`);

  return { batchId, status: "ready", generated, kept, dropped };
}
