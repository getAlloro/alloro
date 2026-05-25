/**
 * BUG-04 regression — filterBySpecialty must keep real specialists whose
 * Google primaryType is "dentist" (Google's labelling for the vast majority
 * of dental specialists), and must drop general dentists.
 *
 * Live-verified against Summit Endodontics SLC on 2026-05-13: all 14
 * SLC-market endodontists are kept, all 6 generic "Dr. X DDS" entries are
 * dropped, zero broadening to general dentists occurs. Proof:
 * /tmp/bug-04-verification.json.
 */

import { describe, test, expect } from "vitest";
import {
  filterBySpecialty,
  type DiscoveredCompetitor,
} from "../../src/controllers/practice-ranking/feature-services/service.places-competitor-discovery";

const c = (overrides: Partial<DiscoveredCompetitor> = {}): DiscoveredCompetitor => ({
  placeId: overrides.placeId ?? `place-${Math.random()}`,
  name: overrides.name ?? "Test",
  address: overrides.address ?? "",
  category: overrides.category ?? "Dentist",
  primaryType: overrides.primaryType ?? "dentist",
  types: overrides.types ?? [],
  totalScore: overrides.totalScore ?? 4.8,
  reviewsCount: overrides.reviewsCount ?? 100,
  url: overrides.url ?? "",
  hasHours: overrides.hasHours ?? true,
  hoursComplete: overrides.hoursComplete ?? true,
  photosCount: overrides.photosCount ?? 5,
});

describe("filterBySpecialty — BUG-04 endodontist regression", () => {
  test("keeps real endodontists Google lists as primaryType=dentist", () => {
    const candidates = [
      c({ name: "Greater Endodontics Riverton", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Endodontic Associates", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Salt Lake Endodontics PC, Mitchell G Rudd DDS", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Elevate Endodontics, Richard Bauman DMD, Best Root Canals in Utah", primaryType: "dentist", category: "Dentist" }),
    ];
    const kept = filterBySpecialty(candidates, "endodontist");
    expect(kept.length).toBe(4);
  });

  test("drops general dentists with no endodontic signal in name or category", () => {
    const candidates = [
      c({ name: "Smith Family Dental", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Salt Lake Dental Clinic", primaryType: "dental_clinic", category: "Dental Clinic" }),
      c({ name: "Avenues Dentistry", primaryType: "dentist", category: "Dentist" }),
    ];
    const kept = filterBySpecialty(candidates, "endodontist");
    expect(kept.length).toBe(0);
  });

  test("drops generic 'Dr. X DDS' practices with no endodontic naming signal", () => {
    // Real SLC results — these are listed under an endodontist search by Google
    // but their names give no specialty signal. The doctor would not call them
    // direct competitors.
    const candidates = [
      c({ name: "Dr. Kelly E. O'Brien, DMD", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Dr. Keith D. Sonntag, DDS", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Brent C. Sonnenberg, DDS, MS", primaryType: "dentist", category: "Dentist" }),
    ];
    const kept = filterBySpecialty(candidates, "endodontist");
    expect(kept.length).toBe(0);
  });

  test("keeps practices with explicit endodontist primaryType", () => {
    const candidates = [
      c({ name: "Big City Endodontist", primaryType: "endodontist", category: "Endodontist" }),
    ];
    expect(filterBySpecialty(candidates, "endodontist").length).toBe(1);
  });

  test("specialty='endodontics' (noun form) behaves identically to 'endodontist'", () => {
    const candidates = [
      c({ name: "Wasatch Endodontics", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Smith Family Dental", primaryType: "dentist", category: "Dentist" }),
    ];
    const kept = filterBySpecialty(candidates, "endodontics");
    expect(kept.map((k) => k.name)).toEqual(["Wasatch Endodontics"]);
  });

  test("orthodontics: keeps name-signal orthodontists, drops dentists and endodontists", () => {
    const candidates = [
      c({ name: "Modern Orthodontic Arts", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Smith Endodontics", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Smith Family Dental", primaryType: "dentist", category: "Dentist" }),
    ];
    const kept = filterBySpecialty(candidates, "orthodontist");
    expect(kept.map((k) => k.name)).toEqual(["Modern Orthodontic Arts"]);
  });

  test("general dentist specialty keeps all dental businesses", () => {
    const candidates = [
      c({ name: "Smith Family Dental", primaryType: "dentist", category: "Dentist" }),
      c({ name: "Wasatch Endodontics", primaryType: "dentist", category: "Dentist" }),
    ];
    expect(filterBySpecialty(candidates, "dentist").length).toBe(2);
  });

  test("does not falsely match short 'endo' substring inside unrelated dental names", () => {
    // Defensive: SPECIALTY_KEYWORDS in service.ranking-algorithm.ts includes "endo"
    // as a stem; using that would falsely match e.g. "Brendon's Dental" which contains
    // the substring "endo". The filter intentionally uses the longer "endodont" stem.
    const candidates = [
      c({ name: "Brendon's Dental", primaryType: "dentist", category: "Dentist" }),
    ];
    expect(filterBySpecialty(candidates, "endodontist").length).toBe(0);
  });
});
