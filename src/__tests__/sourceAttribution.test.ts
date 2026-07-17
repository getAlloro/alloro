import { describe, expect, it } from "vitest";
import {
  deriveSubmissionSource,
  normalizeSource,
  hostOf,
  classifyReferrerHost,
  classifyExternalReferer,
  sourceConfidence,
  isSourceMethod,
  isVerifiedAttribution,
  SOURCE_METHOD_CONFIDENCE,
  type SourceSignals,
} from "../controllers/websiteContact/feature-utils/sourceAttribution";

/** The channel label only — for the many cases that assert the label alone. */
const sourceOf = (signals: SourceSignals) => deriveSubmissionSource(signals).source;

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
      sourceOf({
        bodySource: "google_business_profile",
        referer: "https://drpavan.sites.getalloro.com/contact",
        projectHosts: ownHosts,
      }),
    ).toBe("google_business_profile");
  });

  it("uses utmSource when there is no bodySource", () => {
    expect(sourceOf({ utmSource: "newsletter" })).toBe(
      "newsletter",
    );
  });

  it("falls through a junk bodySource to a valid utmSource (no signal loss)", () => {
    expect(
      sourceOf({ bodySource: "!!!", utmSource: "newsletter" }),
    ).toBe("newsletter");
  });

  it("returns null with no first-touch and no referer (unknown, not guessed)", () => {
    expect(sourceOf({})).toBeNull();
    expect(sourceOf({ referer: "" })).toBeNull();
    expect(
      sourceOf({ bodySource: null, utmSource: null, referer: null }),
    ).toBeNull();
  });

  it("returns null for an INTERNAL referer — the practice's own page is not a source", () => {
    expect(
      sourceOf({
        referer: "https://drpavan.sites.getalloro.com/services",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
    expect(
      sourceOf({
        referer: "https://www.drpavanendo.com/book",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
  });

  it("classifies a genuine cross-site referer when there is no first-touch", () => {
    expect(
      sourceOf({
        referer: "https://www.google.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("google");
    expect(
      sourceOf({
        referer: "https://www.yelp.com/biz/x",
        projectHosts: ownHosts,
      }),
    ).toBe("referral");
  });

  it("returns null for an unparseable/hostless referer (never guesses)", () => {
    expect(sourceOf({ referer: "javascript:void(0)" })).toBeNull();
    expect(sourceOf({ referer: "not a url" })).toBeNull();
  });

  // ── first-touch landing referrer (the real entry channel for organic/referral)
  it("classifies the first-touch landing referrer when there is no explicit label", () => {
    expect(
      sourceOf({
        firstTouchReferer: "https://www.google.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("google");
  });

  it("first-touch landing referrer beats the (internal) submit referer", () => {
    expect(
      sourceOf({
        firstTouchReferer: "https://www.google.com/",
        referer: "https://drpavan.sites.getalloro.com/contact",
        projectHosts: ownHosts,
      }),
    ).toBe("google");
  });

  it("an explicit utm label still beats the first-touch referrer", () => {
    expect(
      sourceOf({
        utmSource: "newsletter",
        firstTouchReferer: "https://www.google.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("newsletter");
  });

  it("an INTERNAL first-touch referrer is skipped, falling to the submit referer", () => {
    expect(
      sourceOf({
        firstTouchReferer: "https://drpavan.sites.getalloro.com/home",
        referer: "https://www.facebook.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("facebook");
  });

  it("an unparseable first-touch referrer is skipped (never guesses)", () => {
    expect(
      sourceOf({
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
      expect(sourceOf({ bodySource: pii })).toBeNull();
      expect(sourceOf({ utmSource: pii })).toBeNull();
    }
  });

  it("a client claim never outranks the server-observed referer unless it names a real channel (adversary F3)", () => {
    // Bot copies a submission and claims source=google; the referer proves the
    // visit is internal. "google" IS a known channel, so the honest floor is that
    // it can only ever claim a channel that exists — not an arbitrary string.
    expect(
      sourceOf({
        bodySource: "definitely-not-a-channel",
        firstTouchReferer: "https://www.bing.com/",
        projectHosts: ownHosts,
      }),
    ).toBe("bing"); // junk claim ignored → server classifies the real first touch
  });

  it("an unrecognized but plausible campaign label falls through to unknown (Value #6)", () => {
    expect(sourceOf({ utmSource: "spring_promo_2026" })).toBeNull();
  });

  it("skips an INTERNAL referer given as a trailing-dot FQDN (adversary F4)", () => {
    expect(
      sourceOf({
        referer: "https://drpavanendo.com./contact",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
  });

  it("skips an INTERNAL referer with a DOUBLE trailing dot (adversary N1)", () => {
    expect(
      sourceOf({
        referer: "https://drpavanendo.com../contact",
        projectHosts: ownHosts,
      }),
    ).toBeNull();
  });

  it("folds brand-abbreviation claims to one canonical channel (adversary N2)", () => {
    // fb / meta → facebook, x → twitter, yt → youtube, gmb → GBP — so the
    // by-source counts don't splinter across synonyms of the same channel.
    expect(sourceOf({ utmSource: "fb" })).toBe("facebook");
    expect(sourceOf({ utmSource: "meta" })).toBe("facebook");
    expect(sourceOf({ utmSource: "x" })).toBe("twitter");
    expect(sourceOf({ utmSource: "yt" })).toBe("youtube");
    expect(sourceOf({ bodySource: "gmb" })).toBe(
      "google_business_profile",
    );
  });

  it("folds a hyphenated claim to its canonical channel (adversary N3)", () => {
    expect(sourceOf({ utmSource: "google-ads" })).toBe("google_ads");
    expect(sourceOf({ utmSource: "constant-contact" })).toBe(
      "constant_contact",
    );
  });

  it("recognizes the dental patient-comms stack as real channels (adversary N3)", () => {
    for (const tool of ["birdeye", "podium", "weave", "mailchimp"]) {
      expect(sourceOf({ utmSource: tool })).toBe(tool);
    }
  });
});

// ── Provenance (§5.2): the label is WHAT we believe, the method is WHY. Stored
//    apart so a browser's claim never inherits a classification's authority.
describe("deriveSubmissionSource — provenance", () => {
  const ownHosts = ["drpavan.sites.getalloro.com", "drpavanendo.com"];

  it("records a body/utm label as a CLIENT CLAIM, never as a classification", () => {
    expect(deriveSubmissionSource({ bodySource: "facebook" })).toEqual({
      source: "facebook",
      method: "client_label",
    });
    expect(deriveSubmissionSource({ utmSource: "newsletter" })).toEqual({
      source: "newsletter",
      method: "client_label",
    });
  });

  it("records a first-touch landing referrer as client_referrer (our label, their input)", () => {
    expect(
      deriveSubmissionSource({
        firstTouchReferer: "https://www.google.com/",
        projectHosts: ownHosts,
      }),
    ).toEqual({ source: "google", method: "client_referrer" });
  });

  it("records the submit Referer header as header_referrer", () => {
    expect(
      deriveSubmissionSource({
        referer: "https://www.facebook.com/",
        projectHosts: ownHosts,
      }),
    ).toEqual({ source: "facebook", method: "header_referrer" });
  });

  it("THE REVIEW FINDING: an identical label keeps a DIFFERENT method per signal", () => {
    // Same channel word, three different kinds of evidence. Before provenance was
    // stored these were indistinguishable on the row, so a report could present a
    // visitor's claim as verified attribution. They must never collapse again.
    const claimed = deriveSubmissionSource({ bodySource: "google" });
    const classifiedFromBody = deriveSubmissionSource({
      firstTouchReferer: "https://www.google.com/",
      projectHosts: ownHosts,
    });
    const classifiedFromHeader = deriveSubmissionSource({
      referer: "https://www.google.com/",
      projectHosts: ownHosts,
    });

    expect(claimed.source).toBe("google");
    expect(classifiedFromBody.source).toBe("google");
    expect(classifiedFromHeader.source).toBe("google");

    expect(claimed.method).toBe("client_label");
    expect(classifiedFromBody.method).toBe("client_referrer");
    expect(classifiedFromHeader.method).toBe("header_referrer");

    expect(sourceConfidence(claimed.method)).toBe("claimed");
    expect(sourceConfidence(classifiedFromBody.method)).toBe("claimed");
    expect(sourceConfidence(classifiedFromHeader.method)).toBe("observed");
  });

  it("a winning client claim does NOT inherit the referrer's method", () => {
    // The claim takes precedence (it is the real first touch) but stays a CLAIM —
    // precedence is not promotion.
    expect(
      deriveSubmissionSource({
        bodySource: "newsletter",
        firstTouchReferer: "https://www.google.com/",
        referer: "https://www.bing.com/",
        projectHosts: ownHosts,
      }),
    ).toEqual({ source: "newsletter", method: "client_label" });
  });

  it("a junk claim falls through and the method follows the signal that won", () => {
    expect(
      deriveSubmissionSource({
        bodySource: "definitely-not-a-channel",
        firstTouchReferer: "https://www.bing.com/",
        projectHosts: ownHosts,
      }),
    ).toEqual({ source: "bing", method: "client_referrer" });
  });

  it("unknown carries a null method — no provenance is invented either", () => {
    expect(deriveSubmissionSource({})).toEqual({ source: null, method: null });
    expect(
      deriveSubmissionSource({
        referer: "https://drpavanendo.com/book",
        projectHosts: ownHosts,
      }),
    ).toEqual({ source: null, method: null });
  });

  it("INVARIANT: method is null if and only if source is null", () => {
    const cases: SourceSignals[] = [
      {},
      { bodySource: "facebook" },
      { utmSource: "spring_promo_2026" }, // unrecognized → unknown
      { utmSource: "gmb" },
      { firstTouchReferer: "https://www.google.com/" },
      { firstTouchReferer: "not a url" },
      { referer: "https://www.yelp.com/biz/x" },
      { referer: "https://drpavanendo.com/x", projectHosts: ownHosts },
    ];
    for (const signals of cases) {
      const { source, method } = deriveSubmissionSource(signals);
      expect(method === null).toBe(source === null);
    }
  });
});

describe("source confidence — no submission source is verified attribution", () => {
  it("maps each method to its honest tier", () => {
    expect(sourceConfidence("client_label")).toBe("claimed");
    expect(sourceConfidence("client_referrer")).toBe("claimed");
    expect(sourceConfidence("header_referrer")).toBe("observed");
  });

  it("treats a null/unrecognized stored method as unknown — never upgrades it", () => {
    expect(sourceConfidence(null)).toBe("unknown");
    expect(sourceConfidence(undefined)).toBe("unknown");
    expect(sourceConfidence("")).toBe("unknown");
    expect(sourceConfidence("verified")).toBe("unknown"); // a value we never write
    expect(sourceConfidence("server_classified")).toBe("unknown");
    expect(sourceConfidence(42)).toBe("unknown");
  });

  it("never grades any method as verified — the endpoint is public (Value #6)", () => {
    for (const method of Object.keys(SOURCE_METHOD_CONFIDENCE)) {
      expect(isVerifiedAttribution(method)).toBe(false);
      expect(sourceConfidence(method)).not.toBe("verified");
    }
    expect(isVerifiedAttribution(null)).toBe(false);
    expect(isVerifiedAttribution("header_referrer")).toBe(false);
  });

  it("isSourceMethod guards what a row hands back", () => {
    expect(isSourceMethod("client_label")).toBe(true);
    expect(isSourceMethod("client_referrer")).toBe(true);
    expect(isSourceMethod("header_referrer")).toBe(true);
    expect(isSourceMethod("google")).toBe(false); // a LABEL is not a method
    expect(isSourceMethod(null)).toBe(false);
    expect(isSourceMethod(undefined)).toBe(false);
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
