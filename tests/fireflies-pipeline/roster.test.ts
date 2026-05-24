import { describe, test, expect } from "vitest";
import {
  CUSTOMER_ROSTER,
  matchTranscriptToCustomers,
  lookupRosterEntry,
  rosterAsPromptList,
} from "../../src/services/fireflies-pipeline/roster";

describe("Customer Roster", () => {
  test("contains all 5 current Section 2 customers", () => {
    const names = CUSTOMER_ROSTER.map((c) => c.canonical_name).sort();
    expect(names).toEqual([
      "Artful Orthodontics",
      "Caswell Orthodontics",
      "Coastal Endodontic Studio",
      "Garrison Orthodontics",
      "One Endodontics",
    ]);
  });

  test("matches transcript text containing exact customer name", () => {
    const matched = matchTranscriptToCustomers(
      "Call with Garrison Orthodontics about new dashboard",
    );
    expect(matched.map((m) => m.canonical_name)).toEqual([
      "Garrison Orthodontics",
    ]);
  });

  test("matches via shorthand recognition terms (1Endo, Saif)", () => {
    const matched = matchTranscriptToCustomers(
      "Saif called about 1Endo contract resolution",
    );
    expect(matched.map((m) => m.canonical_name)).toEqual(["One Endodontics"]);
  });

  test("matches via doctor first name (Caroline)", () => {
    const matched = matchTranscriptToCustomers(
      "Caroline mentioned the dashboard period is stuck",
    );
    expect(matched.map((m) => m.canonical_name)).toEqual([
      "Artful Orthodontics",
    ]);
  });

  test("matches via doctor name with title (Dr. Fu)", () => {
    const matched = matchTranscriptToCustomers(
      "Dr. Fu walked through the data import",
    );
    expect(matched.map((m) => m.canonical_name)).toEqual([
      "Coastal Endodontic Studio",
    ]);
  });

  test("matches multiple customers in joint-call transcript", () => {
    const matched = matchTranscriptToCustomers(
      "Joint review: Garrison and Caswell both on the call",
    );
    expect(matched.map((m) => m.canonical_name).sort()).toEqual([
      "Caswell Orthodontics",
      "Garrison Orthodontics",
    ]);
  });

  test("returns empty array when no roster customer matches", () => {
    const matched = matchTranscriptToCustomers(
      "Alloro internal standup about sprint planning",
    );
    expect(matched).toEqual([]);
  });

  test("is case-insensitive", () => {
    const matched = matchTranscriptToCustomers("GARRISON orthodontics");
    expect(matched.map((m) => m.canonical_name)).toEqual([
      "Garrison Orthodontics",
    ]);
  });

  test("lookupRosterEntry returns entry by canonical name", () => {
    const entry = lookupRosterEntry("One Endodontics");
    expect(entry?.canonical_name).toBe("One Endodontics");
    expect(entry?.section_2_block_id).toBe(
      "17478b34-7a18-4b39-8518-07fcf7607cdd",
    );
  });

  test("lookupRosterEntry is case-insensitive", () => {
    expect(lookupRosterEntry("one endodontics")?.canonical_name).toBe(
      "One Endodontics",
    );
    expect(lookupRosterEntry("CASWELL ORTHODONTICS")?.canonical_name).toBe(
      "Caswell Orthodontics",
    );
  });

  test("lookupRosterEntry returns null for non-roster name (hallucination guard)", () => {
    expect(lookupRosterEntry("Fake Practice")).toBeNull();
    expect(lookupRosterEntry("")).toBeNull();
  });

  test("rosterAsPromptList renders comma-separated canonical names", () => {
    const list = rosterAsPromptList();
    expect(list).toContain("One Endodontics");
    expect(list).toContain("Caswell Orthodontics");
    expect(list.split(", ").length).toBe(5);
  });
});
