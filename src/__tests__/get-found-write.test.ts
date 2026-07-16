import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Alloro Funnel Engine — Slice 1b (get-found WRITE path) proofs. Locks the
 * behaviors the spec's Test section requires for 1b:
 *   - the new `page_seo_schema` handler writes `seo_data.schema_json` (merged),
 *   - the honesty gate blocks a rank/placement claim before any write,
 *   - the wiring builds a PENDING (human-gated) recommendation of the new type,
 *   - the approved schema is confirmed LIVE after publish, and a write that did
 *     not reach the published page is failed rather than reported as a success.
 *
 * Version-reversibility of the seo_data write is proven separately against the
 * real DB (rolled-back transaction) — the write lands on the batch's pinned
 * draft, which the batch auto-publishes, retiring the prior version (with its
 * seo_data) as restorable history.
 */

vi.mock("../models/website-builder/PageModel", () => ({
  PageModel: {
    findRawById: vi.fn(),
    updateSeoDataById: vi.fn(async () => 1),
    findRawByProjectPathStatus: vi.fn(),
  },
}));

vi.mock("../models/website-builder/AiCommandRecommendationModel", () => ({
  AiCommandRecommendationModel: {
    updateById: vi.fn(async () => 1),
    insertRow: vi.fn(async () => undefined),
    findByBatchId: vi.fn(async () => []),
  },
}));

// The verify pass imports these; mocked so the suite never reaches a real DB.
vi.mock("../models/website-builder/ProjectModel", () => ({
  ProjectModel: { findRawById: vi.fn() },
}));
vi.mock("../models/website-builder/PostModel", () => ({
  PostModel: { findRawById: vi.fn() },
}));

vi.mock("../controllers/admin-websites/feature-utils/util.ai-command-shared", () => ({
  resolvePageDraftId: vi.fn(async () => "draft-1"),
}));

import { PageModel } from "../models/website-builder/PageModel";
import { AiCommandRecommendationModel } from "../models/website-builder/AiCommandRecommendationModel";
import { executeUpdatePageSeoSchema, collectSchemaCopy } from "../controllers/admin-websites/feature-services/service.ai-command-seo-schema-handler";
import {
  buildSeoSchemaRecommendationRow,
  SEO_SCHEMA_TARGET_TYPE,
} from "../controllers/admin-websites/feature-services/service.get-found-write";
import {
  publishedSchemaContains,
  schemaEntryMatches,
  verifyBatchEdits,
} from "../controllers/admin-websites/feature-utils/util.ai-command-verify";

