import express from "express";
import rateLimit from "express-rate-limit";
import {
  discoverCompetitorsViaPlaces,
  discoverCompetitorsWithFallback,
  filterBySpecialty,
} from "../controllers/practice-ranking/feature-services/service.places-competitor-discovery";
import { filterByDriveTime } from "../utils/driveTimeMarket";
import bcrypt from "bcrypt";
import { OrganizationModel } from "../models/OrganizationModel";
import { UserModel } from "../models/UserModel";
import { OrganizationUserModel } from "../models/OrganizationUserModel";
import { generateReferralCode } from "../utils/referralCode";
import { generateToken } from "../controllers/auth-otp/feature-services/service.jwt-management";
import { sendCheckupResultEmail } from "../emails/templates/CheckupResultEmail";
import { sendWelcomeCheckupEmail } from "../emails/templates/WelcomeCheckupEmail";
import { BehavioralEventModel } from "../models/BehavioralEventModel";
import { analyzeReviewSentiment } from "../services/reviewSentiment";
import { generateOzMoments, type OzMoment } from "../services/ozMoment";
import { generateSurpriseFindings, type SurpriseFinding } from "../services/surpriseFindings";
import { extractReviewThemes, type ThemeExtractionResult } from "../services/reviewThemeExtractor";
import { db } from "../database/connection";
import { getMindsQueue } from "../workers/queues";
import { detectPreset } from "../services/vocabularyAutoMapper";
import { attributeCheckupToOrg } from "../services/firstPatientAttribution";
import { trackReferralSignup } from "../services/referralReward";
import { getPlaceDetails } from "../controllers/places/feature-services/GooglePlacesApiService";

// Scoring config imported from single source of truth
import { REVIEW_VOLUME_BENCHMARKS, COMPETITIVE_RADII_MILES, getScoreLabel } from "../services/businessMetrics";

/**
 * Derive the real specialty from the business name.
 * Google Places lumps all dental specialists under "Dentist", so we inspect the
 * business name for specialty keywords before falling back to the Google category.
 */
function deriveSpecialtyFromName(name: string, category: string): string {
  const n = name.toLowerCase();

  const rules: Array<{ keywords: string[]; specialty: string }> = [
    // Dental specialties (Google calls them all "Dentist")
    // Note: "endo" without trailing space catches "Surf City Endo" at end of name
    { keywords: ["endodontic", "endo"],                      specialty: "endodontist" },
    { keywords: ["orthodontic", "ortho "],                   specialty: "orthodontist" },
    { keywords: ["periodontic", "perio "],                   specialty: "periodontist" },
    { keywords: ["prosthodontic"],                           specialty: "prosthodontist" },
    { keywords: ["pediatric dent", "children"],              specialty: "pediatric dentist" },
    { keywords: ["oral surg"],                               specialty: "oral surgeon" },
    // Medical
    { keywords: ["oculofacial", "oculoplastic"],             specialty: "oculofacial surgeon" },
    { keywords: ["facial plastic"],                          specialty: "plastic surgeon" },
    { keywords: ["med spa", "medspa", "medical spa", "aesthetics"], specialty: "med spa" },
    { keywords: ["chiropractic", "chiropractor"],            specialty: "chiropractor" },
    { keywords: ["optometr", "eye care", "vision"],          specialty: "optometrist" },
    { keywords: ["veterinar", "animal", "pet"],              specialty: "veterinarian" },
    // Personal services
    { keywords: ["barber"],                                  specialty: "barber" },
    { keywords: ["physical therap", "pt "],                  specialty: "physical therapist" },
    // Landscape / outdoor
    { keywords: ["garden design", "landscape design"],       specialty: "garden designer" },
    { keywords: ["landscap"],                                specialty: "landscaper" },
    // Professional services
    { keywords: ["law ", "attorney", "legal"],               specialty: "attorney" },
    { keywords: ["cpa", "accounting", "tax"],                specialty: "accountant" },
    { keywords: ["photograph"],                              specialty: "photographer" },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((kw) => n.includes(kw))) {
      return rule.specialty;
    }
  }

  // No name match, fall back to Google category, then generic
  return category || "local business";
}

const checkupRoutes = express.Router();

// Rate limiters — protect Google Places API costs and email abuse
import {
  checkupAnalyzeLimiter as analyzeLimiter,
  checkupCreateAccountLimiter,
  scraperDetection,
} from "../middleware/publicRateLimiter";
import logger from "../lib/logger";

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Too many requests. Please try again later." },
});

/**
 * GET /api/checkup/geo
 *
 * Returns approximate lat/lng from the request IP address.
 * Used for autocomplete location biasing without triggering a browser
 * geolocation permission popup. Silent, private, no user interaction.
 */
checkupRoutes.get("/geo", async (req, res) => {
  try {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket.remoteAddress
      || "";

    // Skip private/localhost IPs
    if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
      return res.json({ lat: null, lng: null });
    }

    // Try multiple geolocation services with fast fallback
    const geoServices = [
      // ip-api.com: free, no key required, 45 req/min
      async () => {
        const r = await fetch(`http://ip-api.com/json/${ip}?fields=lat,lon`, { signal: AbortSignal.timeout(2000) });
        const d = await r.json();
        return d.lat && d.lon ? { lat: d.lat, lng: d.lon } : null;
      },
      // ipapi.co: free tier, sometimes rate-limited
      async () => {
        const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2000) });
        const d = await r.json();
        return d.latitude && d.longitude ? { lat: d.latitude, lng: d.longitude } : null;
      },
    ];

    for (const service of geoServices) {
      try {
        const result = await service();
        if (result) return res.json(result);
      } catch {
        continue;
      }
    }

    return res.json({ lat: null, lng: null });
  } catch {
    return res.json({ lat: null, lng: null });
  }
});

/**
 * POST /api/checkup/analyze
 *
 * Runs a competitor analysis for the Free Referral Base Checkup.
 * Takes a practice's Place details, discovers competitors via Google Places,
 * and returns a Business Clarity Score with sub-scores.
 *
 * Body: { name, city, state, category, types, rating, reviewCount, placeId }
 */
