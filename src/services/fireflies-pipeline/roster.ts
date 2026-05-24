/**
 * Customer Roster
 *
 * Source of truth for "which customers does the Fireflies pipeline care
 * about?" The pipeline filters out transcripts whose attendees do not
 * intersect this roster (per spec section 3, "Filter").
 *
 * Today the roster is hard-coded from State of Now Section 2 (5 customers).
 * Future work: parse Section 2 bullets at run time so adding a customer to
 * the substrate is enough to enroll them. For the MVP, the explicit list
 * makes the filter behavior easy to reason about and easy to test.
 *
 * Each entry maps a canonical customer name (matching the Section 2 bullet
 * prefix and the Fireflies Proposals DB select option) to a list of
 * recognition strings the extractor looks for in transcript attendee lists
 * and transcript content (titles, body).
 */

import { SECTION_2_CUSTOMER_BLOCKS } from "./constants";

export interface CustomerRosterEntry {
  /** Canonical name; matches Section 2 bullet prefix and DB select option. */
  canonical_name: string;
  /** Block ID of this customer's bullet in Section 2 (committer replaces). */
  section_2_block_id: string;
  /** Strings the extractor looks for to recognize this customer in transcripts.
   *  Case-insensitive substring match. Include practice name variants, doctor
   *  first/last names, common email-domain hints, and known shorthand. */
  recognition_terms: string[];
}

export const CUSTOMER_ROSTER: CustomerRosterEntry[] = [
  {
    canonical_name: "One Endodontics",
    section_2_block_id: SECTION_2_CUSTOMER_BLOCKS["One Endodontics"]!,
    recognition_terms: [
      "one endodontics",
      "1endo",
      "one endo",
      "saif",
      "fredericksburg",
      "@1endo.",
    ],
  },
  {
    canonical_name: "Artful Orthodontics",
    section_2_block_id: SECTION_2_CUSTOMER_BLOCKS["Artful Orthodontics"]!,
    recognition_terms: [
      "artful orthodontics",
      "artful ortho",
      "artful x alloro",
      "artfulorthodontics",
      "caroline",
      "pawlak",
      "pavlak",
      "winter garden",
    ],
  },
  {
    canonical_name: "Caswell Orthodontics",
    section_2_block_id: SECTION_2_CUSTOMER_BLOCKS["Caswell Orthodontics"]!,
    recognition_terms: [
      "caswell orthodontics",
      "caswell ortho",
      "caswell",
      "erin",
    ],
  },
  {
    canonical_name: "Garrison Orthodontics",
    section_2_block_id: SECTION_2_CUSTOMER_BLOCKS["Garrison Orthodontics"]!,
    recognition_terms: ["garrison orthodontics", "garrison ortho", "garrison"],
  },
  {
    canonical_name: "Coastal Endodontic Studio",
    section_2_block_id: SECTION_2_CUSTOMER_BLOCKS["Coastal Endodontic Studio"]!,
    recognition_terms: [
      "coastal endodontic studio",
      "coastal endo",
      "jonathan fu",
      "dr. fu",
      "dr fu",
    ],
  },
];

const ROSTER_BY_NAME: Map<string, CustomerRosterEntry> = new Map(
  CUSTOMER_ROSTER.map((e) => [e.canonical_name.toLowerCase(), e]),
);

/**
 * Match a transcript to one or more customers in the roster.
 * Checks attendee names and the transcript title + summary (when present).
 * Returns an array because a joint call (rare per spec) may match multiple.
 */
export function matchTranscriptToCustomers(
  searchableText: string,
): CustomerRosterEntry[] {
  const haystack = searchableText.toLowerCase();
  const matched = new Set<CustomerRosterEntry>();
  for (const entry of CUSTOMER_ROSTER) {
    for (const term of entry.recognition_terms) {
      if (haystack.includes(term)) {
        matched.add(entry);
        break;
      }
    }
  }
  return Array.from(matched);
}

/**
 * Look up a customer by canonical name. Returns null if the name is not in
 * the roster (extractor uses this for the roster-cross-check failure mode
 * in spec section 8: extractor hallucinates a customer not in roster).
 */
export function lookupRosterEntry(
  canonicalName: string,
): CustomerRosterEntry | null {
  return ROSTER_BY_NAME.get(canonicalName.toLowerCase()) ?? null;
}

/**
 * Roster names as a comma-separated string, suitable for embedding in the
 * extractor system prompt so the LLM knows which customer names are valid.
 */
export function rosterAsPromptList(): string {
  return CUSTOMER_ROSTER.map((e) => e.canonical_name).join(", ");
}
