import { describe, expect, it } from "vitest";
import {
  deriveSubmissionSource,
  normalizeSource,
  hostOf,
  classifyReferrerHost,
  classifyExternalReferer,
} from "../controllers/websiteContact/websiteContact-utils/sourceAttribution";

describe("normalizeSource", () => {
  it("lowercases, trims, keeps a safe channel label (incl. underscores)", () => {
    expect(normalizeSource("  Google_Business_Profile ")).toBe(
      "google_business_profile",
    );
  });
  it("rejects an unsafe charset as unknown (null), never sanitizing a guess", () => {
    expect(normalizeSource("drop table; <script>")).toBeNull();
    expect(normalizeSource("foo bar")).toBeNull(); // whitespace inside → unknown
  });
  it("caps at 100 chars", () => {
    expect(normalizeSource("a".repeat(150))?.length).toBe(100);
  });
  it("returns null for empty/whitespace", () => {
    expect(normalizeSource("   ")).toBeNull();
  });
});

describe("hostOf", () => {
  it("strips www and lowercases", () => {
    expect(hostOf("https://WWW.Google.com/search?q=x")).toBe("google.com");
  });
  it("returns null for an unparseable url", () => {
    expect(hostOf("not a url")).toBeNull();
  });
});

describe("classifyReferrerHost", () => {
  it.each([
    ["google.com", "google"],
    ["maps.google.com", "google"],
    ["bing.com", "bing"],
    ["m.facebook.com", "facebook"],
    ["linkedin.com", "linkedin"],
    ["t.co", "twitter"],
    ["youtu.be", "youtube"],
  ])("classifies %s -> %s", (host, expected) => {
    expect(classifyReferrerHost(host)).toBe(expected);
  });
  it("falls back to an honest 'referral' for an unrecognized external site", () => {
    expect(classifyReferrerHost("someblog.example")).toBe("referral");
  });
  it("matches whole labels only — never a substring (plumbing.com is not bing)", () => {
    expect(classifyReferrerHost("plumbing.com")).toBe("referral");
    expect(classifyReferrerHost("notgoogle.com")).toBe("referral");
    expect(classifyReferrerHost("climbing.co")).toBe("referral");
  });
});

describe("deriveSubmissionSource", () => {
  const ownHosts = ["drpavan.sites.getalloro.com", "drpavanendo.com"];

  it("prefers the frontend first-touch source over the (internal) submit referer", () => {
    expect(
      deriveSubmissionSource({
        bodySource: "google_business_profile",
        referer: "https://drpavan.sites.getalloro.com/contact",
        projectHosts: ownHosts,
      }),
    ).toBe("google_business_profile");
  });

  it("uses utmSource when there is no bodySource", () => {
    expect(deriveSubmissionSource({ utmSource: "newsletter" })).toBe(
      "newsletter",
    );
  });

  it("falls through a junk bodySource to a valid utmSource (no signal loss)", () => {
    expect(
      deriveSubmissionSource({ bodySource: "!!!", utmSource: "newsletter" }),
    ).toBe("newsletter");
  });

  it("returns null with no first-touch and no referer (unknown, not guessed)", () => {
    expect(deriveSubmissionSource({})).toBeNull();
    expect(deriveSubmissionSource({ referer: "" })).toBeNull();
    expect(
      deriveSubmissionSource({ bodySource: null, utmSource: null, referer: null }),
    ).toBeNull();
  });

  it("returns null for an INTERNAL referer — the practice's own page is not a source", () => {
    expect(
      deriveSubmissionSource({
        referer: "https://drpavan.sites.getalloro.com/services",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
    expect(
      deriveSubmissionSource({
        referer: "https://www.drpavanendo.com/book",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
  });

  it("classifies a genuine cross-site referer when there is no first-touch", () => {
    expect(
      deriveSubmissionSource({
        referer: "https://www.google.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("google");
    expect(
      deriveSubmissionSource({
        referer: "https://www.yelp.com/biz/x",
        projectHosts: ownHosts,
      }),
    ).toBe("referral");
  });

  it("returns null for an unparseable/hostless referer (never guesses)", () => {
    expect(deriveSubmissionSource({ referer: "javascript:void(0)" })).toBeNull();
    expect(deriveSubmissionSource({ referer: "not a url" })).toBeNull();
  });

  // ── first-touch landing referrer (the real entry channel for organic/referral)
  it("classifies the first-touch landing referrer when there is no explicit label", () => {
    expect(
      deriveSubmissionSource({
        firstTouchReferer: "https://www.google.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("google");
  });

  it("first-touch landing referrer beats the (internal) submit referer", () => {
    expect(
      deriveSubmissionSource({
        firstTouchReferer: "https://www.google.com/",
        referer: "https://drpavan.sites.getalloro.com/contact",
        projectHosts: ownHosts,
      }),
    ).toBe("google");
  });

  it("an explicit utm label still beats the first-touch referrer", () => {
    expect(
      deriveSubmissionSource({
        utmSource: "newsletter",
        firstTouchReferer: "https://www.google.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("newsletter");
  });

  it("an INTERNAL first-touch referrer is skipped, falling to the submit referer", () => {
    expect(
      deriveSubmissionSource({
        firstTouchReferer: "https://drpavan.sites.getalloro.com/home",
        referer: "https://www.facebook.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("facebook");
  });

  it("an unparseable first-touch referrer is skipped (never guesses)", () => {
    expect(
      deriveSubmissionSource({
        firstTouchReferer: "not a url",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
  });
});

describe("classifyExternalReferer", () => {
  const own = ["drpavan.sites.getalloro.com", "drpavanendo.com"];
  it("classifies an external referer host", () => {
    expect(classifyExternalReferer("https://www.google.com/x", own)).toBe("google");
  });
  it("returns null for an internal (own-host) referer", () => {
    expect(
      classifyExternalReferer("https://drpavanendo.com/book", own),
    ).toBeNull();
  });
  it("returns null for missing/unparseable referers", () => {
    expect(classifyExternalReferer(null, own)).toBeNull();
    expect(classifyExternalReferer("", own)).toBeNull();
    expect(classifyExternalReferer("not a url", own)).toBeNull();
  });
});