checkupRoutes.post("/analyze", analyzeLimiter, scraperDetection, async (req, res) => {
  try {
    const { name, city, state, category, types, rating, reviewCount, placeId, location, session_id } =
      req.body;

    if (!name || !city) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: name, city",
      });
    }

    const marketLocation = state ? `${city}, ${state}` : city;

    // Log scan start (funnel measurement) -- session_id links to downstream events
    BehavioralEventModel.create({
      event_type: "checkup.scan_started",
      session_id: session_id || null,
      properties: { name, city, category: category || null, placeId: placeId || null },
    }).catch(() => {});
    const specialty = deriveSpecialtyFromName(name, category || "");

    // Specialty-aware economics: avgCaseValue per new customer/case.
    // Sources: ADA, ASPS, AmSpa, Clio, NAR, AVMA, Housecall Pro, AICPA (2025 data).
    // These are DEFAULTS. The settings page allows business owners to personalize.
    // Universal: any GBP-listed business type can run a checkup.
    const specialtyEconomics: Record<string, { avgCaseValue: number; conversionRate: number }> = {
      // Healthcare -- per case/treatment (what the owner sees on their P&L)
      endodontist: { avgCaseValue: 1400, conversionRate: 0.02 },        // Root canal per tooth
      orthodontist: { avgCaseValue: 5500, conversionRate: 0.015 },      // Full treatment (braces/Invisalign)
      "general dentist": { avgCaseValue: 275, conversionRate: 0.03 },   // Per visit (exam + services)
      dentist: { avgCaseValue: 275, conversionRate: 0.03 },
      chiropractor: { avgCaseValue: 65, conversionRate: 0.05 },         // Per visit (adjustment)
      "physical therapist": { avgCaseValue: 106, conversionRate: 0.03 },// Per visit (net collections)
      optometrist: { avgCaseValue: 475, conversionRate: 0.025 },        // Exam + optical
      veterinarian: { avgCaseValue: 275, conversionRate: 0.03 },        // Per visit (blended)
      "med spa": { avgCaseValue: 500, conversionRate: 0.025 },          // Per treatment (AmSpa 2024)
      medspa: { avgCaseValue: 500, conversionRate: 0.025 },
      dermatologist: { avgCaseValue: 350, conversionRate: 0.02 },       // Blended medical + cosmetic
      "plastic surgeon": { avgCaseValue: 8000, conversionRate: 0.01 },  // Per procedure (ASPS)
      "oculofacial surgeon": { avgCaseValue: 7000, conversionRate: 0.01 }, // Per procedure (blepharoplasty avg)
      // Professional services -- per case/engagement
      attorney: { avgCaseValue: 3500, conversionRate: 0.015 },          // Per matter (Clio 2025)
      lawyer: { avgCaseValue: 3500, conversionRate: 0.015 },
      accountant: { avgCaseValue: 2500, conversionRate: 0.015 },        // Annual client value
      cpa: { avgCaseValue: 2500, conversionRate: 0.015 },
      "financial advisor": { avgCaseValue: 5000, conversionRate: 0.01 },// Annual client (1% on $500K AUM)
      "real estate agent": { avgCaseValue: 11500, conversionRate: 0.008 }, // Commission per transaction (NAR)
      // Home services -- per job
      plumber: { avgCaseValue: 475, conversionRate: 0.04 },             // Per service call (blended)
      electrician: { avgCaseValue: 350, conversionRate: 0.04 },
      "hvac": { avgCaseValue: 500, conversionRate: 0.035 },
      roofer: { avgCaseValue: 9500, conversionRate: 0.015 },            // Per replacement job
      landscaper: { avgCaseValue: 150, conversionRate: 0.04 },          // Per maintenance visit
      "garden designer": { avgCaseValue: 7500, conversionRate: 0.02 },  // Per design project
      "landscape designer": { avgCaseValue: 7500, conversionRate: 0.02 },
      // Personal services -- per visit
      barber: { avgCaseValue: 40, conversionRate: 0.08 },               // Per haircut (2025 avg)
      "hair salon": { avgCaseValue: 75, conversionRate: 0.06 },         // Per visit (cut + color blended)
      "auto repair": { avgCaseValue: 400, conversionRate: 0.03 },       // Per repair order
      photographer: { avgCaseValue: 500, conversionRate: 0.02 },        // Per session (non-wedding)
    };
    const specKey = specialty.toLowerCase();
    const econ = specialtyEconomics[specKey] || { avgCaseValue: 200, conversionRate: 0.03 };

    // Detect vocabulary for this vertical -- drives language in findings
    const vocabPreset = detectPreset(specialty, types);
    const customerWord = vocabPreset.patientTerm; // "patient", "client", "customer", "pet owner"
    const competitorWord = vocabPreset.competitorTerm; // "competitor"
    const locationWord = vocabPreset.locationTerm; // "practice", "firm", "shop", "clinic"
    // Per-review dollar impact: each review gap costs a fraction of a case per month
    const perReviewImpact = Math.round(econ.avgCaseValue * econ.conversionRate * 12);
    // Per-star dollar impact: each 0.1 star gap reduces conversion
    const perStarImpact = Math.round(econ.avgCaseValue * 4);
    // Per-rank dollar impact: each position below #3 costs visibility
    const perRankImpact = Math.round(econ.avgCaseValue * 1.5);

    // Build location bias from practice coordinates using specialty-aware radius
    const competitiveRadiusMiles = COMPETITIVE_RADII_MILES[specKey] || 10;
    const competitiveRadiusMeters = Math.round(competitiveRadiusMiles * 1609.34);
    const locationBias = location?.latitude && location?.longitude
      ? { lat: location.latitude, lng: location.longitude, radiusMeters: competitiveRadiusMeters }
      : undefined;

    logger.info(
      `[Checkup] Analyzing: ${name} in ${marketLocation} (${specialty})${locationBias ? ` [${locationBias.lat.toFixed(4)},${locationBias.lng.toFixed(4)}]` : " [no coordinates]"}`
    );

    // Discover competitors with specialty-aware fallback broadening.
    // An endodontist is compared to endodontists first. Only if fewer than 5
    // same-specialty competitors exist does it broaden to general dentists.
    // Wrapped with a timeout so wide-radius specialties (e.g. oculofacial 75mi)
    // don't cause the entire checkup to fail.
    let discoveryResult: {
      competitors: Awaited<ReturnType<typeof discoverCompetitorsWithFallback>>["competitors"];
      broadened: boolean;
      broadeningCategory: string | null;
      specialtyMatchCount: number;
    };

    const COMPETITOR_TIMEOUT_MS = 15000; // 15 seconds max for competitor discovery
    try {
      const discoveryPromise = discoverCompetitorsWithFallback(
        specialty,
        marketLocation,
        15,
        locationBias
      );
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Competitor discovery timed out")), COMPETITOR_TIMEOUT_MS)
      );
      discoveryResult = await Promise.race([discoveryPromise, timeoutPromise]);
    } catch (discoveryErr) {
      // Fallback: return results based on the business's own profile only.
      // Competitive Edge will default to neutral 10/20.
      logger.error({ err: discoveryErr instanceof Error ? discoveryErr.message : discoveryErr }, `[Checkup] Competitor discovery failed for "${name}" (non-fatal):`);
      discoveryResult = { competitors: [], broadened: false, broadeningCategory: null, specialtyMatchCount: 0 };
    }

    const { competitors: discoveredCompetitors, broadened, broadeningCategory, specialtyMatchCount } = discoveryResult;
    const isOnlySpecialist = broadened && specialtyMatchCount === 0;
    const isReferralBased = vocabPreset.intelligenceMode === "referral_based";

    // Remove the practice itself from competitors (match by placeId or name)
    const clientNameLower = name.toLowerCase();

    // Multi-location detection: find other locations of the same business
    // by matching the business name in the raw discovery results
    const multiLocationMatches = discoveredCompetitors.filter((c) => {
      if (c.placeId === placeId) return false; // exclude the analyzed location
      const cNameLower = c.name.toLowerCase();
      // Match if the competitor name contains the client name or vice versa
      // (e.g. "1Endodontics - Falls Church" and "1Endodontics - Fairfax")
      return cNameLower.includes(clientNameLower) || clientNameLower.includes(cNameLower);
    });
    const multiLocationCount = multiLocationMatches.length;
    const multiLocationPlaceIds = new Set(multiLocationMatches.map((c) => c.placeId));

    // Exclude both self and other locations of the same business from competitors
    const selfFiltered = discoveredCompetitors.filter(
      (c) => c.placeId !== placeId
        && c.name.toLowerCase() !== clientNameLower
        && !multiLocationPlaceIds.has(c.placeId)
    );

    // Filter by drive time — only competitors within specialty threshold
    const otherCompetitors = locationBias
      ? await filterByDriveTime(
          locationBias.lat,
          locationBias.lng,
          specialty,
          selfFiltered
        )
      : selfFiltered.map((c) => ({ ...c, driveTimeMinutes: 0 }));

    // --- Server-side data enrichment ---
    // If we have placeId but the frontend didn't pass scoring fields,
    // fetch everything we need directly from Google Places API.
    let enrichedPhotosCount = req.body.photosCount ?? 0;
    let enrichedHours = req.body.regularOpeningHours;
    let enrichedHasHours = req.body.hasHours;
    let enrichedPhone = req.body.phone;
    let enrichedWebsite = req.body.websiteUri;
    let enrichedEditorialSummary = req.body.editorialSummary;
    let enrichedBusinessStatus = req.body.businessStatus || "OPERATIONAL";
    let enrichedOpeningDate = req.body.openingDate;
    let enrichedReviews: any[] = req.body.reviews || [];
    let enrichedRating = rating;
    let enrichedReviewCount = reviewCount;
    let placeDetails: any = null;

    if (placeId) {
      try {
        placeDetails = await getPlaceDetails(placeId);
        if (placeDetails) {
          // Enrich photos: Google Places API v1 returns photos as an array of
          // photo objects with .name (resource path) and .widthPx/.heightPx.
          // We count them for scoring purposes.
          if (placeDetails.photos && placeDetails.photos.length > 0) {
            enrichedPhotosCount = placeDetails.photos.length;
          }
          // Enrich hours: API v1 returns regularOpeningHours with .periods[]
          // and .weekdayDescriptions[] -- either indicates hours are present.
          if (!enrichedHours && placeDetails.regularOpeningHours) {
            enrichedHours = placeDetails.regularOpeningHours;
          }
          // Enrich phone: API v1 field is nationalPhoneNumber (not formatted_phone_number)
          if (!enrichedPhone && (placeDetails.nationalPhoneNumber || placeDetails.internationalPhoneNumber)) {
            enrichedPhone = placeDetails.nationalPhoneNumber || placeDetails.internationalPhoneNumber;
          }
          // Enrich website: API v1 field is websiteUri (not website)
          if (!enrichedWebsite && placeDetails.websiteUri) {
            enrichedWebsite = placeDetails.websiteUri;
          }
          // Enrich editorial summary: API v1 returns { text: "...", languageCode: "en" }
          if (!enrichedEditorialSummary && placeDetails.editorialSummary) {
            enrichedEditorialSummary = typeof placeDetails.editorialSummary === "string"
              ? placeDetails.editorialSummary
              : placeDetails.editorialSummary?.text || placeDetails.editorialSummary;
          }
          // Enrich business status
          if (placeDetails.businessStatus) {
            enrichedBusinessStatus = placeDetails.businessStatus;
          }
          // Enrich opening date
          if (!enrichedOpeningDate && placeDetails.openingDate) {
            enrichedOpeningDate = placeDetails.openingDate;
          }
          // Enrich reviews (for surprise findings and scoring)
          if ((!enrichedReviews || !enrichedReviews.length) && placeDetails.reviews) {
            enrichedReviews = placeDetails.reviews;
          }
          // Enrich rating and review count from the API if not provided
          if (!enrichedRating && placeDetails.rating) {
            enrichedRating = placeDetails.rating;
          }
          if (!enrichedReviewCount && placeDetails.userRatingCount) {
            enrichedReviewCount = placeDetails.userRatingCount;
          }
          logger.info(
            `[Checkup] Enriched from Places API: photos=${enrichedPhotosCount}, hours=${!!enrichedHours}, phone=${!!enrichedPhone}, website=${!!enrichedWebsite}, editorial=${!!enrichedEditorialSummary}, reviews=${enrichedReviews?.length || 0}, reviewSummary=${!!placeDetails.reviewSummary}, openingDate=${!!enrichedOpeningDate}, goodForChildren=${!!placeDetails.goodForChildren}`
          );
        }
      } catch (enrichErr) {
        // Non-blocking: if enrichment fails, score with what the frontend sent
        logger.error({ err: enrichErr instanceof Error ? enrichErr.message : enrichErr }, "[Checkup] Places enrichment failed (non-blocking):");
      }
    }

    // --- Trust Score Calculation ---
    // Question: "Would an anxious person searching for this service trust this business enough to call?"
    // Not a leaderboard. A trust assessment from the perspective of the person searching.
    const clientRating = enrichedRating ?? 0;
    const clientReviews = enrichedReviewCount ?? 0;

    // Competitor averages (kept for findings/intelligence layer, NOT for scoring)
    const compCount = otherCompetitors.length || 1;
    const avgRating =
      otherCompetitors.reduce((s, c) => s + c.totalScore, 0) / compCount;
    const avgReviews =
      otherCompetitors.reduce((s, c) => s + c.reviewsCount, 0) / compCount;

    // Rank: when broadened, rank against specialty matches only.
    // An endodontist ranked #15 because general dentists have more reviews is wrong.
    // They should rank against other endodontists.
    // specialtyMatchCount tells us exactly how many same-specialty competitors exist.
    const sameSpecialtyCompetitors = broadened && specialtyMatchCount > 0
      ? otherCompetitors.slice(0, specialtyMatchCount)
      : otherCompetitors;

    const rankingPool = sameSpecialtyCompetitors.length > 0
      ? sameSpecialtyCompetitors
      : otherCompetitors; // Fallback to all if zero specialty matches

    const allWithClient = [
      { name, reviewsCount: clientReviews, totalScore: clientRating },
      ...rankingPool,
    ].sort((a, b) => {
      if (b.reviewsCount !== a.reviewsCount)
        return b.reviewsCount - a.reviewsCount;
      return b.totalScore - a.totalScore;
    });
    const rawRank =
      allWithClient.findIndex(
        (c) => c.name.toLowerCase() === name.toLowerCase()
      ) + 1;
    // Cap rank at the pool size (rank can't exceed total participants)
    const rank = Math.min(rawRank, allWithClient.length) || allWithClient.length;

    // Top competitor: prefer same-specialty.
    // For referral-based specialists (endodontist, oral surgeon, etc.) with zero
    // same-specialty competitors: general dentists are REFERRAL SOURCES, not competitors.
    // Don't show them as "top competitor."
    const topCompetitor = sameSpecialtyCompetitors.length > 0
      ? sameSpecialtyCompetitors[0]
      : (isOnlySpecialist && isReferralBased)
        ? null // No competitor -- broadened results are referral sources
        : otherCompetitors[0] || null;

    // --- Extract review signals from enriched data ---
    let reviewResponseRate = 0;
    let hasRespondedToNegative = false;
    let allReviewsPositive = false;
    let lastReviewDaysAgo = 999;

    // Use already-fetched placeDetails reviews (no second API call needed)
    const googleReviews: any[] = placeDetails?.reviews || [];
    // Google Places API v1 does NOT include ownerResponse in review objects.
    // The authorAttribution field exists for the reviewer, but there is no
    // ownerResponse field (unlike the legacy API). We detect this data limitation
    // and assign a neutral score instead of penalizing the business.
    let responseDataAvailable = false;
    if (googleReviews.length > 0) {
      const withResponse = googleReviews.filter((r: any) => !!r.ownerResponse);
      // If ANY review has an ownerResponse, the data is available (some API versions or
      // cached results may include it). If zero reviews have responses, assume the field
      // is simply not returned by the API rather than that the owner never responds.
      responseDataAvailable = withResponse.length > 0;
      if (responseDataAvailable) {
        reviewResponseRate = Math.round((withResponse.length / googleReviews.length) * 100);
      }

      const negativeReviews = googleReviews.filter((r: any) => (r.rating || 5) <= 3);
      allReviewsPositive = negativeReviews.length === 0;
      if (negativeReviews.length > 0 && responseDataAvailable) {
        hasRespondedToNegative = negativeReviews.some((r: any) => !!r.ownerResponse);
      }

      // Recency: parse publishTime to get days since last review
      const now = Date.now();
      for (const r of googleReviews) {
        if (r.publishTime) {
          const pubDate = new Date(r.publishTime).getTime();
          if (!isNaN(pubDate)) {
            const daysAgo = Math.floor((now - pubDate) / (1000 * 60 * 60 * 24));
            if (daysAgo < lastReviewDaysAgo) lastReviewDaysAgo = daysAgo;
          }
        }
      }
      // If publishTime not available, try relativePublishTimeDescription
      if (lastReviewDaysAgo === 999) {
        for (const r of googleReviews) {
          const desc = r.relativePublishTimeDescription || "";
          if (desc.includes("a week ago") || desc.includes("days ago") || desc.includes("yesterday") || desc.includes("an hour ago")) {
            lastReviewDaysAgo = 7; // Approximate
            break;
          } else if (desc.includes("2 weeks ago")) {
            lastReviewDaysAgo = 14;
            break;
          } else if (desc.includes("a month ago") || desc.includes("3 weeks ago")) {
            lastReviewDaysAgo = 30;
            break;
          } else if (desc.includes("2 months ago")) {
            lastReviewDaysAgo = 60;
            break;
          }
        }
      }
    }

    // ─── TRUST SIGNAL (0-30) ────────────────────────────────────────────
    // Rating strength (0-12)
    let ratingStrengthPts = 1;
    if (clientRating >= 5.0) ratingStrengthPts = 12;
    else if (clientRating >= 4.8) ratingStrengthPts = 10;
    else if (clientRating >= 4.5) ratingStrengthPts = 7;
    else if (clientRating >= 4.0) ratingStrengthPts = 4;

    // Review volume relative to specialty benchmark (0-10)
    // Uses log scale so volume well above benchmark is rewarded strongly
    // 1378 reviews / 80 benchmark = 17x should score 10/10
    const benchmark = REVIEW_VOLUME_BENCHMARKS[specKey] || 50;
    const volumeRatio = clientReviews / benchmark;
    let reviewVolumePts = 0;
    if (volumeRatio >= 3) reviewVolumePts = 10;      // 3x+ benchmark = full marks
    else if (volumeRatio >= 2) reviewVolumePts = 9;   // 2-3x benchmark
    else if (volumeRatio >= 1.5) reviewVolumePts = 8;  // 1.5-2x benchmark
    else if (volumeRatio >= 1) reviewVolumePts = 7;    // at benchmark
    else if (volumeRatio >= 0.5) reviewVolumePts = 5;  // half benchmark
    else if (volumeRatio >= 0.25) reviewVolumePts = 3; // quarter benchmark
    else if (volumeRatio > 0) reviewVolumePts = 1;     // some reviews

    // Review recency (0-8)
    let recencyPts = 0;
    if (lastReviewDaysAgo <= 7) recencyPts = 8;
    else if (lastReviewDaysAgo <= 14) recencyPts = 6;
    else if (lastReviewDaysAgo <= 30) recencyPts = 4;
    else if (lastReviewDaysAgo <= 60) recencyPts = 2;

    const trustSignal = Math.min(30, ratingStrengthPts + reviewVolumePts + recencyPts);

    // ─── FIRST IMPRESSION (0-30) ────────────────────────────────────────
    const clientPhotos = enrichedPhotosCount;

    // Photo count (0-10)
    // Google Places API v1 returns max ~10 photos regardless of actual count.
    // Calibrate benchmarks to API reality: 8+ = full, 5-7 = high, 2-4 = mid.
    let photoPts = 0;
    if (clientPhotos >= 8) photoPts = 10;
    else if (clientPhotos >= 5) photoPts = 8;
    else if (clientPhotos >= 2) photoPts = 5;
    else if (clientPhotos >= 1) photoPts = 3;

    // Profile completeness (0-10): hours + phone + website + description
    // Google Places API v1 returns regularOpeningHours with either periods[]
    // or weekdayDescriptions[] (or both). Check all variants.
    const hasHours = enrichedHours
      ? (enrichedHours.periods?.length || 0) > 0
        || (enrichedHours.weekdayDescriptions?.length || 0) > 0
      : !!enrichedHasHours;
    const hasPhone = !!enrichedPhone;
    const hasWebsite = !!enrichedWebsite;
    // Profile completeness (0-12): hours + phone + website (things the business controls)
    // Editorial summary is Google-generated, not business-controlled. Don't penalize for it.
    const completenessCount = [hasHours, hasPhone, hasWebsite].filter(Boolean).length;
    let completenessPts = 0;
    if (completenessCount === 3) completenessPts = 12;
    else if (completenessCount === 2) completenessPts = 8;
    else if (completenessCount === 1) completenessPts = 4;

    // Editorial summary exists (0-3 bonus, not penalty)
    // Google generates this for some businesses. Having it is a bonus, not having it is neutral.
    const hasDescription = !!enrichedEditorialSummary;
    const editorialPts = hasDescription ? 3 : 0;

    // Business status operational (0-3)
    const businessStatus = enrichedBusinessStatus;
    const statusPts = (businessStatus === "OPERATIONAL" || businessStatus === "OPEN") ? 3 : 0;

    // Years in business (0-5) -- established businesses are more trustworthy.
    // openingDate from Google Places API v1: { year, month, day } object.
    let yearsInBusinessPts = 0;
    if (enrichedOpeningDate) {
      const openYear = typeof enrichedOpeningDate === "object" ? enrichedOpeningDate.year : parseInt(String(enrichedOpeningDate));
      if (openYear && !isNaN(openYear)) {
        const yearsOpen = new Date().getFullYear() - openYear;
        if (yearsOpen >= 10) yearsInBusinessPts = 5;
        else if (yearsOpen >= 5) yearsInBusinessPts = 4;
        else if (yearsOpen >= 2) yearsInBusinessPts = 3;
        else if (yearsOpen >= 1) yearsInBusinessPts = 2;
      }
    }

    const firstImpression = Math.min(30, photoPts + completenessPts + editorialPts + statusPts + yearsInBusinessPts);

    // ─── RESPONSIVENESS (0-20) ──────────────────────────────────────────
    // Google Places API v1 limitation: ownerResponse is not returned in review
    // objects. When response data is unavailable, we assign a neutral 10/20
    // rather than penalizing the business for a data gap we cannot measure.
    let responseRatePts = 0;
    let negativeResponsePts = 0;

    if (!responseDataAvailable) {
      // Data unavailable: assume reasonable behavior (not a penalty for a data gap)
      responseRatePts = 9;
      negativeResponsePts = 5;
    } else {
      // Review response rate (0-12)
      if (reviewResponseRate >= 80) responseRatePts = 12;
      else if (reviewResponseRate >= 50) responseRatePts = 8;
      else if (reviewResponseRate >= 20) responseRatePts = 5;
      else if (reviewResponseRate >= 1) responseRatePts = 2;

      // Responded to negative reviews (0-8)
      if (allReviewsPositive) negativeResponsePts = 4; // No negatives to respond to
      else if (hasRespondedToNegative) negativeResponsePts = 8;
    }

    const responsiveness = Math.min(20, responseRatePts + negativeResponsePts);

    // ─── COMPETITIVE EDGE (0-20) ────────────────────────────────────────
    // Only calculated if same-specialty competitors were found.
    // When broadened with zero specialty matches, the business is the ONLY
    // specialist in their market. That's an advantage, not a penalty.
    let competitiveEdge = 10; // Neutral default when no competitors
    let competitiveDataLimited = otherCompetitors.length === 0;

    if (isOnlySpecialist) {
      // Only specialist in market: strong competitive position
      // Rating still matters (clients compare to general practices)
      const ratingAdvantage = clientRating - avgRating;
      const ratingPts = Math.round(Math.min(8, Math.max(4, (ratingAdvantage + 0.5) * 8)));
      competitiveEdge = Math.min(20, ratingPts + 8); // Base 8 for specialty scarcity
      competitiveDataLimited = false;
    } else if (otherCompetitors.length > 0) {
      // Rating advantage (0-8)
      const ratingAdvantage = clientRating - avgRating;
      // Scale: +0.5 above avg = 8pts, at avg = 4pts, -0.5 below = 0pts
      const ratingAdvantagePts = Math.round(Math.min(8, Math.max(0, (ratingAdvantage + 0.5) * 8)));

      // Review volume advantage (0-12) -- market leaders should feel it
      const maxReviews = Math.max(...otherCompetitors.map((c) => c.reviewsCount), 1);
      const volumeAdvantage = clientReviews / maxReviews;
      let volumeAdvantagePts = 0;
      if (volumeAdvantage >= 3) volumeAdvantagePts = 12;       // 3x+ the top competitor
      else if (volumeAdvantage >= 2) volumeAdvantagePts = 10;  // 2x the top competitor
      else if (volumeAdvantage >= 1) volumeAdvantagePts = 8;   // leading
      else if (volumeAdvantage >= 0.5) volumeAdvantagePts = 4; // half of leader
      else volumeAdvantagePts = Math.round(volumeAdvantage * 4); // far behind

      competitiveEdge = Math.min(20, ratingAdvantagePts + volumeAdvantagePts);
      competitiveDataLimited = false;
    }

    // Composite score (sum of sub-scores, 0-100)
    const compositeScore = trustSignal + firstImpression + responsiveness + competitiveEdge;
    const scoreLabel = getScoreLabel(compositeScore);

    // Build findings — framed as: "Here's what a prospect sees when they compare you to alternatives"
    const findings: Array<{
      type: string;
      title: string;
      detail: string;
      value: number;
      impact: number;
    }> = [];

    // Finding 1: What prospects see first — your review social proof
    if (isOnlySpecialist && isReferralBased) {
      // Referral-based specialist with no local competition: frame as referral market
      const gpCount = otherCompetitors.length;
      findings.push({
        type: "referral_market",
        title: `Only ${specialty} in ${city}`,
        detail: `You're the only ${specialty} in ${city}. There are ${gpCount} general ${broadeningCategory || "dental"} practices nearby, each a potential referral source. Your position is strong: when any of them need a ${specialty}, you're the local option. Reviews and visibility determine whether they think of you first.`,
        value: gpCount,
        impact: 0,
      });
    } else if (isOnlySpecialist) {
      // Non-referral specialist with no local competition
      findings.push({
        type: "specialist_context",
        title: `Only ${specialty} in ${city}`,
        detail: `You're the only ${specialty} specialist in ${city}. People searching specifically for a ${specialty} have you as their top local option. Growing your reviews strengthens that position.`,
        value: clientReviews,
        impact: 0,
      });
    } else if (topCompetitor && topCompetitor.reviewsCount > clientReviews) {
      const gap = topCompetitor.reviewsCount - clientReviews;
      const annualImpact = Math.round(gap * perReviewImpact / 12);
      findings.push({
        type: "review_gap",
        title: "People See Fewer Reviews",
        detail: `When a prospect compares you to ${topCompetitor.name}, they see ${gap} fewer reviews on your profile. Improving this gap could generate an estimated $${annualImpact.toLocaleString()} in additional inquiries per year.`,
        value: gap,
        impact: annualImpact,
      });
    } else {
      findings.push({
        type: "review_lead",
        title: "Strongest Social Proof in Your Market",
        detail: `People searching for you see the most reviews among nearby ${competitorWord}s. That credibility drives clicks.`,
        value: clientReviews,
        impact: 0,
      });
    }

    // Finding 2: Rating impression
    if (clientRating < avgRating) {
      const starImpact = Math.round((avgRating - clientRating) * perStarImpact);
      findings.push({
        type: "rating_gap",
        title: "Rating Below What People Expect",
        detail: `People see a ${clientRating}★ rating while nearby alternatives average ${avgRating.toFixed(1)}★. Improving your rating could generate an estimated $${starImpact.toLocaleString()} in additional inquiries per year.`,
        value: avgRating - clientRating,
        impact: starImpact,
      });
    } else {
      findings.push({
        type: "rating_strong",
        title: "Rating Makes a Strong First Impression",
        detail: avgRating > 0
          ? `Your ${clientRating}★ rating ${clientRating > avgRating ? "stands out above" : "matches"} the market average of ${avgRating.toFixed(1)}★. That builds trust at first glance.`
          : `Your ${clientRating}★ rating makes a strong first impression. That builds trust at first glance.`,
        value: clientRating - avgRating,
        impact: 0,
      });
    }

    // Finding 3: Review recency — freshness signals active business
    if (lastReviewDaysAgo <= 14) {
      findings.push({
        type: "recency_strong",
        title: "Recent Reviews Signal Active Business",
        detail: `Your most recent review is from the last ${lastReviewDaysAgo <= 7 ? "week" : "two weeks"}. People see an active, current business.`,
        value: lastReviewDaysAgo,
        impact: 0,
      });
    } else if (lastReviewDaysAgo > 30) {
      // TRUST FIX: Google returns only ~5 reviews. The actual most recent review
      // could be from yesterday. Use honest language about what we're measuring.
      const recencyImpact = Math.round(econ.avgCaseValue * econ.conversionRate * 12);
      findings.push({
        type: "recency_stale",
        title: "Review Activity Has Slowed",
        detail: `Based on your most recent Google reviews, activity has slowed. Fresh reviews signal to people searching that your business is active and could generate an estimated $${recencyImpact.toLocaleString()} in additional inquiries per year.`,
        value: lastReviewDaysAgo,
        impact: recencyImpact,
      });
    }

    // Finding 4: Response rate — shows prospects the owner cares
    // Only show response rate findings when the API actually provides owner response data.
    // Google Places API v1 does not include ownerResponse in review objects, so we skip
    // this finding when data is unavailable rather than showing misleading 0% stats.
    if (responseDataAvailable) {
      if (reviewResponseRate < 50 && !allReviewsPositive) {
        const responseImpact = Math.round(econ.avgCaseValue * econ.conversionRate * 6);
        findings.push({
          type: "response_gap",
          title: "People See Unanswered Reviews",
          detail: `You've responded to ${reviewResponseRate}% of your reviews. People notice when the owner engages. Improving response rate could generate an estimated $${responseImpact.toLocaleString()} in additional inquiries per year.`,
          value: reviewResponseRate,
          impact: responseImpact,
        });
      } else if (reviewResponseRate >= 80) {
        findings.push({
          type: "response_strong",
          title: "Strong Owner Engagement Visible",
          detail: `You've responded to ${reviewResponseRate}% of your reviews. People see an owner who cares.`,
          value: reviewResponseRate,
          impact: 0,
        });
      }
    }

    // Finding 5: Profile completeness
    // TRUST FIX: Only check fields we can verify the business controls.
    // editorialSummary is Google-generated, NOT business-controlled. The business
    // may have a full description that the API doesn't return in this field.
    // Showing "missing business description" when the owner can see their
    // description IS there destroys trust in everything else we show.
    if (completenessCount < 3) {
      const missingItems: string[] = [];
      if (!hasHours) missingItems.push("business hours");
      if (!hasPhone) missingItems.push("phone number");
      if (!hasWebsite) missingItems.push("website");
      if (missingItems.length > 0) {
        findings.push({
          type: "profile_incomplete",
          title: "Incomplete Profile Reduces Trust",
          detail: `People see a profile missing ${missingItems.join(", ")}. Complete profiles get more clicks. This takes minutes to fix.`,
          value: missingItems.length,
          impact: Math.round(econ.avgCaseValue * missingItems.length * 0.5),
        });
      }
    }

    // Finding 6: Zero competitors -- reframe as visibility opportunity, not absence
    if (competitiveDataLimited) {
      findings.push({
        type: "no_competitors",
        title: `You Own This Market`,
        detail: `There are no other ${specialty}s competing for visibility in ${city}. That means every person searching for your service in this area should find you first. Your score reflects how trustworthy your profile looks to the person who just searched. The question isn't who's ahead of you. It's how many people in ${city} need what you do and can't find you yet.`,
        value: 0,
        impact: 0,
      });
    }

    // Finding 6: Multi-location awareness
    if (multiLocationCount > 0) {
      const locationCities = multiLocationMatches
        .map((c) => {
          // Extract city from address (usually "123 Main St, City, State ZIP")
          const parts = c.address.split(",").map((p) => p.trim());
          return parts.length >= 2 ? parts[parts.length - 2] : c.address;
        })
        .filter(Boolean)
        .slice(0, 4);
      const locationList = locationCities.length > 0 ? ` (${locationCities.join(", ")})` : "";
      findings.push({
        type: "multi_location",
        title: "Multiple Locations Detected",
        detail: `We found ${multiLocationCount + 1} locations for ${name}${locationList}. This analysis covers your ${city} location.`,
        value: multiLocationCount + 1,
        impact: 0,
      });
    }

    // Finding 7: Broadened search notice (with honest framing)
    if (broadened && broadeningCategory) {
      const hasSpecialtyMatches = specialtyMatchCount > 0;
      if (isOnlySpecialist && isReferralBased) {
        // Referral-based specialist: frame broadened results as referral market
        findings.push({
          type: "referral_landscape",
          title: `${otherCompetitors.length} Potential Referral Sources`,
          detail: `These ${broadeningCategory} practices are your referral market, not your competition. Each one sends patients who need a ${specialty}. Your visibility to these practices determines your referral flow.`,
          value: otherCompetitors.length,
          impact: 0,
        });
      } else if (hasSpecialtyMatches) {
        findings.push({
          type: "broadened_search",
          title: "Expanded Comparison",
          detail: `We found ${specialtyMatchCount} ${specialty} ${competitorWord}s nearby and included ${broadeningCategory} ${competitorWord}s for additional context.`,
          value: 0,
          impact: 0,
        });
      } else {
        findings.push({
          type: "broadened_search",
          title: `Few ${specialty} ${competitorWord}s Nearby`,
          detail: `You're one of the few ${specialty} specialists in ${city}. The ${competitorWord}s shown are from the broader ${broadeningCategory} market for context, not direct specialty competition.`,
          value: 0,
          impact: 0,
        });
      }
    }

    // Total estimated annual impact
    // For leaders: this is "revenue protected". For others: "revenue at risk".
    const totalImpact = findings.reduce((s, f) => s + f.impact, 0);

    // --- Gap-to-next: concrete closeable units ---
    // Find the competitor directly above client in the ranking
    const clientRankIndex = allWithClient.findIndex(
      (c) => c.name.toLowerCase() === name.toLowerCase()
    );
    const nextAbove = clientRankIndex > 0 ? allWithClient[clientRankIndex - 1] : null;
    const nextAboveFull = nextAbove
      ? otherCompetitors.find(
          (c) => c.name.toLowerCase() === nextAbove.name.toLowerCase()
        )
      : null;

    interface GapItem {
      id: string;
      label: string;
      current: number;
      target: number;
      unit: string;
      action: string;
      timeEstimate: string;
      competitorName: string | null;
      velocity?: {
        clientWeekly: number;
        competitorWeekly: number;
        weeksToPass: number | null;
        thisWeekAsk: number;
        competitorName: string;
      };
    }

    const gaps: GapItem[] = [];

    // Gap 1: Review Race — velocity-based model to pass next competitor
    if (nextAbove && nextAbove.reviewsCount > clientReviews) {
      const reviewsNeeded = nextAbove.reviewsCount - clientReviews + 1;

      // Estimate current velocity: assume ~2 year accumulation for both parties
      // With no real velocity data, estimate from total count
      const clientWeeklyVelocity = Math.max(0.2, clientReviews / 104); // ~2 years of weeks
      const competitorWeeklyVelocity = Math.max(0.2, nextAbove.reviewsCount / 104);

      // Net weekly gain needed: must outpace competitor's velocity + close the gap
      const netWeeklyGain = Math.max(0.1, clientWeeklyVelocity - competitorWeeklyVelocity);
      const weeksToPass = netWeeklyGain > 0
        ? Math.ceil(reviewsNeeded / netWeeklyGain)
        : null; // never catches up at current pace

      // This week's target: how many reviews to ask for this week
      const thisWeekAsk = Math.max(1, Math.ceil(competitorWeeklyVelocity + 1));

      gaps.push({
        id: "review_race",
        label: `${reviewsNeeded} review${reviewsNeeded !== 1 ? "s" : ""} to pass ${nextAbove.name}`,
        current: clientReviews,
        target: nextAbove.reviewsCount + 1,
        unit: "reviews",
        action: `Ask ${thisWeekAsk} ${customerWord}${thisWeekAsk !== 1 ? "s" : ""} for a Google review this week. Start with your most recent happy ${customerWord} — they remember you best.`,
        timeEstimate: weeksToPass
          ? weeksToPass <= 4 ? `~${weeksToPass} week${weeksToPass !== 1 ? "s" : ""} at current pace`
            : weeksToPass <= 12 ? `~${Math.ceil(weeksToPass / 4)} months at current pace`
            : `${Math.ceil(weeksToPass / 4)} months — increase to ${thisWeekAsk + 1}/week to cut that in half`
          : `You need to increase your review pace to close this gap`,
        competitorName: nextAbove.name,
        // Extra velocity fields for the frontend race display
        velocity: {
          clientWeekly: Math.round(clientWeeklyVelocity * 10) / 10,
          competitorWeekly: Math.round(competitorWeeklyVelocity * 10) / 10,
          weeksToPass,
          thisWeekAsk,
          competitorName: nextAbove.name,
        },
      });
    } else if (nextAbove) {
      // Client leads in reviews — show the lead
      const lead = clientReviews - nextAbove.reviewsCount;
      gaps.push({
        id: "review_race",
        label: `You lead ${nextAbove.name} by ${lead} review${lead !== 1 ? "s" : ""}`,
        current: clientReviews,
        target: nextAbove.reviewsCount,
        unit: "reviews",
        action: "Keep your pace up. One review per week maintains your lead.",
        timeEstimate: "Leading",
        competitorName: nextAbove.name,
        velocity: {
          clientWeekly: Math.round(Math.max(0.2, clientReviews / 104) * 10) / 10,
          competitorWeekly: Math.round(Math.max(0.2, nextAbove.reviewsCount / 104) * 10) / 10,
          weeksToPass: null,
          thisWeekAsk: 1,
          competitorName: nextAbove.name,
        },
      });
    }

    // Gap 2: Rating improvement needed
    if (clientRating < avgRating) {
      const starsNeeded = Math.round((avgRating - clientRating) * 10) / 10;
      gaps.push({
        id: "rating",
        label: `${starsNeeded} star improvement matches the market average`,
        current: clientRating,
        target: Math.round(avgRating * 10) / 10,
        unit: "stars",
        action: "Respond to every negative review within 24 hours. Ask satisfied customers to share their experience.",
        timeEstimate: starsNeeded <= 0.2 ? "1-2 months" : "3-6 months",
        competitorName: null,
      });
    }

    // Gap 4: GBP completeness (we know if they have website/phone from Places data)
    const missingGbpItems: string[] = [];
    if (!enrichedWebsite) missingGbpItems.push("website");
    if (!enrichedPhone) missingGbpItems.push("phone number");
    if (missingGbpItems.length > 0) {
      gaps.push({
        id: "gbp_completeness",
        label: `Add your ${missingGbpItems.join(" and ")} to your Google Business Profile`,
        current: 0,
        target: missingGbpItems.length,
        unit: "items",
        action: `Log into Google Business Profile and add your ${missingGbpItems.join(" and ")}. Complete profiles rank higher.`,
        timeEstimate: "10 minutes",
        competitorName: null,
      });
    }

    // ─── Oz Reveals: insights from public data the owner never gave us ───

    // Photo count comparison (Google Places gives us this for free)
    const topCompPhotos = topCompetitor?.photosCount ?? 0;
    if (topCompetitor && topCompPhotos > clientPhotos && topCompPhotos > 10) {
      const photoImpact = Math.round((topCompPhotos - clientPhotos) * econ.avgCaseValue * 0.002);
      findings.push({
        type: "photo_gap",
        title: "People See More Photos on Alternatives",
        detail: `${topCompetitor.name} has ${topCompPhotos} photos. You have ${clientPhotos || "none"}. Improving your photo count could generate an estimated $${photoImpact.toLocaleString()} in additional inquiries per year.`,
        value: topCompPhotos - clientPhotos,
        impact: photoImpact,
      });
    }

    // Hours completeness (prospect-framed)
    if (!hasHours && topCompetitor?.hasHours) {
      findings.push({
        type: "hours_missing",
        title: "People Can't See Your Hours",
        detail: `${topCompetitor.name}'s hours are listed. Yours aren't. People skip profiles without hours. This takes 2 minutes to fix.`,
        value: 0,
        impact: Math.round(econ.avgCaseValue * 0.5),
      });
    }

    // Review response gap (we can detect this from review data)
    // This one really feels like mind-reading: "you haven't responded to your reviews"

    // ─── AI Analysis: Sentiment + Oz Moments + Review Themes (parallel, non-blocking) ───
    let sentimentInsight = null;
    let ozMoments: OzMoment[] = [];
    let reviewThemes: ThemeExtractionResult | null = null;

    if (placeId) {
      // Run sentiment, Oz moments, and theme extraction in parallel (zero added latency)
      const [sentimentResult, ozResult, themeResult] = await Promise.allSettled([
        analyzeReviewSentiment(
          placeId,
          name,
          topCompetitor?.placeId || null,
          topCompetitor?.name || null,
          specialty,
        ),
        generateOzMoments({
          clientName: name,
          clientPlaceId: placeId || null,
          clientRating: clientRating,
          clientReviewCount: clientReviews,
          clientReviews: [], // Fetched inside ozMoment.ts from placeId
          clientHasWebsite: !!enrichedWebsite,
          clientPhotoCount: enrichedPhotosCount,
          clientCategory: specialty,
          clientCity: city,
          competitorName: topCompetitor?.name || null,
          competitorPlaceId: topCompetitor?.placeId || null,
          competitorRating: topCompetitor?.totalScore || null,
          competitorReviewCount: topCompetitor?.reviewsCount || null,
          competitorReviews: [], // Fetched inside ozMoment.ts from placeId
          competitorHasWebsite: !!topCompetitor?.website,
          competitorPhotoCount: topCompetitor?.photosCount ?? 0,
          competitorHours: null,
          marketRank: rank,
          totalCompetitors: otherCompetitors.length,
          avgRating: Math.round(avgRating * 10) / 10,
          avgReviews: Math.round(avgReviews),
          vertical: vocabPreset.vertical,
          avgCaseValue: econ.avgCaseValue,
          // Deep Oz data: Google gives us these for free
          openingDate: enrichedOpeningDate || null,
          editorialSummary: enrichedEditorialSummary || null,
          businessStatus: enrichedBusinessStatus || null,
        }),
        // Review theme extraction for website generation (runs in parallel, zero added latency)
        extractReviewThemes(
          googleReviews.map((r: any) => ({
            text: r.text?.text || r.originalText?.text || r.text || "",
            rating: r.rating || 5,
            authorName: r.authorAttribution?.displayName || r.author_name || "A customer",
            relativeTime: r.relativePublishTimeDescription || "",
          })),
          name,
          specialty,
        ),
      ]);

      if (sentimentResult.status === "fulfilled" && sentimentResult.value) {
        sentimentInsight = sentimentResult.value;
        findings.push({
          type: "sentiment_insight",
          title: sentimentInsight.title,
          detail: sentimentInsight.detail,
          value: 0,
          impact: 0,
        });
      }

      if (ozResult.status === "fulfilled" && ozResult.value.length > 0) {
        ozMoments = ozResult.value;
      }

      if (themeResult.status === "fulfilled" && themeResult.value) {
        reviewThemes = themeResult.value;
      }
    }

    // ─── Surprise Findings: Oz Pearlman homework from expanded data ───
    let surpriseFindings: SurpriseFinding[] = [];
    try {
      // Use enriched reviews from Google Places API (already in the right format)
      // Fall back to frontend-provided reviews only if API data unavailable
      const clientReviewsForSurprise = googleReviews.length > 0
        ? googleReviews
        : (req.body.reviews || []).map((r: any) => ({
            text: { text: r.text || "" },
            originalText: { text: r.text || "" },
            rating: r.rating || 0,
            authorAttribution: { displayName: r.author || "Anonymous" },
            relativePublishTimeDescription: r.time || r.when || "",
            publishTime: r.time || r.when || undefined,
          }));

      surpriseFindings = await generateSurpriseFindings({
        place: {
          displayName: { text: name },
          rating: clientRating,
          userRatingCount: clientReviews,
          reviews: clientReviewsForSurprise,
          photos: placeDetails?.photos || req.body.photos || new Array(enrichedPhotosCount || 0),
          regularOpeningHours: enrichedHours || undefined,
          editorialSummary: enrichedEditorialSummary
            ? { text: typeof enrichedEditorialSummary === "string" ? enrichedEditorialSummary : enrichedEditorialSummary?.text || "" }
            : undefined,
          websiteUri: enrichedWebsite || undefined,
        },
        competitors: otherCompetitors.slice(0, 5).map((c) => ({
          name: c.name,
          totalScore: c.totalScore,
          reviewsCount: c.reviewsCount,
          photosCount: c.photosCount,
          hasHours: c.hasHours,
          hoursComplete: c.hoursComplete,
          website: c.website,
        })),
        market: {
          city,
          avgRating: Math.round(avgRating * 10) / 10,
          avgReviews: Math.round(avgReviews),
          rank,
          totalCompetitors: otherCompetitors.length,
        },
      });
    } catch (sfErr) {
      logger.error({ err: sfErr instanceof Error ? sfErr.message : sfErr }, "[Checkup] Surprise findings failed (non-blocking):");
    }

    // ─── Confidence Filter: only show HIGH confidence findings in checkup ───
    // MEDIUM findings are saved for Monday email after trust is established.
    // LOW findings are suppressed entirely (unverifiable = untrustworthy).
    const highConfidenceFindings = surpriseFindings.filter((f) => f.confidence === "high");
    const mediumConfidenceFindings = surpriseFindings.filter((f) => f.confidence === "medium");

    // Log scan completed (funnel measurement) -- session_id links to scan_started
    BehavioralEventModel.create({
      event_type: "checkup.scan_completed",
      session_id: session_id || null,
      properties: {
        name, city, score: compositeScore, rank, competitors: otherCompetitors.length,
        topCompetitor: topCompetitor?.name || null,
        ozMoments: ozMoments.length,
        surpriseFindings: surpriseFindings.length,
        surpriseFindingsHigh: highConfidenceFindings.length,
        surpriseFindingsMedium: mediumConfidenceFindings.length,
      },
    }).catch(() => {});

    logger.info(
      `[Checkup] Score: ${compositeScore} (${scoreLabel}) | Trust:${trustSignal} Impression:${firstImpression} Response:${responsiveness} Edge:${competitiveEdge} | Competitors: ${otherCompetitors.length} | Top: ${topCompetitor?.name || "none"}${sentimentInsight ? " | Sentiment: yes" : ""}${ozMoments.length > 0 ? ` | Oz: ${ozMoments.length}` : ""}${surpriseFindings.length > 0 ? ` | Surprise: ${surpriseFindings.length}` : ""}`
    );

    return res.json({
      success: true,
      score: {
        composite: compositeScore,
        // New First Impression sub-scores
        trustSignal,
        firstImpression,
        responsiveness,
        competitiveEdge,
        // Legacy aliases for frontend compatibility during transition
        visibility: trustSignal,
        reputation: firstImpression,
        competitive: responsiveness,
      },
      scoreLabel,
      competitiveDataLimited,
      topCompetitor: topCompetitor
        ? {
            name: topCompetitor.name,
            rating: topCompetitor.totalScore,
            reviewCount: topCompetitor.reviewsCount,
            placeId: topCompetitor.placeId,
            location: topCompetitor.location,
          }
        : null,
      competitors: otherCompetitors.slice(0, 5).map((c) => ({
        name: c.name,
        rating: c.totalScore,
        reviewCount: c.reviewsCount,
        placeId: c.placeId,
        location: c.location,
        driveTimeMinutes: (c as any).driveTimeMinutes ?? null,
      })),
      competitorLabel: (isOnlySpecialist && isReferralBased) ? "Referral Sources" : "Competitors",
      findings,
      sentimentInsight: sentimentInsight || null,
      ozMoments: ozMoments.length > 0 ? ozMoments : undefined,
      // Only HIGH confidence surprise findings in checkup (zero false positives).
      // MEDIUM confidence findings saved for Monday email after trust is built.
      surpriseFindings: highConfidenceFindings.length > 0 ? highConfidenceFindings.slice(0, 5) : undefined,
      // Include medium-confidence findings separately for downstream email use
      surpriseFindingsMedium: mediumConfidenceFindings.length > 0 ? mediumConfidenceFindings.slice(0, 3) : undefined,
      totalImpact,
      impactLabel: compositeScore >= 80 ? "revenue_protected" : "revenue_at_risk",
      market: {
        city,
        totalCompetitors: isOnlySpecialist ? 0 : otherCompetitors.length,
        avgRating: Math.round(avgRating * 10) / 10,
        avgReviews: Math.round(avgReviews),
        rank: isOnlySpecialist ? 1 : rank,
        broadened: broadened || false,
        broadeningCategory: broadeningCategory || null,
        onlySpecialist: isOnlySpecialist || undefined,
      },
      multiLocation: multiLocationCount > 0 ? {
        totalLocations: multiLocationCount + 1,
        analyzedCity: city,
        otherLocations: multiLocationMatches.slice(0, 5).map((c) => ({
          name: c.name,
          address: c.address,
          placeId: c.placeId,
        })),
      } : null,
      gaps,
      vocabulary: {
        customerTerm: customerWord,
        competitorTerm: competitorWord,
        locationTerm: locationWord,
        vertical: vocabPreset.vertical,
        intelligenceMode: vocabPreset.intelligenceMode,
        healthScoreLabel: vocabPreset.healthScoreLabel,
      },
      // Website generation data: review themes extracted in parallel during scan
      websiteIntelligence: reviewThemes ? {
        heroQuote: reviewThemes.heroQuote,
        heroReviewerName: reviewThemes.heroReviewerName,
        suggestedHeadline: reviewThemes.suggestedHeadline,
        uniqueStrength: reviewThemes.uniqueStrength,
        customerVoiceSummary: reviewThemes.customerVoiceSummary,
        topThemes: reviewThemes.topThemes,
      } : null,
    });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Analysis error:");
    return res.status(500).json({
      success: false,
      error: "Analysis failed. Please try again.",
    });
  }
});

