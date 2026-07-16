import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPromptSet } from "../services/ai-visibility/promptSetBuilder";
import { detectAppearance } from "../services/ai-visibility/appearanceDetector";
import {
  setAiVisibilityAdapters,
  getConfiguredAdapters,
} from "../services/ai-visibility/registry";
import { FakeVisibilityAdapter } from "../services/ai-visibility/adapters/geminiAdapter";
import { SerpApiAiOverviewAdapter } from "../services/ai-visibility/adapters/serpApiAdapter";
import { runAiVisibilityObservation } from "../services/ai-visibility/observationRunner";
import { AiVisibilityObservationModel } from "../models/AiVisibilityObservationModel";
import { EngineRawResult } from "../services/ai-visibility/types";

/**
 * Alloro Funnel Engine A3 (AI-Answer Visibility) proofs. Locks: the prompt set,
 * the deterministic detector (incl. the ambiguity guard on `cited`), the
 * registry's only-configured-engines-run rule, the SerpApi adapter's parse of
 * the REAL response shape, and the runner (per-engine failure isolation,
 * propagated persistence failure, honest new-vs-duplicate counts, honest
 * skipped-engine reporting).
 */

describe("buildPromptSet", () => {
  it("builds a generic + contextualized prompt for a category+city", () => {
    const set = buildPromptSet({ category: "endodontist", city: "Austin, TX" });
    expect(set).toHaveLength(2);
    expect(set.map((p) => p.kind)).toEqual(["generic", "contextualized"]);
    expect(set[0].text).toContain("endodontist");
    expect(set[0].text).toContain("Austin, TX");
  });
  it("returns empty when category or city is missing", () => {
    expect(buildPromptSet({ category: "", city: "Austin" })).toEqual([]);
    expect(buildPromptSet({ category: "dentist", city: "  " })).toEqual([]);
  });
});

describe("detectAppearance", () => {
  const identity = { name: "Bright Smiles Dental", domain: "brightsmiles.com" };

  it("mentioned=true and position set when the name appears in the answer", () => {
    const raw: EngineRawResult = {
      answerText: "Top picks:\n1. Bright Smiles Dental\n2. Other Co",
      citations: [],
      captureMethod: "api_grounded",
    };
    const d = detectAppearance(raw, identity);
    expect(d.mentioned).toBe(true);
    expect(d.position).toBe(2);
  });

  it("mentioned=false when the name does not appear", () => {
    const raw: EngineRawResult = {
      answerText: "1. Some Other Dental\n2. Third Practice",
      citations: [],
      captureMethod: "api_grounded",
    };
    expect(detectAppearance(raw, identity).mentioned).toBe(false);
  });

  it("cited=true only when the practice DOMAIN appears in the sources", () => {
    const raw: EngineRawResult = {
      answerText: "General answer.",
      citations: [
        { url: null, title: "Bright Smiles — brightsmiles.com" },
        { url: "https://yelp.com/biz/x", title: "Yelp" },
      ],
      captureMethod: "api_grounded",
    };
    const d = detectAppearance(raw, identity);
    expect(d.cited).toBe(true);
    expect(d.citedSource).toContain("brightsmiles.com");
    expect(d.mentioned).toBe(true);
  });

  it("ambiguity guard: a bare name match without the domain is NOT cited", () => {
    const raw: EngineRawResult = {
      answerText: "Bright Smiles Dental is great.",
      citations: [
        { url: "https://yelp.com/biz/x", title: "Yelp" },
        { url: "https://healthgrades.com/d/y", title: "Healthgrades" },
      ],
      captureMethod: "api_grounded",
    };
    const d = detectAppearance(raw, identity);
    expect(d.mentioned).toBe(true);
    expect(d.cited).toBe(false);
  });
});

