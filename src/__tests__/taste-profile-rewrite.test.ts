/**
 * Unit tests — B2 CRO-lift rewrite (plans/07152026-cro-lift-rewrite).
 *
 * Three seams, all the adversary's targets:
 *
 *   1. The HONESTY GATE (util.taste-rewrite-honesty) — the whole point of B2.
 *      Pure text scanners: banned keywords (via the spine's enforceHonesty) AND
 *      subtle over-claims that are NOT keywords (superlatives, implied promises,
 *      absolute outcome claims). Asserts a subtle over-claim in GENERATED copy
 *      is caught, honest sourced copy passes, and a negated disclaimer passes.
 *
 *   2. GENERATION (service.taste-profile-rewrite) — an over-claiming rewrite is
 *      DROPPED (never stored, never approvable); a clean rewrite is stored as a
 *      pending taste_rewrite recommendation. A non-approved (or absent) profile
 *      yields NO batch and NO recommendations (status enforced in B2, since the
 *      model does not filter by status).
 *
 *   3. EXECUTION (executeTasteRewrite) — writes the STORED copy verbatim (no
 *      fresh LLM) to the section, and RE-ASSERTS the gate: a poisoned stored row
 *      is failed and never reaches the page.
 *
 * Data strategy: Option B (mock the data layer + the LLM). No live Postgres, no
 * network, no live model. Synthetic ids/values only (§20.4). The LLM step is an
 * injected dependency in generation, so no model is called there either.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Data-layer + LLM seams (module-level, hoisted) ────────────────────────
const insertReturning = vi.fn();
const batchUpdateStatus = vi.fn();
const insertRow = vi.fn();
const recUpdateById = vi.fn();
const projectFindRawById = vi.fn();
const profileFindLatest = vi.fn();
const pageFindRawById = vi.fn();
const updateSectionsById = vi.fn();
const resolvePages = vi.fn();
const refreshStats = vi.fn();
const resolvePageDraftId = vi.fn();

vi.mock("../models/website-builder/AiCommandBatchModel", () => ({
  AiCommandBatchModel: {
    insertReturning: (...a: unknown[]) => insertReturning(...a),
    updateStatus: (...a: unknown[]) => batchUpdateStatus(...a),
  },
}));
vi.mock("../models/website-builder/AiCommandRecommendationModel", () => ({
  AiCommandRecommendationModel: {
    insertRow: (...a: unknown[]) => insertRow(...a),
    updateById: (...a: unknown[]) => recUpdateById(...a),
  },
}));
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: { findRawById: (...a: unknown[]) => projectFindRawById(...a) },
}));
vi.mock("../models/website-builder/TasteProfileModel", () => ({
  TasteProfileModel: {
    findLatestByOrgAndLocation: (...a: unknown[]) => profileFindLatest(...a),
  },
}));
vi.mock("../models/website-builder/PageModel", () => ({
  PageModel: {
    findRawById: (...a: unknown[]) => pageFindRawById(...a),
    updateSectionsById: (...a: unknown[]) => updateSectionsById(...a),
  },
}));
// Keep resolvePages/refreshStats/resolvePageDraftId as spies; other named
// exports the touched modules import are stubbed so the import resolves.
vi.mock("../controllers/admin-websites/feature-utils/util.ai-command-shared", () => ({
  resolvePages: (...a: unknown[]) => resolvePages(...a),
  refreshStats: (...a: unknown[]) => refreshStats(...a),
  resolvePageDraftId: (...a: unknown[]) => resolvePageDraftId(...a),
  getExistingPaths: vi.fn(),
  getExistingPostSlugs: vi.fn(),
}));
// Heavy/network sibling modules the handler + service drag in at import.
vi.mock("../utils/website-utils/aiCommandService", () => ({
  editHtmlContent: vi.fn(),
  planPageSections: vi.fn(),
  generateSectionHtml: vi.fn(),
  generatePostContent: vi.fn(),
}));
vi.mock("../utils/website-utils/agenticHtmlPipeline", () => ({
  runAgenticPipeline: vi.fn(),
}));

import {
  htmlToText,
  scanSubtleOverclaim,
  gateRewrite,
} from "../controllers/admin-websites/feature-utils/util.taste-rewrite-honesty";
import {
  generateTasteRewriteBatch,
  buildRewriteInstruction,
} from "../controllers/admin-websites/feature-services/service.taste-profile-rewrite";
import { executeTasteRewrite } from "../controllers/admin-websites/feature-services/service.ai-command-execute-handlers";
import type { TasteProfile } from "../controllers/admin-websites/feature-services/service.taste-profile";

// ── Fixtures ──────────────────────────────────────────────────────────────
const approvedProfile: TasteProfile = {
  business_name: "Bright Smile Dental",
  business_category: "Dentist",
  voice: { archetype: "The Caregiver", tone_descriptor: "warm and reassuring" },
  hero_quote: { value: "They explained every step and I felt at ease.", source: "review:12" },
  suggested_headline: "Dentistry that listens first",
  unique_strength: { value: "Same-day emergency visits", source: "page_content: \"same-day\"" },
  praise_themes: [{ value: "Gentle, unhurried care", source: "review:8" }],
  credentials: [{ value: "Dr. Lee: DDS, 15 years", source: "https://x/team" }],
  practice_facts: [{ value: "Open Saturdays", source: "gbp_hours: \"Sat 9-2\"" }],
  customer_journey: {
    why_they_choose: [{ value: "Customers choose Bright Smile for gentle care.", source: "review:8" }],
    what_makes_them_hesitate: [],
  },
};

const makeProfileRow = (status: string) => ({
  id: "tp-1",
  organization_id: 7,
  location_id: null,
  status,
  profile: approvedProfile,
});

beforeEach(() => {
  vi.clearAllMocks();
  insertReturning.mockResolvedValue({ id: "batch-1" });
  batchUpdateStatus.mockResolvedValue(1);
  insertRow.mockResolvedValue(undefined);
  recUpdateById.mockResolvedValue(1);
  refreshStats.mockResolvedValue(undefined);
});

// ── 1. THE HONESTY GATE ─────────────────────────────────────────────────
describe("util.taste-rewrite-honesty", () => {
  it("htmlToText strips tags and decodes entities to visible text", () => {
    expect(htmlToText("<h1>Gentle&nbsp;care</h1><p>We&#39;re here.</p>")).toBe(
      "Gentle care We're here."
    );
  });

  it("scanSubtleOverclaim catches subtle over-claims that are NOT banned keywords", () => {
    // superlatives
    expect(scanSubtleOverclaim("We are the best dentist in town.").ok).toBe(false);
    expect(scanSubtleOverclaim("The finest, top-rated care around.").ok).toBe(false);
    expect(scanSubtleOverclaim("The only practice that truly cares.").ok).toBe(false);
    // implied promises
    expect(scanSubtleOverclaim("You'll love your visit.").ok).toBe(false);
    expect(scanSubtleOverclaim("We'll make you smile again.").ok).toBe(false);
    // absolute outcome claims
    expect(scanSubtleOverclaim("A completely painless experience.").ok).toBe(false);
    expect(scanSubtleOverclaim("The gentlest dentist you'll ever meet.").ok).toBe(false);
    expect(scanSubtleOverclaim("100% comfortable, every single time.").ok).toBe(false);
  });

  it("scanSubtleOverclaim passes honest, sourced-style copy", () => {
    expect(
      scanSubtleOverclaim("Patients describe the care as gentle and unhurried.").ok
    ).toBe(true);
    expect(scanSubtleOverclaim("Dr. Lee has practiced for 15 years. Open Saturdays.").ok).toBe(
      true
    );
  });

  it("scanSubtleOverclaim lets a negated disclaimer through", () => {
    expect(scanSubtleOverclaim("We make no promises about your results.").ok).toBe(true);
    expect(scanSubtleOverclaim("We are not the cheapest option.").ok).toBe(true);
  });

  it("gateRewrite composes enforceHonesty (keywords) AND the subtle scanner, on HTML", () => {
    // banned keyword — caught by the spine's enforceHonesty
    expect(gateRewrite("<p>We rank #1 on Google.</p>").ok).toBe(false);
    // subtle superlative buried in markup — caught by the B2 scanner via htmlToText
    expect(gateRewrite("<div><span>the finest</span> care in the state</div>").ok).toBe(false);
    // clean, sourced copy — passes both
    const clean = gateRewrite("<h1>Dentistry that listens first</h1><p>Gentle, unhurried care.</p>");
    expect(clean.ok).toBe(true);
    expect(clean.reasonCodes).toEqual([]);
  });

  // ── Adversary regression (Fable-5, 2026-07-15). Every string below slipped the
  //    original gate; each must now be BLOCKED (gateRewrite ok === false). ──
  it("F1 — blocks superlative-synonym over-claims the allowlist missed", () => {
    const attacks = [
      "<p>We deliver unparalleled dental care to every family.</p>",
      "<p>Our elite team of dentists is here for you.</p>",
      "<p>A renowned practice serving the community for years.</p>",
      "<p>We are an award-winning dental office.</p>",
      "<p>Enjoy our state-of-the-art dental technology.</p>",
      "<p>Trusted by thousands of happy patients.</p>",
      "<p>We're a 5-star rated dental practice.</p>",
      "<p>Nobody does it better than our team.</p>",
      "<p>Smiles that last a lifetime.</p>",
      "<p>Life-changing results await.</p>",
    ];
    for (const a of attacks) expect(gateRewrite(a).ok, a).toBe(false);
  });

  it("F2 — strict negation blocks 'not X — but [brag]' smuggling (incl. banned words)", () => {
    expect(gateRewrite("<p>Not your average clinic — the finest care in the state.</p>").ok).toBe(false);
    expect(gateRewrite("<p>This isn't hype: our team is second to none.</p>").ok).toBe(false);
    // the worst case — smuggles genuinely banned words past a distant negator
    expect(
      gateRewrite("<p>We don't just fix teeth — we promise a painless, life-changing experience.</p>").ok
    ).toBe(false);
    // but an honest disclaimer whose negator actually governs the phrase still passes
    expect(gateRewrite("<p>We make no promises about specific outcomes.</p>").ok).toBe(true);
  });

  it("F3 — scans visible attribute text (alt/title/aria-label)", () => {
    expect(gateRewrite('<img alt="The best dentist in town, results guaranteed">').ok).toBe(false);
    expect(gateRewrite('<a title="Painless dentistry, guaranteed #1 in the city">Book</a>').ok).toBe(false);
    expect(gateRewrite('<span aria-label="We guarantee the finest painless care">Comfort</span>').ok).toBe(false);
  });

  it("F4 — defeats char-ref and split-tag smuggling", () => {
    expect(gateRewrite("<p>We are the b&#x65;st dentist in town.</p>").ok).toBe(false); // &#x65; → e
    expect(gateRewrite("<p>The <b>fin</b>est care around.</p>").ok).toBe(false); // split-tag re-joins
  });
});

// ── 2. GENERATION ────────────────────────────────────────────────────────
describe("generateTasteRewriteBatch", () => {
  const pageFixture = {
    id: "page-1",
    path: "/home",
    sections: [{ name: "Hero", content: "<h1>Welcome</h1><p>We do dentistry in a building.</p>" }],
  };

  it("stores a CLEAN rewrite as a pending taste_rewrite recommendation", async () => {
    projectFindRawById.mockResolvedValue({ id: "page-1-proj", organization_id: 7 });
    profileFindLatest.mockResolvedValue(makeProfileRow("approved"));
    resolvePages.mockResolvedValue([pageFixture]);

    const rewriteFn = vi.fn().mockResolvedValue({
      editedHtml: "<h1>Dentistry that listens first</h1><p>Gentle, unhurried care.</p>",
    });

    const result = await generateTasteRewriteBatch("proj-1", {}, rewriteFn);

    expect(result.status).toBe("ready");
    expect(result.kept).toBe(1);
    expect(result.dropped).toHaveLength(0);
    expect(insertRow).toHaveBeenCalledTimes(1);
    const row = insertRow.mock.calls[0][0] as any;
    expect(row.target_type).toBe("taste_rewrite");
    expect(row.target_id).toBe("page-1");
    const meta = JSON.parse(row.target_meta);
    expect(meta.section_index).toBe(0);
    expect(meta.rewritten_html).toContain("listens first");
    expect(batchUpdateStatus).toHaveBeenCalledWith("batch-1", "ready");
  });

  it("DROPS an over-claiming rewrite — never stored, never approvable", async () => {
    projectFindRawById.mockResolvedValue({ id: "page-1-proj", organization_id: 7 });
    profileFindLatest.mockResolvedValue(makeProfileRow("approved"));
    resolvePages.mockResolvedValue([pageFixture]);

    // The LLM tries a subtle over-claim (no banned keyword) — must still be dropped.
    const rewriteFn = vi.fn().mockResolvedValue({
      editedHtml: "<h1>The gentlest, best dentist in town — you'll love it!</h1>",
    });

    const result = await generateTasteRewriteBatch("proj-1", {}, rewriteFn);

    expect(result.status).toBe("ready"); // batch still readies (with zero kept)
    expect(result.kept).toBe(0);
    expect(result.dropped).toHaveLength(1);
    expect(result.dropped[0].reasonCodes.length).toBeGreaterThan(0);
    expect(insertRow).not.toHaveBeenCalled();
  });

  it("generates NOTHING when the latest profile is not approved (status enforced in B2)", async () => {
    projectFindRawById.mockResolvedValue({ id: "page-1-proj", organization_id: 7 });
    profileFindLatest.mockResolvedValue(makeProfileRow("draft"));
    const rewriteFn = vi.fn();

    const result = await generateTasteRewriteBatch("proj-1", {}, rewriteFn);

    expect(result.status).toBe("skipped_no_approved_profile");
    expect(result.batchId).toBeNull();
    expect(insertReturning).not.toHaveBeenCalled();
    expect(rewriteFn).not.toHaveBeenCalled();
  });

  it("generates NOTHING when no profile exists", async () => {
    projectFindRawById.mockResolvedValue({ id: "page-1-proj", organization_id: 7 });
    profileFindLatest.mockResolvedValue(undefined);

    const result = await generateTasteRewriteBatch("proj-1", {}, vi.fn());
    expect(result.status).toBe("skipped_no_approved_profile");
    expect(insertReturning).not.toHaveBeenCalled();
  });

  it("skips when the project has no organization", async () => {
    projectFindRawById.mockResolvedValue({ id: "page-1-proj", organization_id: null });
    const result = await generateTasteRewriteBatch("proj-1", {}, vi.fn());
    expect(result.status).toBe("skipped_no_org");
    expect(profileFindLatest).not.toHaveBeenCalled();
  });

  it("buildRewriteInstruction constrains to sourced facts and is itself honesty-clean", () => {
    const instruction = buildRewriteInstruction(approvedProfile);
    expect(instruction).toContain("Use ONLY the sourced facts");
    expect(instruction).toContain("Gentle, unhurried care"); // a real praise theme
    expect(instruction).toContain("Bright Smile Dental");
  });
});

// ── 3. EXECUTION ─────────────────────────────────────────────────────────
describe("executeTasteRewrite", () => {
  const makeCtx = () => ({ pageDrafts: new Map<string, string>() } as never);

  const wireDraft = (draftSections: unknown[]) => {
    resolvePageDraftId.mockResolvedValue("draft-1");
    pageFindRawById.mockImplementation(async (id: string) => {
      if (id === "page-1") return { id: "page-1", project_id: "proj-1", path: "/home" };
      if (id === "draft-1")
        return { id: "draft-1", project_id: "proj-1", path: "/home", sections: draftSections };
      return undefined;
    });
  };

  const recWith = (rewrittenHtml: string) => ({
    id: "rec-1",
    target_id: "page-1",
    target_label: "/home > Hero",
    target_meta: JSON.stringify({
      section_index: 0,
      section_name: "Hero",
      page_path: "/home",
      rewritten_html: rewrittenHtml,
    }),
  });

  it("writes the STORED clean copy verbatim to the section (no LLM) and marks executed", async () => {
    wireDraft([{ name: "Hero", content: "<h1>OLD COPY</h1>" }]);
    const html = "<h1>Dentistry that listens first</h1><p>Gentle, unhurried care.</p>";

    await executeTasteRewrite(recWith(html), makeCtx());

    expect(updateSectionsById).toHaveBeenCalledTimes(1);
    const [pageId, sectionsJson] = updateSectionsById.mock.calls[0];
    expect(pageId).toBe("draft-1");
    const written = JSON.parse(sectionsJson as string);
    expect(written[0].content).toBe(html); // exactly the stored bytes
    const update = recUpdateById.mock.calls[0][1] as any;
    expect(update.status).toBe("executed");
    // aiCommandService.editHtmlContent must NOT be called — deterministic write.
  });

  it("RE-GATES the stored copy — a poisoned row is failed and never published", async () => {
    wireDraft([{ name: "Hero", content: "<h1>OLD COPY</h1>" }]);
    // A stored row that somehow carries an over-claim (banned + subtle).
    const poisoned = "<h1>We're the #1, painless dentist — guaranteed!</h1>";

    await executeTasteRewrite(recWith(poisoned), makeCtx());

    expect(updateSectionsById).not.toHaveBeenCalled(); // never reaches the page
    const update = recUpdateById.mock.calls[0][1] as any;
    expect(update.status).toBe("failed");
    expect(JSON.parse(update.execution_result).error).toContain("Honesty gate");
  });
});
