import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Alloro Funnel Engine — Slice 1b (get-found WRITE path) proofs. Locks the
 * behaviors the spec's Test section requires for 1b:
 *   - the new `page_seo_schema` handler writes `seo_data.schema_json` (merged),
 *   - the honesty gate blocks a rank/placement claim before any write,
 *   - the wiring builds a PENDING (human-gated) recommendation of the new type.
 *
 * Version-reversibility of the seo_data write is proven separately against the
 * real DB (rolled-back transaction) — the write lands on the batch's pinned
 * draft, which the batch auto-publishes, retiring the prior version (with its
 * seo_data) as restorable history.
 *
 * NOTE: the repo's vitest currently fails to start with ERR_REQUIRE_ESM
 * (pre-existing, tracked). This file compiles under `tsc --noEmit` and mirrors a
 * tsx proof that was executed and passed; it runs once the ESM issue is fixed.
 */

vi.mock("../models/website-builder/PageModel", () => ({
  PageModel: {
    findRawById: vi.fn(),
    updateSeoDataById: vi.fn(async () => 1),
  },
}));

vi.mock("../models/website-builder/AiCommandRecommendationModel", () => ({
  AiCommandRecommendationModel: {
    updateById: vi.fn(async () => 1),
    insertRow: vi.fn(async () => undefined),
  },
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

const NEW_SCHEMA = {
  "@type": "Dentist",
  name: "Bright Smiles Dental",
  description: "Family dental care in Austin, TX.",
};

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
  it("writes seo_data.schema_json (merged with existing seo_data) and marks executed", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      { id: "r1", target_id: "page-1", target_meta: JSON.stringify({ schema_json: NEW_SCHEMA }) },
      ctx(),
    );
    const written = parseSeo(store.get("draft-1")!.seo_data);
    expect(written.schema_json.name).toBe(NEW_SCHEMA.name);
    expect(written.meta_title).toBe("keep-me");
    expect((AiCommandRecommendationModel.updateById as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
      "r1",
      expect.objectContaining({ status: "executed" }),
    );
  });

  it("blocks a rank/placement claim in a descriptive field and writes nothing", async () => {
    const store = seedStore();
    await executeUpdatePageSeoSchema(
      {
        id: "r2",
        target_id: "page-1",
        target_meta: JSON.stringify({ schema_json: { "@type": "Dentist", name: "X", description: "We will get you to rank #1 on Google." } }),
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

describe("collectSchemaCopy — honesty-gate input selection", () => {
  it("collects only descriptive free-text values, skipping structural keys", () => {
    const copy = collectSchemaCopy({
      "@type": "Dentist",
      name: "Bright Smiles",
      url: "https://example.com",
      telephone: "+1-512-555-0100",
      description: "Gentle family dentistry.",
      areaServed: { "@type": "City", name: "Austin" },
    });
    expect(copy).toContain("Bright Smiles");
    expect(copy).toContain("Gentle family dentistry.");
    expect(copy).toContain("Austin"); // nested descriptive `name`
    expect(copy).not.toContain("https://example.com");
    expect(copy).not.toContain("+1-512-555-0100");
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
    expect(meta.schema_json.name).toBe(NEW_SCHEMA.name);
    expect(meta.page_path).toBe("/services");
    // No status set -> DB default 'pending'; not pre-approved. executeBatch only
    // runs status='approved' rows, so a human must approve first (no new autonomy).
    expect("status" in row).toBe(false);
  });
});