/**
 * GET /api/checkup/referral/:code
 *
 * Validates a referral code and returns the referring org name.
 * Used by the Checkup entry screen when ?ref= is present.
 */
checkupRoutes.get("/referral/:code", async (req, res) => {
  try {
    const { code } = req.params;
    if (!code || code.length !== 8) {
      return res.json({ success: false, valid: false });
    }

    const org = await OrganizationModel.findByReferralCode(code.toUpperCase());
    if (!org) {
      return res.json({ success: true, valid: false });
    }

    return res.json({
      success: true,
      valid: true,
      referrerOrgId: org.id,
      referrerName: org.name,
    });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Referral lookup error:");
    return res.json({ success: false, valid: false });
  }
});

/**
 * POST /api/checkup/email
 *
 * Sends the checkup result email to the prospect.
 * Called from the blur gate email capture on ResultsScreen.
 * Must deliver in under 60 seconds (WO7).
 */
checkupRoutes.post("/email", emailLimiter, async (req, res) => {
  try {
    const {
      email,
      practiceName,
      city,
      compositeScore,
      topCompetitorName,
      topCompetitorReviews,
      practiceReviews,
      finding,
      rank,
      totalCompetitors,
    } = req.body;

    if (!email || !practiceName) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: email, practiceName",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: "Invalid email format",
      });
    }

    logger.info(`[Checkup] Sending result email to ${email} for ${practiceName}`);

    const result = await sendCheckupResultEmail({
      recipientEmail: email,
      practiceName,
      city: city || "",
      compositeScore: compositeScore || 0,
      topCompetitorName: topCompetitorName || null,
      topCompetitorReviews: topCompetitorReviews || null,
      practiceReviews: practiceReviews || 0,
      finding: finding || "",
      rank: rank || 0,
      totalCompetitors: totalCompetitors || 0,
    });

    if (result.success) {
      logger.info(`[Checkup] Result email sent to ${email}`);

      // Track: result_email.sent (no PII — no email address stored)
      BehavioralEventModel.create({
        event_type: "result_email.sent",
        session_id: req.body.sessionId || null,
        properties: {
          practice_name: practiceName,
          city,
          score: compositeScore,
          competitor_name: topCompetitorName || null,
          subject: topCompetitorName
            ? `Your score vs ${topCompetitorName} in ${city}`
            : `Your Business Clarity Score: ${compositeScore}`,
        },
      }).catch(() => {}); // Fire-and-forget

      return res.json({ success: true, messageId: result.messageId });
    } else {
      logger.error(`[Checkup] Email send failed: ${result.error}`);
      return res.status(500).json({ success: false, error: result.error });
    }
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Email error:");
    return res.status(500).json({
      success: false,
      error: "Failed to send email. Please try again.",
    });
  }
});

