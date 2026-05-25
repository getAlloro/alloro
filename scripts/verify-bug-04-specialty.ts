/**
 * BUG-04 live verification — competitor filtering specialty-aware.
 *
 * Runs a live discovery against Summit Endodontics SLC and verifies
 * that the returned competitor list contains ZERO general dentists.
 *
 * Usage:
 *   npx tsx scripts/verify-bug-04-specialty.ts
 *
 * Requires GOOGLE_PLACES_API env var.
 */

import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

import {
  discoverCompetitorsWithFallback,
  filterBySpecialty,
  discoverCompetitorsViaPlaces,
  DiscoveredCompetitor,
} from "../src/controllers/practice-ranking/feature-services/service.places-competitor-discovery";

const PRACTICE_NAME = "Summit Endodontics";
const MARKET = "Salt Lake City, UT";
const SPECIALTY = "endodontist";
const PRACTICE_COORDS = { lat: 40.7608, lng: -111.8910 }; // SLC

// A general dentist that should NEVER appear in an endodontist's competitor set.
function isGeneralDentist(c: DiscoveredCompetitor): boolean {
  const pt = (c.primaryType || "").toLowerCase();
  const cat = (c.category || "").toLowerCase();
  const name = (c.name || "").toLowerCase();
  const types = (c.types || []).map((t) => t.toLowerCase());

  // Allow specialists listed with primaryType="dentist" if their name/category
  // clearly signals endodontics — this is intended behavior per the filter
  // (Google often lists endo specialists under generic "dentist").
  const looksEndo =
    name.includes("endodont") ||
    name.includes("root canal") ||
    cat.includes("endodont") ||
    types.includes("endodontist");

  if (looksEndo) return false;

  // A "dentist" primaryType with no endo signal is a general dentist.
  if (pt === "dentist" || pt === "dental_clinic") return true;
  if (cat === "dentist" || cat === "dental clinic" || cat === "dental practice") return true;

  return false;
}

