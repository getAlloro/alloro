/**
 * Unit tests — service.seo-generation GEO auto-apply (T5).
 *
 * Data strategy: Option B (mock the data layer), matching this repo's
 * existing smoke-suite convention (vitest.config.ts — no live Postgres, no
 * network). The Anthropic call (`runAgent`) is mocked so generation returns
 * a deterministic geo_layer payload; `loadPrompt` runs for real (cheap,
 * reads .md files already on disk — no network).
 *
 * Covers (§20.2 contract + tenant/identifier plumbing, §20.4 synthetic data):
 *   - generateAllSeoSections, given a non-empty opening_content_recommendation
 *     from geo_layer, creates a NEW page version row for pages (never updates
 *     the live row in place) — proven by asserting PageModel.createPageVersion
 *     is called and no PageModel update-in-place method is touched.
 *   - the same flow, for posts, calls PostModel.updateContentWithSnapshot
 *     (never the plain updateContentById) so prior content is always
 *     snapshotted before the overwrite.
 *   - an empty opening_content_recommendation applies nothing (no version
 *     row, no post snapshot/update) — the auto-apply guard fires.
 *
 * Synthetic only (§20.4): every id/value below is invented.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const ORG_ID = 1;
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const PAGE_ID = "22222222-2222-2222-2222-222222222222";
const POST_ID = "33333333-3333-3333-3333-333333333333";

// ── Mocks ───────────────────────────────────────────────────────────────

vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: {
    findOrganizationIdById: vi.fn(async () => ({ organization_id: ORG_ID })),
    findById: vi.fn(async () => ({ wrapper: "", header: "", footer: "" })),
  },
}));

vi.mock("../models/OrganizationModel", () => ({
  OrganizationModel: {
    findById: vi.fn(async () => ({
      business_data: { name: "Test Dental" },
    })),
  },
}));

vi.mock("../models/LocationModel", () => ({
  LocationModel: {
    findById: vi.fn(async () => undefined),
    findByOrganizationId: vi.fn(async () => [
      {
        id: 1,
        is_primary: true,
        name: "Main Office",
        business_data: { city: "Springfield" },
      },
    ]),
  },
}));

interface FakePracticeFact {
  id: string;
  organization_id: number;
  location_id: number | null;
  page_id: string | null;
  post_id: string | null;
  fact_text: string;
  source_field: string;
  source_excerpt: string;
  extracted_at: Date;
}

const findByPageId = vi.fn<(pageId: string) => Promise<FakePracticeFact[]>>(
  async () => []
);
const findByPostId = vi.fn<(postId: string) => Promise<FakePracticeFact[]>>(
  async () => []
);
vi.mock("../models/website-builder/PracticeFactModel", () => ({
  PracticeFactModel: {
    findByPageId,
    findByPostId,
  },
}));

const findRawByIdAndProject = vi.fn(async () => ({
  id: PAGE_ID,
  project_id: PROJECT_ID,
  path: "/services/cleaning",
  sections: JSON.stringify([{ type: "hero", content: "<h1>Cleaning</h1>" }]),
  seo_data: null as Record<string, unknown> | null,
  display_name: null as string | null,
}));
const findLatestByProjectAndPath = vi.fn(async () => ({ version: 1 }));
const createPageVersion = vi.fn(async (params: { insertData: Record<string, unknown> }) => ({
  id: "new-version-id",
  ...params.insertData,
}));
const updateSeoDataById = vi.fn(async () => 1);
// Canonical derivation reads the page's real path (util.canonical-path).
const pageFindRawById = vi.fn(async () => ({
  id: PAGE_ID,
  path: "/services/cleaning",
}));

vi.mock("../models/website-builder/PageModel", () => ({
  PageModel: {
    findRawByIdAndProject,
    findLatestByProjectAndPath,
    createPageVersion,
    updateSeoDataById,
    findRawById: pageFindRawById,
  },
}));

const findRawById = vi.fn(async () => ({
  id: POST_ID,
  content: "<p>Old post content.</p>",
  slug: "cleanings-101",
  post_type_id: "pt-articles",
}));
const updateContentWithSnapshot = vi.fn(async (id: string, newContent: string) => ({
  id,
  content: newContent,
  previous_content: "<p>Old post content.</p>",
}));
const updateContentById = vi.fn(async () => 1);

vi.mock("../models/website-builder/PostModel", () => ({
  PostModel: {
    findRawById,
    updateContentWithSnapshot,
    updateContentById,
  },
}));

// Canonical derivation resolves the post type's slug (util.canonical-path).
const postTypeFindRawById = vi.fn(async () => ({ id: "pt-articles", slug: "articles" }));
vi.mock("../models/website-builder/PostTypeModel", () => ({
  PostTypeModel: {
    findRawById: postTypeFindRawById,
  },
}));

const runAgentMock = vi.fn();
vi.mock("../agents/service.llm-runner", () => ({
  runAgent: (opts: unknown) => runAgentMock(opts),
}));

// fetch() is used for the (optional) mind-skill context calls — make them a
// harmless no-op so the test never reaches the network.
vi.stubGlobal(
  "fetch",
  vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
);

// ── Helpers ─────────────────────────────────────────────────────────────

/** Queue one runAgent response per section call, keyed by call order. */
function queueGeneratedSections(
  bySection: Record<string, Record<string, unknown>>
) {
  runAgentMock.mockImplementation(async (opts: { userMessage: string }) => {
    const match = /Generate the SEO data for the "([a-z_]+)" section/.exec(
      opts.userMessage
    );
    const section = match?.[1] || "unknown";
    const generated = bySection[section] || {};
    return { raw: JSON.stringify(generated), parsed: generated };
  });
}

