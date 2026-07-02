/**
 * Unit tests — canonical correctness assessment (plans/07022026-seo-audit-canonical-check).
 *
 * Load-bearing guarantee: the "Canonical tag" criterion can never again award
 * full credit to a canonical that names the wrong page or the wrong host.
 * Both real production failure modes found 2026-07-02 are pinned here:
 *   • One Endo Fredericksburg: canonical "/fredericksburg-office" on the page
 *     served at "/locations/fredericksburg-office" scored 8/8 — no longer full credit.
 *   • Garrison: canonicals pointing at the internal generated hostname
 *     (swift-medical-6022.sites.getalloro.com) while the site serves on its
 *     custom domain — call sites pass the PRIMARY host only, so this fails.
 */

import { describe, it, expect } from "vitest";
import { assessCanonical, calculateScores } from "./seoPanel.utils";
import type { SeoData } from "../../api/websites";

const ONE_ENDO_HOSTS = ["1endodontics.com"];

describe("assessCanonical", () => {
  it("REGRESSION — the Fredericksburg 8/8 false pass: right host, dead legacy path fails full credit", () => {
    expect(
      assessCanonical("/fredericksburg-office", {
        expectedPath: "/locations/fredericksburg-office",
        siteHosts: ONE_ENDO_HOSTS,
      })
    ).toBe("partial"); // same-host, wrong path — no longer full credit
  });

  it("full: relative canonical matching the serving path", () => {
    expect(
      assessCanonical("/locations/fredericksburg-office", {
        expectedPath: "/locations/fredericksburg-office",
        siteHosts: ONE_ENDO_HOSTS,
      })
    ).toBe("full");
  });

  it("full: absolute same-host canonical, www- and trailing-slash-insensitive", () => {
    expect(
      assessCanonical("https://www.1endodontics.com/locations/fredericksburg-office/", {
        expectedPath: "/locations/fredericksburg-office",
        siteHosts: ONE_ENDO_HOSTS,
      })
    ).toBe("full");
  });

  it("REGRESSION — the Garrison failure mode: canonical on the internal generated hostname fails against the primary host, even with a matching path", () => {
    expect(
      assessCanonical("https://swift-medical-6022.sites.getalloro.com/articles/x", {
        expectedPath: "/articles/x",
        siteHosts: ["garrisonorthodontics.com"],
      })
    ).toBe("fail");
  });

  it("partial: same-host different path — deliberate consolidation gets partial credit, not zero", () => {
    expect(
      assessCanonical("https://1endodontics.com/services", {
        expectedPath: "/services/root-canal-therapy",
        siteHosts: ONE_ENDO_HOSTS,
      })
    ).toBe("partial");
  });

  it("fail: missing or malformed canonicals", () => {
    expect(assessCanonical("", { expectedPath: "/x", siteHosts: ONE_ENDO_HOSTS })).toBe("fail");
    expect(assessCanonical("   ", { expectedPath: "/x" })).toBe("fail");
    expect(assessCanonical("not a url at all", { expectedPath: "/x" })).toBe("fail");
  });

  it("degrades to presence-only when no context is provided (callers without path/host data)", () => {
    expect(assessCanonical("/anything")).toBe("full");
    expect(assessCanonical("")).toBe("fail");
  });

  it("path-only check when hosts are unknown (posts panel): wrong path is partial, right path full", () => {
    expect(assessCanonical("/fredericksburg-office", { expectedPath: "/locations/fredericksburg-office" })).toBe("partial");
    expect(assessCanonical("/articles/my-post", { expectedPath: "/articles/my-post" })).toBe("full");
  });
});

describe("calculateScores — canonical criterion wiring", () => {
  const baseSeo = { canonical_url: "/fredericksburg-office" } as SeoData;

  function criticalItem(seo: SeoData, context?: Parameters<typeof calculateScores>[4]) {
    const sections = calculateScores(seo, "", [], [], context);
    const critical = sections.find((s) => s.key === "critical");
    return critical!.items.find((i) => i.id === 1)!;
  }

  it("wrong-path canonical scores 4 (partial), not 8 — and the label names the mismatch", () => {
    const item = criticalItem(baseSeo, {
      expectedPath: "/locations/fredericksburg-office",
      siteHosts: ONE_ENDO_HOSTS,
    });
    expect(item.passed).toBe(true);
    expect(item.points).toBe(4);
    expect(item.label).toBe("Canonical tag (points to a different page)");
  });

  it("correct canonical scores the full 8", () => {
    const item = criticalItem({ canonical_url: "/locations/fredericksburg-office" } as SeoData, {
      expectedPath: "/locations/fredericksburg-office",
      siteHosts: ONE_ENDO_HOSTS,
    });
    expect(item.passed).toBe(true);
    expect(item.points).toBe(8);
  });

  it("cross-host canonical fails the criterion outright", () => {
    const item = criticalItem({ canonical_url: "https://someothersite.com/locations/x" } as SeoData, {
      expectedPath: "/locations/x",
      siteHosts: ONE_ENDO_HOSTS,
    });
    expect(item.passed).toBe(false);
  });
});