describe("detectAppearance — anti-fabrication (adversary regressions)", () => {
  it("does NOT mark cited for a competitor lookalike domain (superstring)", () => {
    const d = detectAppearance(
      { answerText: "x", citations: [{ url: "https://bestsmiledental.com/", title: null }], captureMethod: "api_grounded" },
      { name: "Smile Dental", domain: "smiledental.com" }
    );
    expect(d.cited).toBe(false);
  });
  it("does NOT mark cited from a domain mentioned only in prose (not a citation)", () => {
    const d = detectAppearance(
      { answerText: "I recommend mysmiledental.com for cleanings.", citations: [], captureMethod: "api_grounded" },
      { name: "Smile Dental", domain: "smiledental.com" }
    );
    expect(d.cited).toBe(false);
  });
  it("does NOT mark cited for a different ccTLD host", () => {
    const d = detectAppearance(
      { answerText: "x", citations: [{ url: "https://superdental.com.au/", title: null }], captureMethod: "api_grounded" },
      { name: "X Dental", domain: "dental.com" }
    );
    expect(d.cited).toBe(false);
  });
  it("does NOT mark mentioned when only a longer competitor name appears", () => {
    const d = detectAppearance(
      { answerText: "Try Smile Dental Group, they are excellent.", citations: [], captureMethod: "api_grounded" },
      { name: "Smile Dental" }
    );
    expect(d.mentioned).toBe(false);
  });
  it("does NOT mark mentioned for a common-word name inside a longer name", () => {
    const d = detectAppearance(
      { answerText: "We recommend Family Dental Care.", citations: [], captureMethod: "api_grounded" },
      { name: "Dental" }
    );
    expect(d.mentioned).toBe(false);
  });
  it("still counts a real subdomain citation of the practice's own domain", () => {
    const d = detectAppearance(
      { answerText: "x", citations: [{ url: "https://portal.brightsmiles.com/p", title: null }], captureMethod: "api_grounded" },
      { name: "Bright Smiles", domain: "brightsmiles.com" }
    );
    expect(d.cited).toBe(true);
  });
});

describe("registry — only configured engines run", () => {
  afterEach(() => setAiVisibilityAdapters(null));
  it("filters out unconfigured adapters", () => {
    const live = new FakeVisibilityAdapter(
      "gemini",
      { answerText: "x", citations: [], captureMethod: "api_grounded" },
      true
    );
    const dormant = new FakeVisibilityAdapter(
      "perplexity",
      { answerText: "x", citations: [], captureMethod: "api_proxy" },
      false
    );
    setAiVisibilityAdapters([live, dormant]);
    expect(getConfiguredAdapters().map((a) => a.engine)).toEqual(["gemini"]);
  });
});