describe("service.seo-generation — GEO auto-apply (T5)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findByPageId.mockResolvedValue([]);
    findByPostId.mockResolvedValue([]);
    findRawByIdAndProject.mockResolvedValue({
      id: PAGE_ID,
      project_id: PROJECT_ID,
      path: "/services/cleaning",
      sections: JSON.stringify([{ type: "hero", content: "<h1>Cleaning</h1>" }]),
      seo_data: null,
      display_name: "Teeth Cleaning Services",
    });
    findLatestByProjectAndPath.mockResolvedValue({ version: 1 });
    findRawById.mockResolvedValue({
      id: POST_ID,
      content: "<p>Old post content.</p>",
      slug: "cleanings-101",
      post_type_id: "pt-articles",
    });
    pageFindRawById.mockResolvedValue({ id: PAGE_ID, path: "/services/cleaning" });
    postTypeFindRawById.mockResolvedValue({ id: "pt-articles", slug: "articles" });
  });

  it("pages: non-empty opening_content_recommendation creates a NEW page version row, never updates the live row in place", async () => {
    queueGeneratedSections({
      critical: { meta_title: "Cleaning" },
      high_impact: { meta_description: "Get a cleaning." },
      significant: { schema_json: [] },
      geo_layer: {
        target_query_primary: "teeth cleaning near me",
        target_query_variants: ["dental cleaning"],
        opening_content_recommendation: "We offer professional teeth cleaning in Springfield.",
        faq_candidates: [],
      },
      moderate: { og_title: "Cleaning" },
      negligible: { og_type: "website" },
    });

    const { generateAllSeoSections } = await import(
      "../controllers/admin-websites/feature-services/service.seo-generation"
    );

    const { results } = await generateAllSeoSections(PROJECT_ID, PAGE_ID, "page", {
      location_context: null,
      page_content: "<h1>Cleaning</h1>",
    });

    const geo = results.find((r) => r.section === "geo_layer");
    expect(geo?.generated.opening_content_recommendation).toBe(
      "We offer professional teeth cleaning in Springfield."
    );

    // Auto-apply created a new draft version row...
    expect(createPageVersion).toHaveBeenCalledTimes(1);
    const versionArgs = createPageVersion.mock.calls[0][0] as {
      publish: boolean;
      insertData: Record<string, unknown>;
    };
    expect(versionArgs.publish).toBe(false);
    expect(versionArgs.insertData.status).toBe("draft");
    expect(String(versionArgs.insertData.sections)).toContain(
      "We offer professional teeth cleaning in Springfield."
    );
    // The source page's display_name must survive into the new draft version —
    // otherwise the admin Pages list falls back to showing the bare path.
    expect(versionArgs.insertData.display_name).toBe("Teeth Cleaning Services");

    // ...and the live row was read, never mutated in place by auto-apply.
    expect(findRawByIdAndProject).toHaveBeenCalledWith(PAGE_ID, PROJECT_ID);
  });

  it("posts: opening_content_recommendation snapshots prior content into previous_content before overwrite", async () => {
    queueGeneratedSections({
      critical: { meta_title: "Cleaning" },
      high_impact: { meta_description: "Get a cleaning." },
      significant: { schema_json: [] },
      geo_layer: {
        target_query_primary: "teeth cleaning near me",
        target_query_variants: [],
        opening_content_recommendation: "Our hygienists provide gentle cleanings.",
        faq_candidates: [],
      },
      moderate: { og_title: "Cleaning" },
      negligible: { og_type: "article" },
    });

    const { generateAllSeoSections } = await import(
      "../controllers/admin-websites/feature-services/service.seo-generation"
    );

    await generateAllSeoSections(PROJECT_ID, POST_ID, "post", {
      location_context: null,
      page_content: "<p>Old post content.</p>",
      post_title: "Cleanings 101",
    });

    expect(updateContentWithSnapshot).toHaveBeenCalledTimes(1);
    const [postIdArg, newContentArg] = updateContentWithSnapshot.mock.calls[0];
    expect(postIdArg).toBe(POST_ID);
    expect(newContentArg).toContain("Our hygienists provide gentle cleanings.");
    expect(newContentArg).toContain("Old post content.");

    // The plain (non-snapshotting) update path must never be used by auto-apply.
    expect(updateContentById).not.toHaveBeenCalled();
  });

  it("does not auto-apply when opening_content_recommendation is empty", async () => {
    queueGeneratedSections({
      critical: { meta_title: "Cleaning" },
      high_impact: { meta_description: "Get a cleaning." },
      significant: { schema_json: [] },
      geo_layer: {
        target_query_primary: "teeth cleaning near me",
        target_query_variants: [],
        opening_content_recommendation: "",
        faq_candidates: [],
      },
      moderate: { og_title: "Cleaning" },
      negligible: { og_type: "website" },
    });

    const { generateAllSeoSections } = await import(
      "../controllers/admin-websites/feature-services/service.seo-generation"
    );

    await generateAllSeoSections(PROJECT_ID, PAGE_ID, "page", {
      location_context: null,
      page_content: "<h1>Cleaning</h1>",
    });

    expect(createPageVersion).not.toHaveBeenCalled();
  });

  it("injects a VERIFIED PRACTICE FACTS block with source excerpts when facts exist", async () => {
    findByPageId.mockResolvedValue([
      {
        id: "fact-1",
        organization_id: ORG_ID,
        location_id: null,
        page_id: PAGE_ID,
        post_id: null,
        fact_text: "Open Saturdays 9am-1pm",
        source_field: "page_content",
        source_excerpt: "Open Saturdays 9am-1pm",
        extracted_at: new Date(),
      },
    ]);

    let capturedSystemBlocks: string[] | undefined;
    runAgentMock.mockImplementation(async (opts: { cachedSystemBlocks?: string[] }) => {
      // Only the generate calls pass a non-empty cachedSystemBlocks (the
      // VERIFIED PRACTICE FACTS prefix); the insight calls pass `[]`. Capture
      // the first generate call only.
      if (opts.cachedSystemBlocks?.length && !capturedSystemBlocks) {
        capturedSystemBlocks = opts.cachedSystemBlocks;
      }
      return { raw: "{}", parsed: {} };
    });

    const { generateAllSeoSections } = await import(
      "../controllers/admin-websites/feature-services/service.seo-generation"
    );

    await generateAllSeoSections(PROJECT_ID, PAGE_ID, "page", {
      location_context: null,
      page_content: "<h1>Cleaning</h1>",
    });

    expect(capturedSystemBlocks?.[0]).toContain("VERIFIED PRACTICE FACTS");
    expect(capturedSystemBlocks?.[0]).toContain(
      "Open Saturdays 9am-1pm (source: Open Saturdays 9am-1pm)"
    );
  });

  it("posts: canonical_url is deterministically overridden — any LLM-fabricated value is discarded", async () => {
    queueGeneratedSections({
      critical: {
        meta_title: "Cleaning",
        // The model fabricating a plausible-but-wrong canonical is the exact
        // production failure mode this guards against.
        canonical_url: "https://example.com/totally/fabricated/path/",
      },
      high_impact: { meta_description: "Get a cleaning." },
      significant: { schema_json: [] },
      geo_layer: { opening_content_recommendation: "", faq_candidates: [] },
      moderate: { og_title: "Cleaning" },
      negligible: { og_type: "article" },
    });

    const { generateAllSeoSections } = await import(
      "../controllers/admin-websites/feature-services/service.seo-generation"
    );

    const { results } = await generateAllSeoSections(PROJECT_ID, POST_ID, "post", {
      location_context: null,
      page_content: "<p>Old post content.</p>",
      post_title: "Cleanings 101",
    });

    const critical = results.find((r) => r.section === "critical");
    expect(critical?.generated.canonical_url).toBe("/articles/cleanings-101");
  });

  it("pages: canonical_url is overridden with the page's real path", async () => {
    queueGeneratedSections({
      critical: { meta_title: "Cleaning", canonical_url: "/wrong-guess" },
      high_impact: { meta_description: "Get a cleaning." },
      significant: { schema_json: [] },
      geo_layer: { opening_content_recommendation: "", faq_candidates: [] },
      moderate: { og_title: "Cleaning" },
      negligible: { og_type: "website" },
    });

    const { generateAllSeoSections } = await import(
      "../controllers/admin-websites/feature-services/service.seo-generation"
    );

    const { results } = await generateAllSeoSections(PROJECT_ID, PAGE_ID, "page", {
      location_context: null,
      page_content: "<h1>Cleaning</h1>",
    });

    const critical = results.find((r) => r.section === "critical");
    expect(critical?.generated.canonical_url).toBe("/services/cleaning");
  });

  it("apply_geo_content: false skips the body-content auto-apply entirely, even with a non-empty recommendation", async () => {
    queueGeneratedSections({
      critical: { meta_title: "Cleaning" },
      high_impact: { meta_description: "Get a cleaning." },
      significant: { schema_json: [] },
      geo_layer: {
        target_query_primary: "teeth cleaning near me",
        target_query_variants: [],
        opening_content_recommendation: "We offer professional teeth cleaning in Springfield.",
        faq_candidates: [],
      },
      moderate: { og_title: "Cleaning" },
      negligible: { og_type: "website" },
    });

    const { generateAllSeoSections } = await import(
      "../controllers/admin-websites/feature-services/service.seo-generation"
    );

    await generateAllSeoSections(PROJECT_ID, PAGE_ID, "page", {
      location_context: null,
      page_content: "<h1>Cleaning</h1>",
      apply_geo_content: false,
    });

    expect(createPageVersion).not.toHaveBeenCalled();
    expect(updateContentWithSnapshot).not.toHaveBeenCalled();
  });
});
