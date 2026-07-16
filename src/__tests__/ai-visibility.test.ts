import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildPromptSet } from "../services/ai-visibility/promptSetBuilder";
import { detectAppearance } from "../services/ai-visibility/appearanceDetector";
import {
  setAiVisibilityAdapters,
  getConfiguredAdapters,
} from "../services/ai-visibility/registry";
import { FakeVisibilityAdapter } from "../services/ai-visibility/adapters/geminiAdapter";
import { runAiVisibilityObservation } from "../services/ai-visibility/observationRunner";
import { AiVisibilityObservationModel } from "../models/AiVisibilityObservationModel";
import { EngineRawResult } from "../services/ai-visibility/types";

/**
 * Alloro Funnel Engine A3 (AI-Answer Visibility) proofs. Locks: the prompt set,
 * the deterministic detector (incl. the ambiguity guard on `cited`), the
 * registry's only-configured-engines-run rule, and the runner (per-engine
 * failure isolation, idempotent record shape, honest skipped-engine reporting).
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
      citationSources: [],
      captureMethod: "api_grounded",
    };
    const d = detectAppearance(raw, identity);
    expect(d.mentioned).toBe(true);
    expect(d.position).toBe(2);
  });

  it("mentioned=false when the name does not appear", () => {
    const raw: EngineRawResult = {
      answerText: "1. Some Other Dental\n2. Third Practice",
      citationSources: [],
      captureMethod: "api_grounded",
    };
    expect(detectAppearance(raw, identity).mentioned).toBe(false);
  });

  it("cited=true only when the practice DOMAIN appears in the sources", () => {
    const raw: EngineRawResult = {
      answerText: "General answer.",
      citationSources: ["Bright Smiles — brightsmiles.com", "yelp.com"],
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
      citationSources: ["yelp.com", "healthgrades.com"],
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
      { answerText: "x", citationSources: ["bestsmiledental.com"], captureMethod: "api_grounded" },
      { name: "Smile Dental", domain: "smiledental.com" }
    );
    expect(d.cited).toBe(false);
  });
  it("does NOT mark cited from a domain mentioned only in prose (not a citation)", () => {
    const d = detectAppearance(
      { answerText: "I recommend mysmiledental.com for cleanings.", citationSources: [], captureMethod: "api_grounded" },
      { name: "Smile Dental", domain: "smiledental.com" }
    );
    expect(d.cited).toBe(false);
  });
  it("does NOT mark cited for a different ccTLD host", () => {
    const d = detectAppearance(
      { answerText: "x", citationSources: ["superdental.com.au"], captureMethod: "api_grounded" },
      { name: "X Dental", domain: "dental.com" }
    );
    expect(d.cited).toBe(false);
  });
  it("does NOT mark mentioned when only a longer competitor name appears", () => {
    const d = detectAppearance(
      { answerText: "Try Smile Dental Group, they are excellent.", citationSources: [], captureMethod: "api_grounded" },
      { name: "Smile Dental" }
    );
    expect(d.mentioned).toBe(false);
  });
  it("does NOT mark mentioned for a common-word name inside a longer name", () => {
    const d = detectAppearance(
      { answerText: "We recommend Family Dental Care.", citationSources: [], captureMethod: "api_grounded" },
      { name: "Dental" }
    );
    expect(d.mentioned).toBe(false);
  });
  it("still counts a real subdomain citation of the practice's own domain", () => {
    const d = detectAppearance(
      { answerText: "x", citationSources: ["portal.brightsmiles.com"], captureMethod: "api_grounded" },
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
      { answerText: "x", citationSources: [], captureMethod: "api_grounded" },
      true
    );
    const dormant = new FakeVisibilityAdapter(
      "perplexity",
      { answerText: "x", citationSources: [], captureMethod: "api_proxy" },
      false
    );
    setAiVisibilityAdapters([live, dormant]);
    expect(getConfiguredAdapters().map((a) => a.engine)).toEqual(["gemini"]);
  });
});

describe("runAiVisibilityObservation", () => {
  let recordSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    recordSpy = vi
      .spyOn(AiVisibilityObservationModel, "record")
      .mockResolvedValue(undefined);
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
        citationSources: ["brightsmiles.com"],
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
    expect(recordSpy).toHaveBeenCalledTimes(2);
    for (const call of recordSpy.mock.calls) {
      expect((call[0] as { captureMethod: string }).captureMethod).toBe("api_grounded");
    }
    expect(summary.skippedEngines).toEqual(
      expect.arrayContaining(["perplexity", "google_ai_overview"])
    );
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
        { answerText: "x", citationSources: [], captureMethod: "api_grounded" },
        true
      ),
    ]);
    const summary = await runAiVisibilityObservation({ ...baseInput, category: "" });
    expect(summary.promptsRun).toBe(0);
    expect(recordSpy).not.toHaveBeenCalled();
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