async function main() {
  if (!process.env.GOOGLE_PLACES_API) {
    console.error("GOOGLE_PLACES_API not set — cannot run live test");
    process.exit(2);
  }

  console.log("=".repeat(80));
  console.log("BUG-04 LIVE VERIFICATION");
  console.log("=".repeat(80));
  console.log(`Practice: ${PRACTICE_NAME}`);
  console.log(`Market:   ${MARKET}`);
  console.log(`Specialty: ${SPECIALTY}`);
  console.log(`Coords:   ${PRACTICE_COORDS.lat},${PRACTICE_COORDS.lng}`);
  console.log("");

  // ---------------------------------------------------------------------------
  // Step 1: Run the raw discovery (no filter) to see what Google returns
  // ---------------------------------------------------------------------------
  console.log("--- STEP 1: Raw Google Places results (no filter) ---");
  const rawCompetitors = await discoverCompetitorsViaPlaces(
    SPECIALTY,
    MARKET,
    20,
    { ...PRACTICE_COORDS, radiusMeters: 40234 },
  );
  console.log(`Got ${rawCompetitors.length} raw results`);
  rawCompetitors.forEach((c, i) => {
    console.log(
      `  ${(i + 1).toString().padStart(2)}. [${c.primaryType.padEnd(20)}] ${c.name} (${c.category})`,
    );
  });
  console.log("");

  // ---------------------------------------------------------------------------
  // Step 2: Apply filterBySpecialty directly
  // ---------------------------------------------------------------------------
  console.log("--- STEP 2: filterBySpecialty() output ---");
  const filtered = filterBySpecialty(rawCompetitors, SPECIALTY);
  console.log(`Filter kept ${filtered.length} of ${rawCompetitors.length}`);
  filtered.forEach((c, i) => {
    const flag = isGeneralDentist(c) ? " *** GENERAL DENTIST LEAK ***" : "";
    console.log(
      `  ${(i + 1).toString().padStart(2)}. [${c.primaryType.padEnd(20)}] ${c.name} (${c.category})${flag}`,
    );
  });
  console.log("");

  // ---------------------------------------------------------------------------
  // Step 3: Run the full discoverCompetitorsWithFallback (what the checkup uses)
  // ---------------------------------------------------------------------------
  console.log("--- STEP 3: discoverCompetitorsWithFallback() (production path) ---");
  const result = await discoverCompetitorsWithFallback(
    SPECIALTY,
    MARKET,
    20,
    { ...PRACTICE_COORDS, radiusMeters: 40234 },
  );
  console.log(
    `Total: ${result.competitors.length}, specialty matches: ${result.specialtyMatchCount}, ` +
      `broadened: ${result.broadened}, broaden category: ${result.broadeningCategory}`,
  );
  result.competitors.forEach((c, i) => {
    const isSpec = i < result.specialtyMatchCount;
    const tag = isSpec ? "SPECIALTY" : "BROADER ";
    const flag = isSpec && isGeneralDentist(c) ? " *** LEAK ***" : "";
    console.log(
      `  ${(i + 1).toString().padStart(2)}. [${tag}] [${c.primaryType.padEnd(20)}] ${c.name} (${c.category})${flag}`,
    );
  });
  console.log("");

  // ---------------------------------------------------------------------------
  // Step 4: Verdict
  // ---------------------------------------------------------------------------
  console.log("=".repeat(80));
  console.log("VERDICT");
  console.log("=".repeat(80));

  // Specialty-matched portion of the production path is what the doctor sees
  // as "your competitors." Broader fallback is acknowledged separately.
  const specialtyMatches = result.competitors.slice(0, result.specialtyMatchCount);
  const leaks = specialtyMatches.filter(isGeneralDentist);

  // Also evaluate the direct filterBySpecialty result for completeness.
  const directLeaks = filtered.filter(isGeneralDentist);

  console.log(`Specialty-matched competitors: ${specialtyMatches.length}`);
  console.log(`General-dentist leaks (specialty bucket): ${leaks.length}`);
  console.log(`General-dentist leaks (filterBySpecialty direct): ${directLeaks.length}`);

  const verdict = leaks.length === 0 && directLeaks.length === 0 ? "PASS" : "FAIL";
  console.log(`\nBUG-04 verdict: ${verdict}`);

  if (verdict === "FAIL") {
    console.log("\nLeaked entries:");
    [...leaks, ...directLeaks].forEach((c) => {
      console.log(
        `  - ${c.name} | primaryType=${c.primaryType} | category=${c.category} | types=${JSON.stringify(c.types)}`,
      );
    });
  }

  // Save proof file
  const proofDir = "/tmp";
  const proof = {
    timestamp: new Date().toISOString(),
    practice: PRACTICE_NAME,
    market: MARKET,
    specialty: SPECIALTY,
    coords: PRACTICE_COORDS,
    rawCount: rawCompetitors.length,
    filteredCount: filtered.length,
    productionCount: result.competitors.length,
    specialtyMatchCount: result.specialtyMatchCount,
    broadened: result.broadened,
    broadeningCategory: result.broadeningCategory,
    verdict,
    leaks: [...leaks, ...directLeaks].map((c) => ({
      name: c.name,
      primaryType: c.primaryType,
      category: c.category,
      types: c.types,
    })),
    raw: rawCompetitors.map((c) => ({
      name: c.name,
      primaryType: c.primaryType,
      category: c.category,
      reviewsCount: c.reviewsCount,
    })),
    filtered: filtered.map((c) => ({
      name: c.name,
      primaryType: c.primaryType,
      category: c.category,
      reviewsCount: c.reviewsCount,
    })),
    production: result.competitors.map((c, i) => ({
      bucket: i < result.specialtyMatchCount ? "specialty" : "broader",
      name: c.name,
      primaryType: c.primaryType,
      category: c.category,
      reviewsCount: c.reviewsCount,
    })),
  };
  const proofPath = path.join(proofDir, "bug-04-verification.json");
  fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));
  console.log(`\nProof file: ${proofPath}`);

  process.exit(verdict === "PASS" ? 0 : 1);
}

main().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(2);
});
