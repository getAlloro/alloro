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
  it("never fabricates a brand from a spoofed sub-label (adversary F2)", () => {
    // A public endpoint means the referer is attacker-controlled — a brand label
    // on someone else's registrable domain must NOT become that brand.
    expect(classifyReferrerHost("google.attacker-blog.com")).toBe("referral");
    expect(classifyReferrerHost("bing.wordpress.com")).toBe("referral");
    expect(classifyReferrerHost("fb.somecdn.net")).toBe("referral");
    // …but a genuine sub-domain of the real registrable domain still classifies.
    expect(classifyReferrerHost("maps.google.com")).toBe("google");
    expect(classifyReferrerHost("m.facebook.com")).toBe("facebook");
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

  // ── claim allow-listing: never store a client-supplied label we don't
  //    recognize, so patient PII in a personalized utm can't reach the column.
  it("never stores a client-supplied claim that carries PII (adversary F1)", () => {
    // Each of these passes the charset filter but is NOT a recognized channel —
    // it must be dropped to null (unknown), never persisted.
    for (const pii of [
      "+15551234567", // phone
      "john.doe", // name
      "jane.doe:1987-03-04", // name + DOB
      "mrn:a938271", // medical record number
      "patient-ssn-078-05-1120", // SSN-shaped
    ]) {
      expect(deriveSubmissionSource({ bodySource: pii })).toBeNull();
      expect(deriveSubmissionSource({ utmSource: pii })).toBeNull();
    }
  });

  it("a client claim never outranks the server-observed referer unless it names a real channel (adversary F3)", () => {
    // Bot copies a submission and claims source=google; the referer proves the
    // visit is internal. "google" IS a known channel, so the honest floor is that
    // it can only ever claim a channel that exists — not an arbitrary string.
    expect(
      deriveSubmissionSource({
        bodySource: "definitely-not-a-channel",
        firstTouchReferer: "https://www.bing.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("bing"); // junk claim ignored → server classifies the real first touch
  });

  it("an unrecognized but plausible campaign label falls through to unknown (Value #6)", () => {
    expect(deriveSubmissionSource({ utmSource: "spring_promo_2026" })).toBeNull();
  });

  it("skips an INTERNAL referer given as a trailing-dot FQDN (adversary F4)", () => {
    expect(
      deriveSubmissionSource({
        referer: "https://drpavanendo.com./contact",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
  });

  it("skips an INTERNAL referer with a DOUBLE trailing dot (adversary N1)", () => {
    expect(
      deriveSubmissionSource({
        referer: "https://drpavanendo.com../contact",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
  });

  it("folds brand-abbreviation claims to one canonical channel (adversary N2)", () => {
    // fb / meta → facebook, x → twitter, yt → youtube, gmb → GBP — so the
    // by-source counts don't splinter across synonyms of the same channel.
    expect(deriveSubmissionSource({ utmSource: "fb" })).toBe("facebook");
    expect(deriveSubmissionSource({ utmSource: "meta" })).toBe("facebook");
    expect(deriveSubmissionSource({ utmSource: "x" })).toBe("twitter");
    expect(deriveSubmissionSource({ utmSource: "yt" })).toBe("youtube");
    expect(deriveSubmissionSource({ bodySource: "gmb" })).toBe(
      "google_business_profile",
    );
  });

  it("folds a hyphenated claim to its canonical channel (adversary N3)", () => {
    expect(deriveSubmissionSource({ utmSource: "google-ads" })).toBe("google_ads");
    expect(deriveSubmissionSource({ utmSource: "constant-contact" })).toBe(
      "constant_contact",
    );
  });

  it("recognizes the dental patient-comms stack as real channels (adversary N3)", () => {
    for (const tool of ["birdeye", "podium", "weave", "mailchimp"]) {
      expect(deriveSubmissionSource({ utmSource: tool })).toBe(tool);
    }
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