/**
 * POST /api/checkup/build-trigger
 *
 * Triggers ClearPath website build after email capture.
 * Logs intent to behavioral_events. In production, kicks off the pipeline.
 * For now: logs the intent, returns queued status.
 */
checkupRoutes.post("/build-trigger", emailLimiter, async (req, res) => {
  try {
    const { email, placeId, practiceName, specialty, city } = req.body;

    if (!practiceName) {
      return res.status(400).json({
        success: false,
        error: "Missing required field: practiceName",
      });
    }

    logger.info(`[Checkup] ClearPath build triggered for ${practiceName}`);

    // Log the build request (no PII — email not stored in properties)
    await BehavioralEventModel.create({
      event_type: "clearpath.build_triggered",
      session_id: req.body.sessionId || null,
      properties: {
        place_id: placeId,
        practice_name: practiceName,
        specialty: specialty || null,
        city: city || null,
      },
    });

    return res.json({
      success: true,
      status: "queued",
      estimated_minutes: 60,
    });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Build trigger error:");
    return res.status(500).json({
      success: false,
      error: "Build trigger failed.",
    });
  }
});

/**
 * POST /api/checkup/track
 *
 * Records a behavioral event from the checkup flow.
 * No PII. No patient data. Only behavioral signals.
 */
checkupRoutes.post("/track", async (req, res) => {
  try {
    const { eventType, sessionId, properties } = req.body;

    if (!eventType) {
      return res.status(400).json({ success: false, error: "Missing eventType" });
    }

    await BehavioralEventModel.create({
      event_type: eventType,
      session_id: sessionId || null,
      properties: properties || {},
    });

    // First Patient Attribution: if a checkup event carries a ref_code,
    // attribute it to the referring org (fire-and-forget)
    const refCode = properties?.ref_code as string | undefined;
    if (refCode) {
      attributeCheckupToOrg(refCode, sessionId, properties).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, "[Checkup] Attribution error (non-blocking):");
      });
    }

    return res.json({ success: true });
  } catch (error: any) {
    // Never block the user flow for tracking failures
    logger.error({ err: error.message }, "[Checkup] Track error:");
    return res.json({ success: true });
  }
});