const NEW_SCHEMA = [
  {
    "@type": "Dentist",
    name: "Bright Smiles Dental",
    description: "Family dental care in Austin, TX.",
  },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx = () => ({ pageDrafts: new Map() }) as any;

function seedStore(): Map<string, Record<string, unknown>> {
  const store = new Map<string, Record<string, unknown>>();
  store.set("page-1", { id: "page-1", project_id: "p", path: "/x" });
  store.set("draft-1", { id: "draft-1", project_id: "p", path: "/x", status: "draft", seo_data: JSON.stringify({ meta_title: "keep-me" }) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (PageModel.findRawById as any).mockImplementation(async (id: string) => store.get(id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (PageModel.updateSeoDataById as any).mockImplementation(async (id: string, val: string) => {
    store.get(id)!.seo_data = val;
    return 1;
  });
  return store;
}

const parseSeo = (v: unknown) => (v == null ? null : typeof v === "string" ? JSON.parse(v) : v);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeUpdatePageSeoSchema — schema write handler", () => {
  it("writes seo_data.schema_json as an ARRAY (merged with existing seo_data) and marks executed", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      { id: "r1", target_id: "page-1", target_meta: JSON.stringify({ schema_json: NEW_SCHEMA }) },
      ctx(),
    );
    const written = parseSeo(store.get("draft-1")!.seo_data);
    expect(Array.isArray(written.schema_json)).toBe(true);
    expect(written.schema_json[0].name).toBe(NEW_SCHEMA[0].name);
    expect(written.meta_title).toBe("keep-me"); // sibling seo_data key preserved
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "executed" }),
    );
  });

  it("fails a non-array (bare object) schema_json and writes nothing", async () => {
    seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "r1b",
        target_id: "page-1",
        target_meta: JSON.stringify({ schema_json: { "@type": "Dentist", name: "Bright Smiles Dental" } }),
      },
      ctx(),
    );
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "r1b",
      expect.objectContaining({ status: "failed" }),
    );
    expect(PageModel.updateSeoDataById).not.toHaveBeenCalled();
  });

  // `name` IS scanned (see the rank-claim-in-name case below), but a medical/
  // outcome-only match does not block an identifier: a practice legitimately
  // named "Pain-Free Dental Studio" is stating its name, not a claim Alloro makes.
  it("SUCCEEDS when an identifier `name` looks like a claim but descriptive fields are clean", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "r1c",
        target_id: "page-1",
        target_meta: JSON.stringify({
          schema_json: [
            { "@type": "Dentist", name: "Pain-Free Dental Studio", description: "Family dental care in Austin, TX." },
          ],
        }),
      },
      ctx(),
    );
    const written = parseSeo(store.get("draft-1")!.seo_data);
    expect(Array.isArray(written.schema_json)).toBe(true);
    expect(written.schema_json[0].name).toBe("Pain-Free Dental Studio");
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "r1c",
      expect.objectContaining({ status: "executed" }),
    );
  });

  it("blocks a rank/placement claim in a descriptive field and writes nothing", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "r2",
        target_id: "page-1",
        target_meta: JSON.stringify({ schema_json: [{ "@type": "Dentist", name: "X", description: "We will get you to rank #1 on Google." }] }),
      },
      ctx(),
    );
    expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toBeUndefined();
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "r2",
      expect.objectContaining({ status: "failed" }),
    );
    expect(PageModel.updateSeoDataById).not.toHaveBeenCalled();
  });

  it("fails a recommendation with no schema_json and writes nothing", async () => {
    seedStore();
    await executeUpdatePageSeoSchema(
      { id: "r3", target_id: "page-1", target_meta: JSON.stringify({}) },
      ctx(),
    );
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "r3",
      expect.objectContaining({ status: "failed" }),
    );
    expect(PageModel.updateSeoDataById).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// §5.2 — every array MEMBER must be a JSON-LD object, not just "some array".
// Consumers dereference entries as objects, so a null/scalar/nested-array member
// crashes the reader downstream. It must never reach the write.
// ---------------------------------------------------------------------------

describe("executeUpdatePageSeoSchema — schema_json member validation", () => {
  const invalidSchemas: Record<string, unknown> = {
    "a null member": [null],
    "a string member": ["text"],
    "a number member": [123],
    "a boolean member": [true],
    "a nested array member": [[{ "@type": "Dentist" }]],
    "a valid object followed by a null": [{ "@type": "Dentist", name: "Ok" }, null],
    "a valid object followed by a scalar": [{ "@type": "Dentist", name: "Ok" }, "text"],
    "an empty array": [],
  };

  for (const [label, schemaJson] of Object.entries(invalidSchemas)) {
    it(`fails ${label} and writes nothing`, async () => {
      const store = seedStore();
      await executeUpdatePageSeoSchema(
        {
          id: `bad-${label}`,
          target_id: "page-1",
          target_meta: JSON.stringify({ schema_json: schemaJson }),
        },
        ctx(),
      );
      expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toBeUndefined();
      expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        `bad-${label}`,
        expect.objectContaining({ status: "failed" }),
      );
      expect(PageModel.updateSeoDataById).not.toHaveBeenCalled();
    });
  }

  it("still accepts an array of several valid JSON-LD objects", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "ok-multi",
        target_id: "page-1",
        target_meta: JSON.stringify({
          schema_json: [{ "@type": "Dentist", name: "Bright Smiles" }, { "@type": "WebSite" }],
        }),
      },
      ctx(),
    );
    expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toHaveLength(2);
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "ok-multi",
      expect.objectContaining({ status: "executed" }),
    );
  });
});

