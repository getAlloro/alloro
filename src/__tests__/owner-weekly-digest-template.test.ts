/**
 * Owner Weekly Digest template — presentation + honesty (Value #6).
 *
 * The template renders only the facts it is handed: no fabricated change
 * figure, no promise, and an honest "not connected yet" instead of a zero for a
 * source that is not wired. §20.4 — all data synthetic.
 */

import { describe, it, expect } from "vitest";
import {
  buildOwnerWeeklyDigestContent,
  buildOwnerWeeklyDigestEmail,
  type OwnerWeeklyDigestData,
} from "../emails/templates/OwnerWeeklyDigest";

function baseData(
  overrides: Partial<OwnerWeeklyDigestData> = {}
): OwnerWeeklyDigestData {
  return {
    organizationName: "One Endodontics",
    recipientName: "Dr. Rivera",
    periodLabel: "Jul 14–21",
    work: {
      total: 3,
      localPosts: 2,
      reviewReplies: 1,
      businessInfoUpdates: 0,
      recentItems: [
        { label: "Google post published", date: "Jul 21" },
        { label: "Review reply posted", date: "Jul 19" },
      ],
    },
    funnel: {
      monthLabel: "July 2026",
      gates: [
        { label: "Google Visibility", metaLabel: "How often you showed up on Google", value: 1436, available: true },
        { label: "Website Visitors", metaLabel: "Website visitors", value: 275, available: true },
        { label: "Website Leads", metaLabel: "Verified submissions", value: 7, available: true },
      ],
    },
    dashboardUrl: "https://app.getalloro.com/dashboard",
    ...overrides,
  };
}

describe("OwnerWeeklyDigest — content", () => {
  it("renders the org name, period, greeting, and past-tense work summary", () => {
    const html = buildOwnerWeeklyDigestContent(baseData());
    expect(html).toContain("One Endodontics");
    expect(html).toContain("Jul 14–21");
    expect(html).toContain("Hi Dr. Rivera,");
    expect(html).toContain("Alloro did this week");
    // Past tense, only the nonzero parts, correctly pluralized.
    expect(html).toContain("Alloro published 2 Google posts and 1 review reply for you");
  });

  it("names all three work types when present, so the sentence matches the item list", () => {
    const html = buildOwnerWeeklyDigestContent(
      baseData({
        work: {
          total: 5,
          localPosts: 2,
          reviewReplies: 1,
          businessInfoUpdates: 2,
          recentItems: [{ label: "Business info updated", date: "Jul 18" }],
        },
      })
    );
    expect(html).toContain(
      "Alloro published 2 Google posts, 1 review reply, and 2 business-info updates for you"
    );
  });

  it("lists the dated work items", () => {
    const html = buildOwnerWeeklyDigestContent(baseData());
    expect(html).toContain("Google post published");
    expect(html).toContain("Jul 21");
    expect(html).toContain("Review reply posted");
  });

  it("renders each funnel gate value in impressions → visits → leads order", () => {
    const html = buildOwnerWeeklyDigestContent(baseData());
    const impressionsAt = html.indexOf("Google Visibility");
    const visitsAt = html.indexOf("Website Visitors");
    const leadsAt = html.indexOf("Website Leads");
    expect(impressionsAt).toBeGreaterThan(-1);
    expect(impressionsAt).toBeLessThan(visitsAt);
    expect(visitsAt).toBeLessThan(leadsAt);
    // Numbers are locale-formatted, never invented.
    expect(html).toContain("1,436");
    expect(html).toContain("275");
  });

  it("shows an honest 'not connected yet' for an unavailable gate instead of a zero", () => {
    const html = buildOwnerWeeklyDigestContent(
      baseData({
        funnel: {
          monthLabel: "July 2026",
          gates: [
            { label: "Google Visibility", metaLabel: "How often you showed up on Google", value: null, available: false },
            { label: "Website Visitors", metaLabel: "Website visitors", value: 275, available: true },
            { label: "Website Leads", metaLabel: "Verified submissions", value: 7, available: true },
          ],
        },
      })
    );
    expect(html).toContain("Not connected yet");
  });

  it("states plainly when nothing was published, never a fabricated total", () => {
    const html = buildOwnerWeeklyDigestContent(
      baseData({
        work: { total: 0, localPosts: 0, reviewReplies: 0, businessInfoUpdates: 0, recentItems: [] },
      })
    );
    // The sentence is HTML-escaped in the body, so the apostrophe renders as &#39;.
    expect(html).toContain("Alloro didn&#39;t publish anything new for you this week.");
  });

  it("makes no promise and no fabricated change figure (Value #6)", () => {
    const html = buildOwnerWeeklyDigestContent(baseData()).toLowerCase();
    expect(html).not.toMatch(/\+\s*\d/); // no "+5" style deltas
    expect(html).not.toContain("guarantee");
    expect(html).not.toContain("we will");
    expect(html).not.toContain("you'll get");
    expect(html).not.toContain("expect to");
  });

  it("escapes HTML in the org name (no injection)", () => {
    const html = buildOwnerWeeklyDigestContent(
      baseData({ organizationName: "<script>alert(1)</script>" })
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("omits the greeting when no recipient name is given", () => {
    const html = buildOwnerWeeklyDigestContent(
      baseData({ recipientName: undefined })
    );
    expect(html).not.toContain("Hi ");
  });
});

describe("OwnerWeeklyDigest — email payload", () => {
  it("builds a subject naming the practice and an empty recipient list for the caller to fill", () => {
    const email = buildOwnerWeeklyDigestEmail(baseData());
    expect(email.subject).toBe("Your week with Alloro — One Endodontics");
    expect(email.recipients).toEqual([]);
    expect(email.preheader && email.preheader.length).toBeGreaterThan(0);
    expect(email.body).toContain("<!DOCTYPE html");
  });
});