/**
 * POST /api/checkup/create-account
 *
 * Streamlined account creation from the Checkup gate.
 * Creates user + org + returns JWT. No email verification.
 * If email exists: returns token for existing account (auto-login).
 */
checkupRoutes.post("/create-account", checkupCreateAccountLimiter, async (req, res) => {
  try {
    const {
      email,
      password,
      practice_name,
      place_id,
      relationship,
      checkup_score,
      checkup_data,
      agreedToTerms,
    } = req.body;

    if (!agreedToTerms) {
      return res.status(400).json({ success: false, error: "You must agree to the Terms of Service to create an account" });
    }

    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required" });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ success: false, error: "Invalid email format" });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, error: "Password must be at least 8 characters" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check if user exists -- if so, verify password and return token
    const existing = await UserModel.findByEmail(normalizedEmail);
    if (existing) {
      if (!existing.password_hash) {
        return res.status(409).json({
          success: false,
          error: "Account exists via Google sign-in. Please sign in with Google.",
          existingAccount: true,
        });
      }
      const passwordMatch = await bcrypt.compare(password, existing.password_hash);
      if (!passwordMatch) {
        return res.status(409).json({
          success: false,
          error: "An account with this email already exists. Sign in instead.",
          existingAccount: true,
        });
      }
      // Password matches -- auto-login
      const token = generateToken(existing.id, normalizedEmail);
      return res.json({ success: true, token, userId: existing.id, existingAccount: true });
    }

    // Create user + org + link in a transaction (prevents orphan records)
    const passwordHash = await bcrypt.hash(password, 10);
    const { user, org } = await db.transaction(async (trx) => {
      const newUser = await UserModel.create({
        email: normalizedEmail,
        password_hash: passwordHash,
      }, trx);

      // Mark email as verified (skip verification for Checkup gate)
      await trx("users").where({ id: newUser.id }).update({ email_verified: true });

      // Dedup: if an org already exists with this place_id, reuse it instead of creating a duplicate
      // This prevents ghost orgs from double-submissions, back-button, or timeout retries
      let newOrg: any = null;
      if (place_id) {
        const existingOrg = await trx("organizations")
          .whereRaw("checkup_data::text LIKE ?", [`%${place_id}%`])
          .first();
        if (existingOrg) {
          newOrg = existingOrg;
        }
      }
      if (!newOrg) {
        newOrg = await OrganizationModel.create({
          name: practice_name || `${normalizedEmail.split("@")[0]}'s Practice`,
          referral_code: await generateReferralCode(),
        }, trx);
      }

      // Set trial period: 7 days from now
      const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await trx("organizations").where({ id: newOrg.id }).update({
        trial_start_at: new Date(),
        trial_end_at: trialEnd,
        trial_status: "active",
        terms_accepted_at: new Date(),
      });

      // Set source_channel from referral or source query param
      const sourceChannel = req.body.source_channel || req.query.ref || req.query.source || null;
      if (sourceChannel) {
        await trx("organizations").where({ id: newOrg.id }).update({ source_channel: sourceChannel });
      }

      // Store checkup data on org for dashboard pre-population
      if (checkup_score || checkup_data || place_id) {
        const checkupUpdates: Record<string, any> = {};
        if (checkup_score) {
          checkupUpdates.checkup_score = checkup_score;
          // Initialize clarity score so the Monday email has a baseline for delta calculation
          checkupUpdates.current_clarity_score = checkup_score;
          checkupUpdates.previous_clarity_score = checkup_score;
          checkupUpdates.score_updated_at = new Date();
        }
        if (checkup_data) checkupUpdates.checkup_data = JSON.stringify(checkup_data);
        if (checkup_data?.topCompetitor?.name) {
          checkupUpdates.top_competitor_name = checkup_data.topCompetitor.name;
        }
        // Baseline review count for First Win Attribution (WO-22)
        if (checkup_data?.reviewCount != null) {
          checkupUpdates.checkup_review_count_at_creation = checkup_data.reviewCount;
        }
        // Session key links this org back to the checkup session
        if (req.body.session_id) {
          checkupUpdates.session_checkup_key = req.body.session_id;
        }
        // Also keep business_data for backward compat
        checkupUpdates.business_data = JSON.stringify({
          checkup_score,
          checkup_place_id: place_id,
          checkup_relationship: relationship,
          checkup_data: checkup_data || null,
        });

        await trx("organizations").where({ id: newOrg.id }).update(checkupUpdates);
      }

      // Biestman blinder: auto-detect vertical from GBP category and set vocabulary config
      const category = req.body.category || checkup_data?.market?.specialty || null;
      if (category) {
        const CATEGORY_TO_VERTICAL: Record<string, string> = {
          endodontist: "endodontics", orthodontist: "orthodontics", dentist: "general_dentistry",
          chiropractor: "chiropractic", "physical therapist": "physical_therapy",
          optometrist: "optometry", veterinarian: "veterinary", attorney: "legal",
          lawyer: "legal", accountant: "financial_advisor", cpa: "financial_advisor",
          "financial advisor": "financial_advisor", "real estate agent": "real_estate",
          barber: "general", "hair salon": "general", plumber: "general",
          electrician: "general", hvac: "general",
        };
        const vertical = CATEGORY_TO_VERTICAL[category.toLowerCase()] || "general";
        const hasVocabTable = await trx.schema.hasTable("vocabulary_configs");
        if (hasVocabTable) {
          const existing = await trx("vocabulary_configs").where({ org_id: newOrg.id }).first();
          if (!existing) {
            await trx("vocabulary_configs").insert({
              org_id: newOrg.id,
              vertical,
              overrides: JSON.stringify({}),
            });
          }
        }
      }

      // Link user to org
      await OrganizationUserModel.create({
        organization_id: newOrg.id,
        user_id: newUser.id,
        role: "admin",
      }, trx);

      return { user: newUser, org: newOrg };
    });

    // Generate JWT
    const token = generateToken(user.id, normalizedEmail);

    // Track event -- session_id links account creation back to scan_started
    BehavioralEventModel.create({
      event_type: "checkup.account_created",
      org_id: org.id,
      session_id: req.body.session_id || null,
      properties: {
        practice_name,
        place_id,
        relationship,
        checkup_score,
      },
    }).catch(() => {});

    logger.info(`[Checkup] Account created: ${normalizedEmail} -> org ${org.id}`);

    // Referral tracking: if a ref code was passed, link the referrer and notify them
    const refCodeParam = req.body.ref_code || req.body.source_channel || req.query.ref;
    if (refCodeParam && typeof refCodeParam === "string") {
      try {
        const referrerOrg = await OrganizationModel.findByReferralCode(refCodeParam);
        if (referrerOrg && referrerOrg.id !== org.id) {
          // Set referred_by_org_id on the new org
          await db("organizations").where({ id: org.id }).update({
            referred_by_org_id: referrerOrg.id,
          });
          // Track the referral signup
          await trackReferralSignup(referrerOrg.id, org.id, refCodeParam);
        }
      } catch (refErr: any) {
        logger.error({ err: refErr.message }, "[Checkup] Referral tracking error (non-blocking):");
      }
    }

    // Auto-configure vocabulary from GBP category
    try {
      const { autoConfigureVocabulary } = await import("../services/vocabularyAutoMapper");
      const gbpCategory = checkup_data?.place?.category || req.body.category || "";
      const gbpTypes = checkup_data?.place?.types || req.body.types || [];
      await autoConfigureVocabulary(org.id, gbpCategory, gbpTypes);
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "[Checkup] Vocabulary auto-config failed, will use universal defaults:");
    }

    // ── Instant Website Generation ──
    // Creates a website_builder.projects record + homepage immediately using
    // checkup data (reviews, rating, hours, photos). Ready before the user
    // finishes onboarding questions. Never blocks account creation.
    try {
      const { generateInstantWebsite } = await import("../services/instantWebsiteGenerator");
      const parsedCheckup = typeof checkup_data === "string"
        ? JSON.parse(checkup_data)
        : checkup_data;
      await generateInstantWebsite({
        orgId: org.id,
        orgName: practice_name || org.name,
        placeId: place_id || null,
        checkupData: parsedCheckup || {},
        category: req.body.category || parsedCheckup?.market?.specialty || null,
      });
      logger.info(`[Checkup] Instant website generated for org ${org.id}`);
    } catch (iwErr: any) {
      logger.error({ err: iwErr.message }, `[Checkup] Instant website generation failed (non-blocking):`);
    }

    // Enqueue PatientPath build pipeline (Phase 1: research)
    // This enriches the website later with Claude-analyzed research brief
    try {
      const ppQueue = getMindsQueue("patientpath-build");
      await ppQueue.add(
        `patientpath:build:${org.id}`,
        { orgId: org.id, placeId: place_id || undefined },
        { jobId: `patientpath-build-${org.id}`, attempts: 3, backoff: { type: "exponential", delay: 30000 } }
      );
      logger.info(`[Checkup] PatientPath build enqueued for org ${org.id}`);
    } catch (ppErr: any) {
      logger.error({ err: ppErr.message }, `[Checkup] Failed to enqueue PatientPath build:`);
    }

    // Seed initial weekly_ranking_snapshot so the first Monday email has data.
    // Frontend sends checkup_data as: { score, topCompetitor (object or string), market, findingSummary, placeId, reviewCount }
    try {
      const parsed = typeof checkup_data === "string" ? JSON.parse(checkup_data) : checkup_data;
      if (parsed) {
        const tc = parsed.topCompetitor;
        const competitorName = typeof tc === "string" ? tc : tc?.name || null;
        const competitorReviewCount = typeof tc === "object" && tc?.reviewCount ? tc.reviewCount : null;
        const clientReviewCount = parsed.reviewCount || 0;
        const marketRank = parsed.market?.rank ?? null;
        const marketCity = parsed.market?.city || "your area";
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());

        // Build rich bullets from checkup findings instead of generic placeholders
        const checkupFindings = parsed.findings || [];
        const richBullets: string[] = [];
        for (const f of checkupFindings.slice(0, 3)) {
          const detail = typeof f === "string" ? f : f.detail || f.title || "";
          if (detail) richBullets.push(detail);
        }
        if (richBullets.length === 0) {
          richBullets.push(`Your Business Clarity Score: ${checkup_score || "N/A"}/100.`);
          if (competitorName) richBullets.push(`${competitorName} leads your market with ${competitorReviewCount || "many"} reviews.`);
          richBullets.push("Your full competitive analysis updates next Monday.");
        }

        // Use the most impactful finding as headline
        const firstFinding = checkupFindings[0];
        const richHeadline = firstFinding
          ? (typeof firstFinding === "string" ? firstFinding : firstFinding.title || parsed.findingSummary || "Your competitive landscape")
          : parsed.findingSummary || "Your competitive landscape";

        await db("weekly_ranking_snapshots").insert({
          org_id: org.id,
          week_start: weekStart.toISOString().split("T")[0],
          position: marketRank,
          keyword: `${practice_name || "specialist"} in ${marketCity}`,
          bullets: JSON.stringify(richBullets),
          finding_headline: richHeadline,
          competitor_name: competitorName,
          competitor_review_count: competitorReviewCount,
          client_review_count: clientReviewCount,
          dollar_figure: parsed.totalImpact || null,
        }).catch(() => {
          // Unique constraint may fire if snapshot already exists for this week
        });
        logger.info(`[Checkup] Seeded initial ranking snapshot for org ${org.id}`);
      }
    } catch (snapErr: any) {
      logger.error({ err: snapErr.message }, `[Checkup] Failed to seed snapshot:`);
    }

    // Enqueue Welcome Intelligence (fires 4 hours later with new insights)
    try {
      const parsed = typeof checkup_data === "string" ? JSON.parse(checkup_data) : checkup_data;
      const wiQueue = getMindsQueue("welcome-intelligence");
      await wiQueue.add(
        `welcome:intel:${org.id}`,
        {
          orgId: org.id,
          userId: user.id,
          email: normalizedEmail,
          practiceName: practice_name || "your practice",
          placeId: place_id || null,
          specialty: parsed?.market?.specialty || null,
          city: parsed?.market?.city || null,
          stateAbbr: parsed?.market?.stateAbbr || null,
          checkupScore: checkup_score || null,
          topCompetitorName: typeof parsed?.topCompetitor === "string"
            ? parsed.topCompetitor
            : parsed?.topCompetitor?.name || null,
        },
        {
          jobId: `welcome-intel-${org.id}`,
          delay: 4 * 60 * 60 * 1000, // 4 hours
          attempts: 2,
          backoff: { type: "exponential", delay: 60000 },
        }
      );
      logger.info(`[Checkup] Welcome Intelligence enqueued for org ${org.id} (fires in 4h)`);
    } catch (wiErr: any) {
      logger.error({ err: wiErr.message }, `[Checkup] Failed to enqueue Welcome Intelligence:`);
    }

    // Set trial columns on org + enqueue 7-day email sequence
    try {
      const trialStart = new Date();
      const trialEnd = new Date(trialStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      await db("organizations").where({ id: org.id }).update({
        trial_start_at: trialStart,
        trial_end_at: trialEnd,
        trial_status: "active",
      });

      const trialQueue = getMindsQueue("trial-email");
      const trialDays = [
        { day: 1, delayMs: 0 },                              // Immediate
        { day: 3, delayMs: 2 * 24 * 60 * 60 * 1000 },       // 2 days
        { day: 5, delayMs: 4 * 24 * 60 * 60 * 1000 },       // 4 days
        { day: 6, delayMs: 5 * 24 * 60 * 60 * 1000 },       // 5 days
        { day: 7, delayMs: 6 * 24 * 60 * 60 * 1000 },       // 6 days
      ];
      for (const { day, delayMs } of trialDays) {
        await trialQueue.add(
          `trial:day${day}:${org.id}`,
          { orgId: org.id, day },
          {
            jobId: `trial-day${day}-${org.id}`,
            delay: delayMs,
            attempts: 3,
            backoff: { type: "exponential", delay: 60000 },
          }
        );
      }
      logger.info(`[Checkup] Trial started + email sequence enqueued for org ${org.id}`);
    } catch (trialErr: any) {
      logger.error({ err: trialErr.message }, `[Checkup] Failed to set up trial:`);
    }

    // Queue Week 1 Win job (24 hours after signup)
    try {
      const w1Queue = getMindsQueue("week1-win");
      await w1Queue.add(
        `week1:win:${org.id}`,
        { orgId: org.id },
        {
          jobId: `week1-win-${org.id}`,
          delay: 24 * 60 * 60 * 1000, // 24 hours
          attempts: 2,
          backoff: { type: "exponential", delay: 60000 },
        }
      );
      logger.info(`[Checkup] Week 1 Win enqueued for org ${org.id} (fires in 24h)`);
    } catch (w1Err: any) {
      logger.error({ err: w1Err.message }, `[Checkup] Failed to enqueue Week 1 Win:`);
    }

    // Send instant welcome email (synchronous, no Redis needed)
    try {
      const parsed = typeof checkup_data === "string" ? JSON.parse(checkup_data) : checkup_data;
      const topCompetitor = parsed?.topCompetitor;
      const competitorName = typeof topCompetitor === "string"
        ? topCompetitor
        : topCompetitor?.name || null;

      // Extract the top finding from checkup data
      const findings = parsed?.findings || [];
      const firstFinding = findings[0];
      const topFinding = firstFinding
        ? (typeof firstFinding === "string" ? firstFinding : firstFinding.detail || firstFinding.title || null)
        : parsed?.findingSummary || null;

      // Derive first name from email (before the @, capitalize first letter)
      const emailPrefix = normalizedEmail.split("@")[0].replace(/[._-]/g, " ");
      const firstName = emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).split(" ")[0];

      await sendWelcomeCheckupEmail({
        recipientEmail: normalizedEmail,
        firstName,
        practiceName: practice_name || "",
        checkupScore: checkup_score || null,
        topFinding,
        topCompetitorName: competitorName,
      });
      logger.info(`[Checkup] Welcome email sent to ${normalizedEmail}`);
    } catch (welcomeErr: any) {
      // Email failure must never block account creation
      logger.error({ err: welcomeErr.message }, `[Checkup] Welcome email failed (non-blocking):`);
    }

    return res.json({
      success: true,
      token,
      userId: user.id,
      organizationId: org.id,
      referralCode: org.referral_code || null,
      existingAccount: false,
    });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Create account error:");
    return res.status(500).json({ success: false, error: "Failed to create account" });
  }
});