// ---------------------------------------------------------------------------
// §5.2 — the honesty gate scans by default. A claim parked on a key the old
// allowlist never enumerated must not reach the published schema.
// ---------------------------------------------------------------------------

describe("executeUpdatePageSeoSchema — honesty gate scans non-enumerated keys", () => {
  const blockedCases: Record<string, Record<string, unknown>> = {
    "serviceType": { "@type": "Service", serviceType: "Rank #1 dental implants" },
    "an unenumerated award key": { "@type": "Dentist", award: "Guaranteed first page of Google" },
    "a nested offer description": {
      "@type": "Dentist",
      makesOffer: { "@type": "Offer", description: "We will rank your practice higher on Google." },
    },
    "an identifier `name` carrying a rank claim": { "@type": "Dentist", name: "Rank #1 Dental Implants" },
  };

  for (const [label, entry] of Object.entries(blockedCases)) {
    it(`BLOCKS a rank claim in ${label} and writes nothing`, async () => {
      const store = seedStore();
      await executeUpdatePageSeoSchema(
        {
          id: `blk-${label}`,
          target_id: "page-1",
          target_meta: JSON.stringify({ schema_json: [entry] }),
        },
        ctx(),
      );
      expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toBeUndefined();
      expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        `blk-${label}`,
        expect.objectContaining({ status: "failed" }),
      );
      expect(PageModel.updateSeoDataById).not.toHaveBeenCalled();
    });
  }

  it("does NOT block an honest serviceType", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "ok-st",
        target_id: "page-1",
        target_meta: JSON.stringify({
          schema_json: [{ "@type": "Service", serviceType: "Dental implants", description: "Same-day implants in Austin, TX." }],
        }),
      },
      ctx(),
    );
    expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toHaveLength(1);
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "ok-st",
      expect.objectContaining({ status: "executed" }),
    );
  });

  it("does NOT block a URL that happens to contain claim-like tokens", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "ok-url",
        target_id: "page-1",
        target_meta: JSON.stringify({
          schema_json: [{ "@type": "Dentist", url: "https://example.com/rank-1-dental-implants" }],
        }),
      },
      ctx(),
    );
    expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toHaveLength(1);
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "ok-url",
      expect.objectContaining({ status: "executed" }),
    );
  });
});

// ---------------------------------------------------------------------------
// §5.2 — the exclusion axis is the VALUE, not the key. A key name is
// caller-supplied input: every key the gate may skip must still block a claim
// SENTENCE parked under it. One regression per excluded key — the whole class,
// not the two keys the review happened to name.
// ---------------------------------------------------------------------------

describe("honesty gate — a claim under a structural KEY is still blocked", () => {
  const CLAIM = "We guarantee first page placement on Google";
  // Every key in the handler's structural-shape table, plus `identifier` (which
  // that table deliberately omits). A claim sentence is not a URL / phone /
  // token, so none of these may earn a skip.
  const structuralKeys = [
    "@context",
    "@id",
    "@type",
    "identifier",
    "url",
    "sameAs",
    "image",
    "logo",
    "telephone",
    "faxNumber",
    "email",
  ];

  for (const key of structuralKeys) {
    it(`BLOCKS a claim sentence in \`${key}\` and writes nothing`, async () => {
      const store = seedStore();
      await executeUpdatePageSeoSchema(
        {
          id: `struct-${key}`,
          target_id: "page-1",
          target_meta: JSON.stringify({ schema_json: [{ "@type": "Dentist", [key]: CLAIM }] }),
        },
        ctx(),
      );
      expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toBeUndefined();
      expect(AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        `struct-${key}`,
        expect.objectContaining({ status: "failed" }),
      );
      expect(PageModel.updateSeoDataById).not.toHaveBeenCalled();
    });
  }

  it("BLOCKS a claim smuggled inside a `sameAs` ARRAY member", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "same-as-arr",
        target_id: "page-1",
        target_meta: JSON.stringify({
          schema_json: [{ "@type": "Dentist", sameAs: ["https://facebook.com/x", CLAIM] }],
        }),
      },
      ctx(),
    );
    expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toBeUndefined();
    expect(PageModel.updateSeoDataById).not.toHaveBeenCalled();
  });

  it("still PUBLISHES a full, honest LocalBusiness schema — no false positives", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "honest-full",
        target_id: "page-1",
        target_meta: JSON.stringify({
          schema_json: [
            {
              "@context": "https://schema.org",
              "@type": "Dentist",
              "@id": "https://painfreedental.com/#dentist",
              name: "Pain-Free Dental Studio",
              url: "https://painfreedental.com",
              telephone: "+1 (512) 555-0100 ext. 42",
              faxNumber: "512-555-0101",
              email: "hello@painfreedental.com",
              logo: "https://painfreedental.com/logo.png",
              sameAs: ["https://facebook.com/pfds"],
              identifier: "NPI-1234567890",
              description: "Gentle family dentistry in Austin, TX.",
            },
          ],
        }),
      },
      ctx(),
    );
    expect(parseSeo(store.get("draft-1")!.seo_data).schema_json).toHaveLength(1);
    expect(AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
      "honest-full",
      expect.objectContaining({ status: "executed" }),
    );
  });
});

