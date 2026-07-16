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

  it("cited=true only when a citation's real HOST is the practice's own", () => {
    const raw: EngineRawResult = {
      answerText: "General answer.",
      citations: [
        { url: "https://yelp.com/biz/x", title: "Yelp" },
        { url: "https://brightsmiles.com/services", title: "Services" },
      ],
      captureMethod: "api_grounded",
    };
    const d = detectAppearance(raw, identity);
    expect(d.cited).toBe(true);
    expect(d.citedSource).toBe("https://brightsmiles.com/services");
    expect(d.mentioned).toBe(true);
  });

  it("a NON-canonical title carrying the domain in prose is NOT a citation", () => {
    // Previously this recorded cited=true: the practice's domain appeared in a
    // third party's title text. The engine never cited the practice — the claim
    // was manufactured out of prose.
    const raw: EngineRawResult = {
      answerText: "General answer.",
      citations: [{ url: null, title: "Bright Smiles — brightsmiles.com" }],
      captureMethod: "api_grounded",
    };
    const d = detectAppearance(raw, identity);
    expect(d.cited).toBe(false);
    expect(d.citedSource).toBeNull();
    expect(d.mentioned).toBe(false);
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

/**
 * Round-3 adversary: IDENTITY, NOT RESEMBLANCE.
 *
 * Every case below recorded a FABRICATION before this round — evidence we would
 * have shown an owner as fact. The class is "a match decided by resemblance",
 * so these sweep the whole surface (name prefix/suffix, lowercase prose, URL
 * string scraping, title prose, cross-engine title trust, a garbage practice
 * domain, and the diagnostic line), not only the two cases that were named.
 *
 * The `records` block is the other half of the proof: the guards must not be
 * vacuous. A detector that answered `false` to everything would pass every
 * fabrication test and be worthless.
 */
describe("detectAppearance — identity not resemblance (round-3 adversary)", () => {
  const ID = { name: "Smile Dental", domain: "smiledental.com" };
  const answer = (answerText: string): EngineRawResult => ({
    answerText,
    citations: [],
    captureMethod: "api_grounded",
  });
  const sources = (citations: EngineRawResult["citations"]): EngineRawResult => ({
    answerText: "General answer.",
    citations,
    captureMethod: "api_grounded",
  });

  describe("fabricates nothing", () => {
    it.each([
      ["a lowercase suffix word", "Try Smile Dental group today."],
      ["an ampersand continuation", "Smile Dental & Orthodontics is great."],
      ["a name-forming connector", "Smile Dental of Austin is great."],
      ["a hyphenated locality", "Smile Dental-Austin is great."],
      ["a capitalized continuation", "Smile Dental Group, they are excellent."],
      ["a LEFT-extended longer name", "Bright Smile Dental is great."],
      ["a left-extended name mid-sentence", "Book at Bright Smile Dental today."],
      ["an all-lowercase left extension", "the bright smile dental option"],
      ["a LEFT extension in ALL CAPS", "BRIGHT SMILE DENTAL is great."],
      ["a left extension hidden by partial markdown bold", "**Bright** Smile Dental is great."],
      ["a left extension joined by an em-dash", "Bright — Smile Dental is great."],
      ["a left extension joined by a hyphen", "Bright-Smile Dental is great."],
      ["a left extension hidden by a zero-width space", "Bright​Smile Dental is great."],
      ["a left extension joined by an ampersand", "Bright & Smile Dental is great."],
      ["a DIGIT-leading competitor prefix", "Austin options: 32 Smile Dental is a boutique studio."],
      ["an alphanumeric competitor prefix", "Austin options: 3D Smile Dental uses digital scans."],
      ["a PLURAL suffix word (clinics)", "Smile Dental clinics are common in this area."],
      ["a plural suffix word (groups)", "Smile Dental groups are common in this area."],
      ["a plural suffix word (practices)", "Smile Dental practices are common in this area."],
      ["a plural suffix word (centers)", "Smile Dental centers are common in this area."],
      ["markdown bolding only the tail of a longer name", "Try Bright **Smile Dental** downtown."],
      ["markdown italicising only the head of a longer name", "Try *Bright* Smile Dental downtown."],
    ])("does NOT record a mention for %s", (_label, text) => {
      expect(detectAppearance(answer(text), ID).mentioned).toBe(false);
    });

    it("does NOT record a mention from generic prose that names NOBODY", () => {
      // The worst case: no competitor is even involved. The answer recommends
      // someone else entirely, and the practice's generically-worded name
      // appears only as English prose. The owner would be told "you were
      // mentioned" about an answer that never mentioned them.
      const d = detectAppearance(
        answer("Family dental practices in Austin are plentiful. Try Bright Smile Dental."),
        { name: "Family Dental", domain: "familydental.com" }
      );
      expect(d.mentioned).toBe(false);
      expect(d.position).toBeNull();
    });

    it("does NOT record a mention when prose merely reuses a common-phrase name", () => {
      expect(
        detectAppearance(answer("Perfect smile outcomes vary by provider. Visit Bright Ortho."), {
          name: "Perfect Smile",
          domain: "perfectsmile.com",
        }).mentioned
      ).toBe(false);
    });

    it("does NOT cite a root-relative URL whose first path segment looks like our host", () => {
      // "https:///smiledental.com/reviews" collapses to hostname smiledental.com.
      // No current adapter emits this shape; it is closed for the next one.
      expect(
        detectAppearance(sources([{ url: "/smiledental.com/reviews", title: null }]), ID).cited
      ).toBe(false);
    });

    it("does NOT cite a third party whose TITLE carries our domain in prose", () => {
      const d = detectAppearance(
        sources([
          { url: "https://directory.example/listing", title: "Directory profile for smiledental.com" },
        ]),
        ID
      );
      expect(d.cited).toBe(false);
      expect(d.citedSource).toBeNull();
    });

    it("does NOT cite a URL that merely CONTAINS our domain in its query", () => {
      expect(
        detectAppearance(
          sources([{ url: "https://directory.example/listing?ref=smiledental.com", title: "Listing" }]),
          ID
        ).cited
      ).toBe(false);
    });

    it("does NOT cite a URL that merely CONTAINS our domain in its path", () => {
      expect(
        detectAppearance(
          sources([{ url: "https://evil.example/smiledental.com/reviews", title: "Reviews" }]),
          ID
        ).cited
      ).toBe(false);
    });

    it("does NOT trust a bare-host title from an engine that cannot prove it", () => {
      expect(
        detectAppearance(sources([{ url: null, title: "smiledental.com" }]), ID).cited
      ).toBe(false);
    });

    it("does NOT trust a declared-canonical title that is PROSE, not a host", () => {
      // Defence in depth: even the one engine allowed to prove a citation from a
      // title cannot smuggle prose through it.
      expect(
        detectAppearance(
          sources([
            { url: null, title: "Directory profile for smiledental.com", titleIsCanonicalHost: true },
          ]),
          ID
        ).cited
      ).toBe(false);
    });

    it("a TLD-only practice domain never matches every host under that TLD", () => {
      expect(
        detectAppearance(sources([{ url: "https://competitor.com/x", title: "X" }]), {
          name: "Smile Dental",
          domain: "com",
        }).cited
      ).toBe(false);
    });

    it("never points `position` at a lookalike's line", () => {
      const d = detectAppearance(
        answer("1. Smile Dental Group\n2. Other Practice\n3. Smile Dental"),
        ID
      );
      expect(d.mentioned).toBe(true);
      expect(d.position).toBe(3);
    });
  });

  describe("still records real evidence (the guards are not vacuous)", () => {
    it("records a real standalone mention", () => {
      expect(
        detectAppearance(answer("I recommend Smile Dental for cleanings."), ID).mentioned
      ).toBe(true);
    });

    it("records a mention a lookalike appears BEFORE", () => {
      // A competitor earlier in the answer must not suppress a real later hit.
      expect(
        detectAppearance(answer("Smile Dental Group is one option.\nSo is Smile Dental."), ID)
          .mentioned
      ).toBe(true);
    });

    it("records a mention in a numbered list", () => {
      const d = detectAppearance(answer("Top picks:\n1. Smile Dental\n2. Other Co"), ID);
      expect(d.mentioned).toBe(true);
      expect(d.position).toBe(2);
    });

    it("records a possessive mention", () => {
      expect(detectAppearance(answer("Smile Dental's team is excellent."), ID).mentioned).toBe(true);
    });

    it("records a mention followed by a comma clause", () => {
      expect(
        detectAppearance(answer("Smile Dental, a family practice, is great."), ID).mentioned
      ).toBe(true);
    });

    it("records a real citation of our host", () => {
      const d = detectAppearance(sources([{ url: "https://www.smiledental.com/", title: "Home" }]), ID);
      expect(d.cited).toBe(true);
      expect(d.citedSource).toBe("https://www.smiledental.com/");
    });

    it("records a real subdomain citation", () => {
      expect(
        detectAppearance(sources([{ url: "https://book.smiledental.com/x", title: "Book" }]), ID).cited
      ).toBe(true);
    });

    it("records a citation from a canonical bare-host title (the Gemini contract)", () => {
      const d = detectAppearance(
        sources([
          { url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "smiledental.com", titleIsCanonicalHost: true },
        ]),
        ID
      );
      expect(d.cited).toBe(true);
      expect(d.citedSource).toBe("smiledental.com");
    });

    it("matches the practice's own longer name exactly", () => {
      expect(
        detectAppearance(answer("Smile Dental Group is great."), {
          name: "Smile Dental Group",
          domain: "smiledental.com",
        }).mentioned
      ).toBe(true);
    });

    it("matches a registered name ending in a period — 'Smile Dental P.C.'", () => {
      // A \b after the trailing "." never fires, which made every "… P.C." /
      // "Inc." / "D.D.S." practice permanently undetectable TO ITSELF. Over-
      // rejection is a gap, not a lie — but a practice invisible to its own
      // name is an absurd gap, not a conservative one.
      expect(
        detectAppearance(answer("Smile Dental P.C. is great."), {
          name: "Smile Dental P.C.",
          domain: "smiledental.com",
        }).mentioned
      ).toBe(true);
    });

    it("tolerates stray whitespace in the STORED name", () => {
      expect(
        detectAppearance(answer("Smile Dental is great."), {
          name: "Smile  Dental",
          domain: "smiledental.com",
        }).mentioned
      ).toBe(true);
    });

    it("records an ALL-CAPS rendering of a title-case name", () => {
      expect(detectAppearance(answer("SMILE DENTAL is great."), ID).mentioned).toBe(true);
    });

    it("records a mention in a dash-bulleted list after another practice", () => {
      // The newline is a hard entity boundary, so the previous line's business
      // name must not swallow this one — the dominant shape of engine answers.
      expect(detectAppearance(answer("- Bright Ortho\n- Smile Dental"), ID).mentioned).toBe(true);
    });

    it("records a mention bolded whole, with a trailing dash blurb", () => {
      expect(detectAppearance(answer("1. **Smile Dental** — 4.8 stars"), ID).mentioned).toBe(true);
    });
  });
});

describe("GeminiVisibilityAdapter — the ONLY engine that may prove a citation by title", () => {
  /**
   * Gemini's grounding `uri` is a vertexaisearch REDIRECT — the real host is not
   * in it — and Gemini names each chunk by its bare domain in `title`. That
   * engine-specific contract is why this adapter, and only this adapter, marks
   * its titles canonical. If this ever stops being true, this test fails loudly
   * rather than the detector silently trusting prose.
   *
   * HONEST LIMIT: the @google/genai client is mocked, so this proves the MAPPING
   * against the documented grounding shape, not the live API. The live Gemini
   * smoke test stays `pending` in test-results.json — no key here.
   */
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("marks grounding titles canonical, so a redirect URI still proves a real citation", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key-not-a-real-secret");
    // Reset FIRST: this file already static-imports the adapter (for
    // FakeVisibilityAdapter), so without clearing the registry the dynamic
    // import below returns the cached module bound to the REAL client — and the
    // "unit" test silently makes a live network call.
    vi.resetModules();
    vi.doMock("@google/genai", () => ({
      GoogleGenAI: class {
        models = {
          generateContent: async () => ({
            text: "Bright Smiles Dental is well reviewed.",
            candidates: [
              {
                groundingMetadata: {
                  groundingChunks: [
                    {
                      web: {
                        uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz",
                        title: "brightsmiles.com",
                      },
                    },
                  ],
                },
              },
            ],
          }),
        };
      },
    }));
    const { GeminiVisibilityAdapter } = await import(
      "../services/ai-visibility/adapters/geminiAdapter"
    );
    const raw = await new GeminiVisibilityAdapter().query({
      key: "generic",
      text: "q",
      kind: "generic",
    });

    expect(raw.captureMethod).toBe("api_grounded");
    expect(raw.citations).toEqual([
      {
        url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz",
        title: "brightsmiles.com",
        titleIsCanonicalHost: true,
      },
    ]);
    // The redirect host is NOT ours, so only the canonical title can prove this.
    const d = detectAppearance(raw, {
      name: "Bright Smiles Dental",
      domain: "brightsmiles.com",
    });
    expect(d.cited).toBe(true);
    expect(d.citedSource).toBe("brightsmiles.com");
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
        titleIsCanonicalHost: false,
      },
      {
        url: "https://www.yelp.com/search?find_desc=endodontist",
        title: "The 10 Best Endodontists in Austin",
        titleIsCanonicalHost: false,
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
    expect(raw.citations).toEqual([
      { url: null, title: "brightsmiles.com", titleIsCanonicalHost: false },
    ]);
    // A SerpApi reference title is a page HEADLINE, not the cited host — even
    // when that headline happens to read as a bare domain. SerpApi's contract
    // cannot prove the destination, so this records NOTHING rather than a maybe.
    // (The Gemini adapter, whose contract DOES name chunks by domain, is the
    // only engine allowed to prove a citation from a title — see its test.)
    expect(
      detectAppearance(raw, { name: "Bright Smiles", domain: "brightsmiles.com" }).cited
    ).toBe(false);

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
  /**
   * BEHAVIORAL, not shape-based. An earlier version of this test asserted the
   * WHERE *argument* (`expect(whereArg).toEqual({...})`) — worthless, because it
   * passed whether or not the filter ever excluded a row. This fake is a real
   * (tiny) query engine: `where` actually narrows the row set, so the assertion
   * below is about which ROWS come back. Reverting the model's
   * `organization_id` predicate makes it fail (proven in the PR body).
   *
   * HONEST LIMIT: this proves the model's own filtering logic against a fake
   * that applies knex's where-semantics. It does NOT prove PostgreSQL's
   * behaviour — no live DB in this suite. The real-DB claim stays `pending` in
   * test-results.json.
   */
  type Row = Record<string, unknown>;

  /** Minimal in-memory stand-in for the knex chain that ACTUALLY filters. */
  function fakeTable(rows: Row[]) {
    let working = [...rows];
    const qb = {
      where(conditions: Record<string, unknown>) {
        // Real narrowing: every key/value in `conditions` must match.
        working = working.filter((row) =>
          Object.entries(conditions).every(([col, val]) => row[col] === val)
        );
        return qb;
      },
      orderBy(col: string, dir: "asc" | "desc") {
        working.sort((a, b) => {
          const av = Number(a[col]);
          const bv = Number(b[col]);
          return dir === "desc" ? bv - av : av - bv;
        });
        return qb;
      },
      limit(n: number) {
        return Promise.resolve(working.slice(0, n));
      },
    };
    return qb;
  }

  // Two tenants share location_id 42 — the exact collision that an unscoped
  // read leaks. Org 8's row is the one that must never come back for org 7.
  const rows: Row[] = [
    { id: "o7-a", organization_id: 7, location_id: 42, observed_at: 200 },
    { id: "o7-b", organization_id: 7, location_id: 42, observed_at: 100 },
    { id: "o8-SECRET", organization_id: 8, location_id: 42, observed_at: 300 },
    { id: "o7-other-loc", organization_id: 7, location_id: 99, observed_at: 400 },
  ];

  it("returns ONLY the caller's org rows when another tenant shares the same location_id", async () => {
    const tableSpy = vi
      .spyOn(
        AiVisibilityObservationModel as unknown as { table: (trx?: unknown) => unknown },
        "table"
      )
      .mockImplementation(() => fakeTable(rows));

    const result = await AiVisibilityObservationModel.listForLocation(7, 42);

    // Behavioral: org 8's row is EXCLUDED even though it shares location 42 and
    // is the newest row (so a missing org filter would surface it first).
    expect(result.map((r) => r.id)).toEqual(["o7-a", "o7-b"]);
    expect(result.map((r) => r.id)).not.toContain("o8-SECRET");
    expect(result.every((r) => r.organization_id === 7)).toBe(true);
    tableSpy.mockRestore();
  });

  it("returns nothing for an org that owns no rows at that location", async () => {
    const tableSpy = vi
      .spyOn(
        AiVisibilityObservationModel as unknown as { table: (trx?: unknown) => unknown },
        "table"
      )
      .mockImplementation(() => fakeTable(rows));

    // Org 999 guessing location 42 must get an empty set, not org 7's or 8's rows.
    const result = await AiVisibilityObservationModel.listForLocation(999, 42);

    expect(result).toEqual([]);
    tableSpy.mockRestore();
  });
});

describe("AiVisibilityObservationModel — sealed unscoped entry points (§11.7 / §5.5)", () => {
  /**
   * Each `@ts-expect-error` below is a COMPILE-TIME assertion, and `tsc` covers
   * this file (verified: it appears in `tsc --noEmit --listFiles`). If a seal is
   * ever removed, the call type-checks again, the directive becomes unused, and
   * `npx tsc --noEmit` FAILS with TS2578 — so the seal cannot be silently
   * deleted. The `rejects.toThrow` half proves the runtime backstop for
   * untyped/JS callers in the same line.
   */

  it("seals findById — an unscoped id read cannot compile or run", async () => {
    await expect(
      // @ts-expect-error §11.7 — sealed: passing an id must not type-check (TS2554).
      AiVisibilityObservationModel.findById("leaked-uuid")
    ).rejects.toThrow(/findById is unscoped and disabled/);
  });

  it("seals findOne — a condition read cannot compile or run", async () => {
    await expect(
      // @ts-expect-error §11.7 — sealed: passing conditions must not type-check.
      AiVisibilityObservationModel.findOne({ location_id: 42 })
    ).rejects.toThrow(/findOne is unscoped and disabled/);
  });

  it("seals findMany — a cross-tenant list cannot compile or run", async () => {
    await expect(
      // @ts-expect-error §11.7 — sealed: passing conditions must not type-check.
      AiVisibilityObservationModel.findMany({})
    ).rejects.toThrow(/findMany is unscoped and disabled/);
  });

  it("seals create — an arbitrary insert bypassing record() cannot compile or run", async () => {
    await expect(
      // @ts-expect-error §11.7/§5.4 — sealed: arbitrary insert must not type-check.
      AiVisibilityObservationModel.create({ organization_id: 8 })
    ).rejects.toThrow(/create bypasses the idempotent record\(\) contract/);
  });

  it("seals createReturningId — the write the usual unscoped-reader list misses", async () => {
    await expect(
      // @ts-expect-error §11.7/§5.4 — sealed: arbitrary insert must not type-check.
      AiVisibilityObservationModel.createReturningId({ organization_id: 8 })
    ).rejects.toThrow(/createReturningId bypasses the idempotent record\(\) contract/);
  });

  it("seals updateById — this log is append-only, so no scoped update exists", async () => {
    await expect(
      // @ts-expect-error §11.7 — sealed: unscoped update must not type-check.
      AiVisibilityObservationModel.updateById("leaked-uuid", { mentioned: false })
    ).rejects.toThrow(/updateById is unscoped and disabled/);
  });

  it("seals deleteById — the most destructive cross-tenant hole", async () => {
    await expect(
      // @ts-expect-error §11.7 — sealed: unscoped delete must not type-check.
      AiVisibilityObservationModel.deleteById("leaked-uuid")
    ).rejects.toThrow(/deleteById is unscoped and disabled/);
  });

  it("seals paginate — a paged cross-tenant read", async () => {
    await expect(
      // @ts-expect-error §11.7 — sealed: caller-built query must not type-check.
      AiVisibilityObservationModel.paginate((qb: unknown) => qb, { limit: 10 })
    ).rejects.toThrow(/paginate is unscoped and disabled/);
  });

  it("seals count at RUNTIME ONLY — the honest exception to the compile-time seal", async () => {
    // NOTE: no @ts-expect-error here, deliberately. `BaseModel.count()` is
    // callable with zero arguments, so the arity trick cannot fire and this
    // call DOES type-check. Adding a directive would itself fail tsc (TS2578).
    // The seal is runtime-only; that gap is documented on the method.
    await expect(AiVisibilityObservationModel.count()).rejects.toThrow(
      /count is unscoped and disabled/
    );
  });
});