/**
 * PATCH /api/checkup/first-login
 * Sets first_login_at on the org if not already set. Requires auth.
 */
checkupRoutes.patch("/first-login", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    await db("organizations")
      .where({ id: orgId })
      .whereNull("first_login_at")
      .update({ first_login_at: new Date() });

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error.message }, "[TTFV] First login error:");
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * PATCH /api/checkup/ttfv
 * Records TTFV response. Body: { response: 'yes' | 'not_yet' }
 */
checkupRoutes.patch("/ttfv", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    const { response } = req.body;
    if (response !== "yes" && response !== "not_yet") {
      return res.status(400).json({ success: false, error: "Invalid response" });
    }

    await db("organizations")
      .where({ id: orgId })
      .whereNull("ttfv_response")
      .update({ ttfv_response: response, ttfv_responded_at: new Date() });

    BehavioralEventModel.create({
      event_type: `ttfv.${response}`,
      org_id: orgId,
    }).catch(() => {});

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error.message }, "[TTFV] Response error:");
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * PATCH /api/checkup/billing-prompt-shown
 * Sets billing_prompt_shown_at so it doesn't show again.
 */
checkupRoutes.patch("/billing-prompt-shown", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    await db("organizations")
      .where({ id: orgId })
      .whereNull("billing_prompt_shown_at")
      .update({ billing_prompt_shown_at: new Date() });

    return res.json({ success: true });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * GET /api/checkup/ttfv-status
 * Returns TTFV state for the authenticated org.
 */
checkupRoutes.get("/ttfv-status", async (req: any, res) => {
  try {
    const orgId = req.organizationId;
    if (!orgId) return res.status(401).json({ success: false, error: "Auth required" });

    const org = await db("organizations")
      .where({ id: orgId })
      .select("first_login_at", "ttfv_response", "billing_prompt_shown_at", "subscription_status")
      .first();

    if (!org) return res.status(404).json({ success: false });

    return res.json({
      success: true,
      firstLoginAt: org.first_login_at,
      ttfvResponse: org.ttfv_response,
      billingPromptShownAt: org.billing_prompt_shown_at,
      showTtfv: !!org.first_login_at && !org.ttfv_response,
      showBilling: org.ttfv_response === "yes" && !org.billing_prompt_shown_at && org.subscription_status !== "active",
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "Failed" });
  }
});

/**
 * POST /api/checkup/vendor
 * Saves vendor email from the Checkup gate Vendor Path.
 */
checkupRoutes.post("/vendor", async (req, res) => {
  try {
    const { email, referring_place_id, wants_checkup_for_other_practices } = req.body;
    if (!email) return res.status(400).json({ success: false, error: "Email required" });

    await db("vendors")
      .insert({
        email: email.toLowerCase().trim(),
        referring_place_id: referring_place_id || null,
        wants_checkup_for_other_practices: !!wants_checkup_for_other_practices,
      })
      .onConflict("email")
      .merge({ referring_place_id, wants_checkup_for_other_practices });

    return res.json({ success: true });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Vendor save error:");
    return res.json({ success: true }); // Never fail visibly
  }
});

/**
 * POST /api/checkup/share
 *
 * Generate a shareable checkup result card.
 * Input: score, market city, rank, totalCompetitors, topCompetitorName
 * Returns: share_id that resolves to a public card at /checkup/shared/:id
 *
 * This is the viral loop. Every checkup becomes a distribution event.
 */
checkupRoutes.post("/share", async (req, res) => {
  try {
    const { score, city, rank, totalCompetitors, topCompetitorName, specialty } = req.body;

    if (!score || !city) {
      return res.status(400).json({ success: false, error: "Score and city required" });
    }

    // Generate a unique share ID (URL-safe, 10 chars)
    const shareId = Array.from(crypto.getRandomValues(new Uint8Array(8)))
      .map((b) => b.toString(36).padStart(2, "0"))
      .join("")
      .slice(0, 10);

    // Store the shareable card data (no PII, no practice name, just market data)
    await db("checkup_shares").insert({
      share_id: shareId,
      score: Math.round(score),
      city,
      specialty: specialty || null,
      rank: rank || null,
      total_competitors: totalCompetitors || null,
      top_competitor_name: topCompetitorName || null,
      created_at: new Date(),
    });

    return res.json({
      success: true,
      shareId,
      shareUrl: `${process.env.APP_URL || "https://app.getalloro.com"}/checkup/shared/${shareId}`,
    });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Share error:");
    return res.status(500).json({ success: false, error: "Failed to create share link" });
  }
});

/**
 * GET /api/checkup/shared/:shareId
 *
 * Public endpoint. Returns the shareable card data.
 * No auth required. No PII exposed.
 */
checkupRoutes.get("/shared/:shareId", async (req, res) => {
  try {
    const { shareId } = req.params;

    const share = await db("checkup_shares")
      .where({ share_id: shareId })
      .first();

    if (!share) {
      return res.status(404).json({ success: false, error: "Share not found" });
    }

    // Increment view count
    db("checkup_shares")
      .where({ share_id: shareId })
      .increment("views", 1)
      .catch(() => {}); // fire-and-forget

    return res.json({
      success: true,
      card: {
        score: share.score,
        city: share.city,
        specialty: share.specialty,
        rank: share.rank,
        totalCompetitors: share.total_competitors,
        topCompetitorName: share.top_competitor_name,
      },
    });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Shared get error:");
    return res.status(500).json({ success: false, error: "Failed to load share" });
  }
});

// ─── Viral Loop: Competitor Invitations ──────────────────────────────

checkupRoutes.post("/invite-competitor", async (req, res) => {
  try {
    const { competitorPlaceId, competitorName, senderSessionId, senderName } = req.body;
    if (!competitorPlaceId || !competitorName) {
      return res.status(400).json({ success: false, error: "Missing competitor info" });
    }

    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
    let inviteToken = "";
    for (let i = 0; i < 8; i++) inviteToken += chars[Math.floor(Math.random() * chars.length)];

    await db("checkup_invitations").insert({
      sender_session_id: senderSessionId || null,
      sender_name: senderName || null,
      competitor_place_id: competitorPlaceId,
      competitor_name: competitorName,
      invite_token: inviteToken,
    });

    const baseUrl = process.env.APP_URL || "https://getalloro.com";
    const inviteUrl = `${baseUrl}/checkup?placeId=${encodeURIComponent(competitorPlaceId)}&name=${encodeURIComponent(competitorName)}&ref=competitor-invite&t=${inviteToken}`;

    return res.json({ success: true, inviteUrl, inviteToken });
  } catch (error: any) {
    logger.error({ err: error.message }, "[Checkup] Invite error:");
    return res.status(500).json({ success: false, error: "Failed to create invite" });
  }
});

checkupRoutes.get("/invite/:token", async (req, res) => {
  const { token } = req.params;
  db("checkup_invitations").where({ invite_token: token }).update({ opened: true, opened_at: new Date() }).catch(() => {});
  const invite = await db("checkup_invitations").where({ invite_token: token }).first();
  if (invite) {
    return res.redirect(`/checkup?placeId=${encodeURIComponent(invite.competitor_place_id)}&name=${encodeURIComponent(invite.competitor_name)}&ref=competitor-invite&t=${token}`);
  }
  return res.redirect("/checkup");
});

export default checkupRoutes;