// ---------------------------------------------------------------------------
// The identity carve-out is value-shaped too. Both directions stay locked: a
// real practice name publishes; a claim wearing `name`'s key does not.
// ---------------------------------------------------------------------------

describe("honesty gate — identity carve-out is bounded by NAME shape", () => {
  const cases: Array<[string, Record<string, unknown>, "executed" | "failed"]> = [
    ["a real practice name", { "@type": "Dentist", name: "Pain-Free Dental Studio" }, "executed"],
    ["a short legalName carrying an outcome word", { "@type": "Dentist", legalName: "Cure Dental Group" }, "executed"],
    ["a rank claim in `name`", { "@type": "Dentist", name: "Rank #1 Dental Implants" }, "failed"],
    // The carve-out's own bypass: a medical/outcome SENTENCE under an identity
    // key was softened on the key alone and published.
    ["an outcome SENTENCE in `name`", { "@type": "Dentist", name: "We cure gum disease permanently" }, "failed"],
    ["an outcome SENTENCE in `alternateName`", { "@type": "Dentist", alternateName: "We guarantee a cure for gum disease" }, "failed"],
    ["an outcome claim addressed to the reader", { "@type": "Dentist", name: "Cure your gum disease permanently" }, "failed"],
    // A PROMISE is never softened, wherever it sits. Found by an adversary run
    // against the value-shape fix: these are short and pronoun-free, so the
    // name-shape rule alone called them names and published them.
    ["a guarantee wearing a name's key", { "@type": "Dentist", name: "Guaranteed Cure Dental" }, "failed"],
    ["a guarantee in a longer name", { "@type": "Dentist", name: "Guaranteed Cure For Gum Disease" }, "failed"],
    ["a guarantee in `alternateName`", { "@type": "Dentist", alternateName: "Pain-Free Guarantee Dentistry" }, "failed"],
    ["a slogan shaped like a name", { "@type": "Dentist", name: "Guaranteed Cure. Permanent Results." }, "failed"],
    ["a guarantee carried in a `name` ARRAY", { "@type": "Dentist", name: ["Guaranteed Cure Dental"] }, "failed"],
    // The nastiest: hyphens defeat the \s+ in every rank pattern, leaving only
    // the medical code — which the carve-out would then soften, laundering a
    // RANK claim through the MEDICAL carve-out.
    ["a rank claim laundered through the medical carve-out", { "@type": "Dentist", name: "Rank-#1-On-Google-Guaranteed-Or-Free" }, "failed"],
  ];

  for (const [label, entry, expected] of cases) {
    it(`${expected === "failed" ? "BLOCKS" : "PUBLISHES"} ${label}`, async () => {
      const store = seedStore();
      await executeUpdatePageSeoSchema(
        { id: `id-${label}`, target_id: "page-1", target_meta: JSON.stringify({ schema_json: [entry] }) },
        ctx(),
      );
      expect(AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(
        `id-${label}`,
        expect.objectContaining({ status: expected }),
      );
      const written = parseSeo(store.get("draft-1")!.seo_data).schema_json;
      if (expected === "failed") expect(written).toBeUndefined();
      else expect(written).toHaveLength(1);
    });
  }
});

describe("collectSchemaCopy — honesty-gate input selection", () => {
  const values = (value: unknown) => collectSchemaCopy(value).map((entry) => entry.value);

  it("collects claim-bearing text by DEFAULT, skipping only structural keys and URL values", () => {
    const copy = values({
      "@type": "Dentist",
      "@id": "https://example.com/#dentist",
      name: "Bright Smiles",
      url: "https://example.com",
      telephone: "+1-512-555-0100",
      email: "hello@example.com",
      logo: "https://example.com/logo.png",
      description: "Gentle family dentistry.",
      serviceType: "Dental implants",
      areaServed: { "@type": "City", name: "Austin" },
    });
    expect(copy).toContain("Gentle family dentistry.");
    expect(copy).toContain("Dental implants"); // `serviceType` — an allowlist missed this entirely
    expect(copy).toContain("Bright Smiles"); // identifiers ARE scanned; the gate softens them, not the collector
    expect(copy).toContain("Austin");
    expect(copy).not.toContain("Dentist"); // @type
    expect(copy).not.toContain("https://example.com/#dentist"); // @id
    expect(copy).not.toContain("https://example.com"); // url
    expect(copy).not.toContain("https://example.com/logo.png"); // logo
    expect(copy).not.toContain("+1-512-555-0100"); // telephone
    expect(copy).not.toContain("hello@example.com"); // email
  });

  it("collects a key nobody enumerated — the allowlist bypass this closes", () => {
    expect(values({ "@type": "Service", award: "Best of Austin 2026" })).toContain(
      "Best of Austin 2026",
    );
  });

  it("tags each collected string with its key so the gate can soften identifiers", () => {
    expect(collectSchemaCopy({ "@type": "Service", serviceType: "Dental implants" })).toEqual([
      { key: "serviceType", value: "Dental implants" },
    ]);
  });
});

describe("buildSeoSchemaRecommendationRow — human-approved wiring", () => {
  it("builds a PENDING recommendation of the new target_type carrying schema_json", () => {
    const row = buildSeoSchemaRecommendationRow({
      batchId: "b1",
      pageId: "pg1",
      pagePath: "/services",
      schemaJson: NEW_SCHEMA,
      recommendation: "Add complete structured data.",
      sortOrder: 3,
    });
    expect(SEO_SCHEMA_TARGET_TYPE).toBe("page_seo_schema");
    expect(row.target_type).toBe(SEO_SCHEMA_TARGET_TYPE);
    expect(row.target_id).toBe("pg1");
    const meta = JSON.parse(row.target_meta as string);
    expect(Array.isArray(meta.schema_json)).toBe(true);
    expect(meta.schema_json[0].name).toBe(NEW_SCHEMA[0].name);
    expect(meta.page_path).toBe("/services");
    // No status set -> DB default 'pending'; not pre-approved. executeBatch only
    // runs status='approved' rows, so a human must approve first (no new autonomy).
    expect("status" in row).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §3.2 — the approved schema must be confirmed LIVE before it counts as success
// ---------------------------------------------------------------------------

describe("schema containment helpers", () => {
  it("matches an approved entry that the published copy carries verbatim", () => {
    expect(schemaEntryMatches(NEW_SCHEMA[0], { ...NEW_SCHEMA[0] })).toBe(true);
  });

  it("tolerates EXTRA published keys but not a changed or missing one", () => {
    expect(schemaEntryMatches(NEW_SCHEMA[0], { ...NEW_SCHEMA[0], extra: "ok" })).toBe(true);
    expect(schemaEntryMatches(NEW_SCHEMA[0], { ...NEW_SCHEMA[0], name: "Other" })).toBe(false);
    expect(schemaEntryMatches(NEW_SCHEMA[0], { "@type": "Dentist" })).toBe(false);
  });

  it("finds the approved entry regardless of published array order", () => {
    expect(publishedSchemaContains(NEW_SCHEMA, [{ "@type": "WebSite" }, NEW_SCHEMA[0]])).toBe(true);
  });

  it("is false when the published schema is absent or not an array", () => {
    expect(publishedSchemaContains(NEW_SCHEMA, undefined)).toBe(false);
    expect(publishedSchemaContains(NEW_SCHEMA, NEW_SCHEMA[0])).toBe(false);
    expect(publishedSchemaContains(NEW_SCHEMA, [])).toBe(false);
  });
});

describe("verifyBatchEdits — page_seo_schema is verified against the live page", () => {
  const schemaRec = {
    id: "rec-1",
    target_type: "page_seo_schema",
    target_id: "page-1",
    target_label: "/x > structured data",
    target_meta: JSON.stringify({ page_path: "/x", schema_json: NEW_SCHEMA }),
    execution_result: JSON.stringify({ success: true, schema_written: true }),
  };

  beforeEach(() => {
    vi.mocked(AiCommandRecommendationModel.findByBatchId).mockResolvedValue([schemaRec] as never);
    vi.mocked(AiCommandRecommendationModel.updateById).mockClear();
    vi.mocked(PageModel.findRawById).mockResolvedValue({
      id: "page-1",
      project_id: "p",
      path: "/x",
    } as never);
  });

  it("verifies the recommendation when the approved schema is live", async () => {
    vi.mocked(PageModel.findRawByProjectPathStatus).mockResolvedValue({
      id: "pub-1",
      seo_data: JSON.stringify({ meta_title: "keep-me", schema_json: NEW_SCHEMA }),
    } as never);

    const result = await verifyBatchEdits("b1");

    expect(result).toEqual({ verified: 1, downgraded: 0 });
    expect(AiCommandRecommendationModel.updateById).not.toHaveBeenCalled();
  });

  it("FAILS the recommendation when the published schema lacks the approved entry", async () => {
    vi.mocked(PageModel.findRawByProjectPathStatus).mockResolvedValue({
      id: "pub-1",
      seo_data: JSON.stringify({ schema_json: [{ "@type": "WebSite", name: "stale" }] }),
    } as never);

    const result = await verifyBatchEdits("b1");

    expect(result).toEqual({ verified: 0, downgraded: 1 });
    const [, patch] = vi.mocked(AiCommandRecommendationModel.updateById).mock.calls[0];
    expect(patch.status).toBe("failed");
    const stored = JSON.parse(patch.execution_result as string);
    expect(stored.success).toBe(false);
    expect(stored.schema_written).toBe(false);
    expect(stored.verify_reason).toMatch(/does not contain the approved schema/);
  });

  it("FAILS the recommendation when the page never published (no live row)", async () => {
    vi.mocked(PageModel.findRawByProjectPathStatus).mockResolvedValue(undefined as never);

    const result = await verifyBatchEdits("b1");

    expect(result).toEqual({ verified: 0, downgraded: 1 });
    const [, patch] = vi.mocked(AiCommandRecommendationModel.updateById).mock.calls[0];
    expect(patch.status).toBe("failed");
    expect(JSON.parse(patch.execution_result as string).verify_reason).toMatch(/not live/);
  });

  it("FAILS rather than reporting success when the live schema cannot be read", async () => {
    vi.mocked(PageModel.findRawByProjectPathStatus).mockRejectedValue(
      new Error("connection lost") as never
    );

    const result = await verifyBatchEdits("b1");

    expect(result).toEqual({ verified: 0, downgraded: 1 });
    const [, patch] = vi.mocked(AiCommandRecommendationModel.updateById).mock.calls[0];
    expect(patch.status).toBe("failed");
    expect(JSON.parse(patch.execution_result as string).verify_reason).toMatch(/connection lost/);
  });
});