describe("SerpApiAiOverviewAdapter — parses the REAL ai_overview response shape", () => {
  /**
   * A live SerpApi `google_ai_overview` payload: `text_blocks` for the prose and
   * `references` as `{title, link, snippet, source, index}`. The reference TITLE
   * is the page's headline ("Bright Smiles Dental — Endodontics in Austin") and
   * carries NO domain; the LINK is the only field with a hostname. Extra fields
   * are included because the live response has them.
   *
   * HONEST LIMIT: `fetch` is stubbed, so this proves the PARSE against the real
   * documented shape, not the network. No SerpApi key exists yet — the live
   * smoke test stays `pending` in test-results.json.
   */
  const liveShape = {
    search_metadata: { id: "abc123", status: "Success" },
    ai_overview: {
      text_blocks: [
        { type: "paragraph", snippet: "Top-rated endodontists in Austin, TX include:" },
        { type: "paragraph", snippet: "Bright Smiles Dental, known for root canal care." },
      ],
      references: [
        {
          title: "Bright Smiles Dental — Endodontics in Austin",
          link: "https://www.brightsmiles.com/services/endodontics",
          snippet: "Root canal specialists serving Austin since 2004.",
          source: "Bright Smiles Dental",
          index: 1,
        },
        {
          title: "The 10 Best Endodontists in Austin",
          link: "https://www.yelp.com/search?find_desc=endodontist",
          snippet: "Reviews of Austin endodontists.",
          source: "Yelp",
          index: 2,
        },
      ],
    },
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function stubSerpApi(payload: unknown): void {
    vi.stubEnv("SERPAPI_API_KEY", "test-key-not-a-real-secret");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => payload })
    );
  }

  it("keeps each reference's LINK — a title-only citation loses the hostname", async () => {
    stubSerpApi(liveShape);
    const raw = await new SerpApiAiOverviewAdapter().query({
      key: "generic",
      text: "best endodontist in Austin, TX",
      kind: "generic",
    });

    expect(raw.captureMethod).toBe("serp_scrape");
    expect(raw.answerText).toContain("Bright Smiles Dental");
    expect(raw.citations).toEqual([
      {
        url: "https://www.brightsmiles.com/services/endodontics",
        title: "Bright Smiles Dental — Endodontics in Austin",
      },
      {
        url: "https://www.yelp.com/search?find_desc=endodontist",
        title: "The 10 Best Endodontists in Austin",
      },
    ]);
  });

  it("a normal {title, link} reference is detected as CITED end-to-end", async () => {
    // The regression: with the link dropped in favour of the title, the only
    // hostname is gone and a real citation of the practice's own site records
    // cited: false — under-reporting the practice's AI-answer visibility.
    stubSerpApi(liveShape);
    const raw = await new SerpApiAiOverviewAdapter().query({
      key: "generic",
      text: "best endodontist in Austin, TX",
      kind: "generic",
    });
    const d = detectAppearance(raw, {
      name: "Bright Smiles Dental",
      domain: "brightsmiles.com",
    });

    expect(d.cited).toBe(true);
    // The stored audit trail contains the host that proved the citation.
    expect(d.citedSource).toBe("https://www.brightsmiles.com/services/endodontics");
    expect(d.mentioned).toBe(true);
  });

  it("tolerates a reference with no link, and an absent ai_overview block", async () => {
    stubSerpApi({
      ai_overview: {
        text_blocks: [{ type: "paragraph", snippet: "Some answer." }],
        references: [{ title: "brightsmiles.com", index: 1 }],
      },
    });
    const adapter = new SerpApiAiOverviewAdapter();
    const raw = await adapter.query({ key: "generic", text: "q", kind: "generic" });
    expect(raw.citations).toEqual([{ url: null, title: "brightsmiles.com" }]);
    // Title-only is still matched, so a Gemini-style redirect citation works.
    expect(
      detectAppearance(raw, { name: "Bright Smiles", domain: "brightsmiles.com" }).cited
    ).toBe(true);

    stubSerpApi({});
    const empty = await adapter.query({ key: "generic", text: "q", kind: "generic" });
    expect(empty.answerText).toBe("");
    expect(empty.citations).toEqual([]);
  });

  it("throws on a non-ok SerpApi response rather than recording an empty reading", async () => {
    vi.stubEnv("SERPAPI_API_KEY", "test-key-not-a-real-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    await expect(
      new SerpApiAiOverviewAdapter().query({ key: "generic", text: "q", kind: "generic" })
    ).rejects.toThrow("429");
  });
});

describe("runAiVisibilityObservation", () => {
  let recordSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    // `true` = a NEW row was inserted. The idempotent-conflict case (false) is
    // covered explicitly below.
    recordSpy = vi
      .spyOn(AiVisibilityObservationModel, "record")
      .mockResolvedValue(true);
  });
  afterEach(() => {
    setAiVisibilityAdapters(null);
    recordSpy.mockRestore();
  });

  const baseInput = {
    organizationId: 1,
    locationId: 2,
    category: "endodontist",
    city: "Austin, TX",
    identity: { name: "Bright Smiles Dental", domain: "brightsmiles.com" },
    runDate: "2026-07-15",
    observedAt: new Date("2026-07-15T00:00:00Z"),
  };

  it("runs configured engines over the prompt set and records one observation each", async () => {
    const gemini = new FakeVisibilityAdapter(
      "gemini",
      {
        answerText: "1. Bright Smiles Dental",
        citations: [{ url: "https://brightsmiles.com/", title: "Bright Smiles Dental" }],
        captureMethod: "api_grounded",
      },
      true
    );
    setAiVisibilityAdapters([gemini]);
    const summary = await runAiVisibilityObservation(baseInput);
    expect(summary.enginesRun).toEqual(["gemini"]);
    expect(summary.failedEngines).toEqual([]);
    expect(summary.promptsRun).toBe(2);
    expect(summary.observationsRecorded).toBe(2);
    expect(summary.duplicateObservations).toBe(0);
    expect(summary.observationsProcessed).toBe(2);
    expect(recordSpy).toHaveBeenCalledTimes(2);
    for (const call of recordSpy.mock.calls) {
      expect((call[0] as { captureMethod: string }).captureMethod).toBe("api_grounded");
    }
    expect(summary.skippedEngines).toEqual(
      expect.arrayContaining(["perplexity", "google_ai_overview"])
    );
  });

  it("counts an ignored idempotent conflict as a DUPLICATE, never as a fresh observation", async () => {
    // Every write hits an existing row for this run_date — the model ignores the
    // conflict and reports `false`. The summary must not restate those rows as
    // newly captured.
    recordSpy.mockResolvedValue(false);
    setAiVisibilityAdapters([
      new FakeVisibilityAdapter(
        "gemini",
        { answerText: "1. Bright Smiles Dental", citations: [], captureMethod: "api_grounded" },
        true
      ),
    ]);
    const summary = await runAiVisibilityObservation(baseInput);
    expect(recordSpy).toHaveBeenCalledTimes(2);
    expect(summary.observationsRecorded).toBe(0);
    expect(summary.duplicateObservations).toBe(2);
    expect(summary.observationsProcessed).toBe(2);
    // The engine ANSWERED — a re-run that stores nothing new is not a failure.
    expect(summary.enginesRun).toEqual(["gemini"]);
    expect(summary.failedEngines).toEqual([]);
  });

  it("PROPAGATES a persistence failure — never relabels it an engine failure (§3.2)", async () => {
    // A rejected record() is OUR database failing. Before the boundary split it
    // was caught by the same handler as a provider error, logged as "engine
    // query failed", and the run RESOLVED — reporting a successful run that had
    // stored nothing.
    recordSpy.mockRejectedValue(new Error("connection terminated"));
    setAiVisibilityAdapters([
      new FakeVisibilityAdapter(
        "gemini",
        { answerText: "1. Bright Smiles Dental", citations: [], captureMethod: "api_grounded" },
        true
      ),
    ]);
    await expect(runAiVisibilityObservation(baseInput)).rejects.toThrow(
      "connection terminated"
    );
    // It aborts on the FIRST failed write rather than grinding through the set.
    expect(recordSpy).toHaveBeenCalledTimes(1);
  });

  it("isolates an engine failure — a throwing adapter never fails the run", async () => {
    const bad = {
      engine: "gemini" as const,
      isConfigured: () => true,
      query: async () => {
        throw new Error("boom");
      },
    };
    setAiVisibilityAdapters([bad]);
    const summary = await runAiVisibilityObservation(baseInput);
    expect(summary.observationsRecorded).toBe(0);
    expect(summary.enginesRun).toEqual([]);
    expect(summary.failedEngines).toEqual(["gemini"]);
    expect(recordSpy).not.toHaveBeenCalled();
  });

  it("skips entirely when there is no category/city (no prompt to run)", async () => {
    setAiVisibilityAdapters([
      new FakeVisibilityAdapter(
        "gemini",
        { answerText: "x", citations: [], captureMethod: "api_grounded" },
        true
      ),
    ]);
    const summary = await runAiVisibilityObservation({ ...baseInput, category: "" });
    expect(summary.promptsRun).toBe(0);
    expect(recordSpy).not.toHaveBeenCalled();
  });
});

describe("AiVisibilityObservationModel.record — reports whether a row actually landed", () => {
  /**
   * HONEST LIMIT: the suite is DB-mocked, so this asserts the query SHAPE (the
   * onConflict/ignore/returning chain that makes an insert-vs-conflict knowable)
   * and the boolean MAPPING. It does NOT prove PostgreSQL's real behaviour —
   * that an ignored conflict returns no row. That claim needs a live database
   * and stays `pending` in test-results.json.
   */
  type MockQb = {
    insert: (row: Record<string, unknown>) => MockQb;
    onConflict: (cols: string[]) => MockQb;
    ignore: () => MockQb;
    returning: (col: string) => Promise<Array<{ id: string }>>;
  };

  const input = {
    organizationId: 1,
    locationId: 2,
    engine: "gemini",
    captureMethod: "api_grounded",
    promptKey: "generic_best",
    promptText: "best endodontist in Austin, TX",
    mentioned: true,
    cited: false,
    citedSource: null,
    position: 1,
    rawExcerpt: "answer",
    runDate: "2026-07-15",
    observedAt: new Date("2026-07-15T00:00:00Z"),
  };

  function stubChain(returned: Array<{ id: string }>) {
    const seen: {
      row?: Record<string, unknown>;
      conflictCols?: string[];
      ignored: boolean;
      returningCol?: string;
    } = { ignored: false };
    const qb: MockQb = {
      insert(row) {
        seen.row = row;
        return qb;
      },
      onConflict(cols) {
        seen.conflictCols = cols;
        return qb;
      },
      ignore() {
        seen.ignored = true;
        return qb;
      },
      returning(col) {
        seen.returningCol = col;
        return Promise.resolve(returned);
      },
    };
    const spy = vi
      .spyOn(
        AiVisibilityObservationModel as unknown as { table: (trx?: unknown) => MockQb },
        "table"
      )
      .mockReturnValue(qb);
    return { seen, spy };
  }

  it("returns true when a NEW row is inserted, over an ignore-conflict chain", async () => {
    const { seen, spy } = stubChain([{ id: "obs-1" }]);
    await expect(AiVisibilityObservationModel.record(input)).resolves.toBe(true);
    expect(seen.conflictCols).toEqual([
      "location_id",
      "prompt_key",
      "engine",
      "run_date",
    ]);
    expect(seen.ignored).toBe(true);
    // Without returning("id") the caller cannot know an insert occurred.
    expect(seen.returningCol).toBe("id");
    expect(seen.row?.organization_id).toBe(1);
    spy.mockRestore();
  });

  it("returns false when the conflict was ignored and no row came back", async () => {
    const { spy } = stubChain([]);
    await expect(AiVisibilityObservationModel.record(input)).resolves.toBe(false);
    spy.mockRestore();
  });
});

describe("AiVisibilityObservationModel.listForLocation — tenant scoping (§11.7 / §20.2)", () => {
  type MockQb = {
    where: (arg: Record<string, unknown>) => MockQb;
    orderBy: () => MockQb;
    limit: () => Promise<never[]>;
  };

  it("scopes the read by BOTH organization_id and location_id, so one org cannot read another's rows", async () => {
    // The suite is DB-mocked, so this asserts the query SHAPE — the WHERE clause
    // that enforces isolation. A behavioral real-DB test belongs in
    // integration-tests once this read is wired to a production caller (none yet).
    let whereArg: Record<string, unknown> | undefined;
    const qb: MockQb = {
      where(arg) {
        whereArg = arg;
        return qb;
      },
      orderBy() {
        return qb;
      },
      limit() {
        return Promise.resolve([]);
      },
    };
    const tableSpy = vi
      .spyOn(
        AiVisibilityObservationModel as unknown as { table: (trx?: unknown) => MockQb },
        "table"
      )
      .mockReturnValue(qb);

    await AiVisibilityObservationModel.listForLocation(7, 42);

    // Org 7 querying location 42 is scoped to org 7; org 8's rows at the same
    // location_id are excluded by the organization_id filter.
    expect(whereArg).toEqual({ organization_id: 7, location_id: 42 });
    tableSpy.mockRestore();
  });
});
