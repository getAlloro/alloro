/**
 * Instant Website Generator
 *
 * Creates a website_builder.projects record and homepage during account creation.
 * Uses checkup data (Google Places, reviews, rating, category, hours) to build
 * a real website preview instantly, no async pipeline needed.
 *
 * Called synchronously after account creation in the checkup flow.
 * Wrapped in try/catch so it never blocks account creation.
 */

import { v4 as uuid } from "uuid";
import { NotificationModel } from "../models/NotificationModel";
import { ProjectModel } from "../models/website-builder/ProjectModel";
import logger from "../lib/logger";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

interface CheckupWebsiteInput {
  orgId: number;
  orgName: string;
  placeId?: string | null;
  checkupData?: any;
  category?: string | null;
}

interface ReviewQuote {
  text: string;
  author: string;
  rating: number;
}

// -----------------------------------------------------------------------
// Hostname from business name
// -----------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function generateHostnameFromName(name: string): string {
  const slug = slugify(name);
  if (!slug) {
    const num = Math.floor(1000 + Math.random() * 9000);
    return `site-${num}`;
  }
  // Append short random suffix for uniqueness
  const suffix = Math.floor(100 + Math.random() * 900);
  return `${slug}-${suffix}`;
}

// -----------------------------------------------------------------------
// Extract best review quotes as testimonials
// -----------------------------------------------------------------------

function extractTestimonials(checkupData: any): ReviewQuote[] {
  const quotes: ReviewQuote[] = [];

  // Try reviews from checkupData.place.reviews (raw Places API data)
  const placeReviews = checkupData?.place?.reviews || [];
  for (const r of placeReviews) {
    const text = r?.text?.text || r?.text || "";
    if (text && text.length > 20) {
      quotes.push({
        text: text.length > 300 ? text.slice(0, 297) + "..." : text,
        author: r?.authorAttribution?.displayName || r?.author || "Verified Customer",
        rating: r?.rating || 5,
      });
    }
  }

  // Also try reviews from the findings-level data
  if (quotes.length === 0 && checkupData?.reviews) {
    const rawReviews = Array.isArray(checkupData.reviews)
      ? checkupData.reviews
      : [];
    for (const r of rawReviews) {
      const text = typeof r === "string" ? r : r?.text || r?.snippet || "";
      if (text && text.length > 20) {
        quotes.push({
          text: text.length > 300 ? text.slice(0, 297) + "..." : text,
          author: r?.author || "Verified Customer",
          rating: r?.rating || 5,
        });
      }
    }
  }

  // Try praise_patterns from research brief if available
  if (quotes.length === 0 && checkupData?.praisePatterns) {
    for (const p of checkupData.praisePatterns.slice(0, 5)) {
      quotes.push({
        text: typeof p === "string" ? p : p?.text || "",
        author: "Verified Customer",
        rating: 5,
      });
    }
  }

  // Return top 5, prioritizing 4 and 5 star reviews
  return quotes
    .filter((q) => q.rating >= 4)
    .slice(0, 5);
}

// -----------------------------------------------------------------------
// Build hours display
// -----------------------------------------------------------------------

function formatHours(checkupData: any): string {
  const hours = checkupData?.place?.regularOpeningHours?.weekdayDescriptions;
  if (!hours || !Array.isArray(hours)) return "";

  return hours
    .map((h: string) => `<li class="py-1 border-b border-gray-100 last:border-0">${escapeHtml(h)}</li>`)
    .join("\n");
}

// -----------------------------------------------------------------------
// HTML escaping
// -----------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// -----------------------------------------------------------------------
// Derive a tagline from review themes or category
// -----------------------------------------------------------------------

function deriveTagline(orgName: string, checkupData: any, category?: string | null): string {
  // Try to extract themes from checkup findings
  const findings = checkupData?.findings || [];
  const praiseThemes = checkupData?.reviewThemes || [];

  // If there are review themes, use the most positive one
  if (praiseThemes.length > 0) {
    const theme = typeof praiseThemes[0] === "string"
      ? praiseThemes[0]
      : praiseThemes[0]?.theme || praiseThemes[0]?.title || "";
    if (theme) return `Known for ${theme.toLowerCase()}`;
  }

  // Use review-derived language. Never stock phrases.
  // If no review themes, use the rating + review count as social proof.
  const rating = checkupData?.rating || checkupData?.place?.rating;
  const reviewCount = checkupData?.reviewCount || checkupData?.place?.userRatingCount;

  if (rating && reviewCount && reviewCount >= 10) {
    return `${rating} stars from ${reviewCount} reviews`;
  }
  if (rating && rating >= 4.5) {
    return `Rated ${rating} by the people who know us best`;
  }

  // Minimal fallbacks that don't pretend to know the business
  const cat = (category || "").toLowerCase();
  if (cat.includes("endodont") || cat.includes("orthodont") || cat.includes("dentist"))
    return `${orgName} in your community`;
  if (cat.includes("attorney") || cat.includes("lawyer"))
    return `Serving the ${orgName.includes(" ") ? "community" : "area"} you call home`;

  return `${orgName}`;
}

// -----------------------------------------------------------------------
// Build homepage sections (HTML content matching Section[] format)
// -----------------------------------------------------------------------

function buildHomepageSections(
  orgName: string,
  checkupData: any,
  category?: string | null,
): Array<{ name: string; content: string }> {
  const rating = checkupData?.rating || checkupData?.place?.rating || null;
  const reviewCount = checkupData?.reviewCount || checkupData?.place?.userRatingCount || null;
  const address = checkupData?.place?.formattedAddress || checkupData?.address || "";
  const phone = checkupData?.place?.nationalPhoneNumber || checkupData?.phone || "";
  const website = checkupData?.place?.websiteUri || "";
  const tagline = deriveTagline(orgName, checkupData, category);
  const testimonials = extractTestimonials(checkupData);
  const hoursHtml = formatHours(checkupData);
  const escapedName = escapeHtml(orgName);
  const specialty = checkupData?.place?.primaryTypeDisplayName?.text
    || checkupData?.market?.specialty
    || category
    || "";

  // Photos from Google Places API v1
  // Each photo has: name (resource path), widthPx, heightPx, authorAttributions
  // To serve: GET https://places.googleapis.com/v1/{name}/media?maxWidthPx=1200&key={API_KEY}
  const photos: Array<{ name?: string; widthPx?: number; heightPx?: number }> = checkupData?.place?.photos || [];
  const apiKey = process.env.GOOGLE_API_KEY || process.env.GOOGLE_PLACES_API_KEY || "";

  // Pick the best hero photo: prefer landscape orientation, highest resolution
  const heroPhoto = photos.length > 0
    ? [...photos]
        .filter((p) => p.name) // must have resource name
        .sort((a, b) => {
          // Prefer landscape (wider than tall)
          const aLandscape = (a.widthPx || 0) >= (a.heightPx || 0) ? 1 : 0;
          const bLandscape = (b.widthPx || 0) >= (b.heightPx || 0) ? 1 : 0;
          if (bLandscape !== aLandscape) return bLandscape - aLandscape;
          // Then prefer highest resolution
          return ((b.widthPx || 0) * (b.heightPx || 0)) - ((a.widthPx || 0) * (a.heightPx || 0));
        })[0]
    : null;

  const heroPhotoUrl = heroPhoto?.name && apiKey
    ? `https://places.googleapis.com/v1/${heroPhoto.name}/media?maxWidthPx=1200&key=${apiKey}`
    : "";

  // Photo quality assessment for the photo brief
  const photoCount = photos.length;
  const hasHighResPhotos = photos.some((p) => (p.widthPx || 0) >= 800);
  const photoQuality: "good" | "low" | "none" =
    photoCount >= 5 && hasHighResPhotos ? "good"
    : photoCount > 0 ? "low"
    : "none";

  const sections: Array<{ name: string; content: string }> = [];

  // ── Hero Section ──
  const ratingStars = rating
    ? `<div class="flex items-center gap-2 mt-4">
        <span class="text-yellow-400 text-xl">${"★".repeat(Math.round(rating))}</span>
        <span class="text-gray-600">${rating} rating${reviewCount ? ` from ${reviewCount} reviews` : ""}</span>
      </div>`
    : "";

  // Hero photo as background (if available and high enough quality)
  const heroBg = heroPhotoUrl
    ? `background-image: linear-gradient(to bottom, rgba(26,29,35,0.7), rgba(26,29,35,0.85)), url('${heroPhotoUrl}'); background-size: cover; background-position: center;`
    : "background: linear-gradient(135deg, #1A1D23 0%, #212D40 100%);";

  sections.push({
    name: "hero",
    content: `<section class="relative text-white py-20 sm:py-28 px-6" style="${heroBg}">
  <div class="max-w-3xl mx-auto text-center relative">
    ${phone ? `<a href="tel:${escapeHtml(phone)}" class="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white mb-6 transition-colors"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/></svg>${escapeHtml(phone)}</a>` : ""}
    <h1 class="text-3xl sm:text-5xl font-semibold tracking-tight leading-tight">${escapedName}</h1>
    <p class="text-base sm:text-lg text-white/60 mt-4 max-w-xl mx-auto leading-relaxed">${escapeHtml(tagline)}</p>
    ${ratingStars}
    <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
      ${phone ? `<a href="tel:${escapeHtml(phone)}" class="inline-flex items-center justify-center px-6 py-3 bg-[#D56753] text-white font-semibold rounded-lg shadow-sm hover:bg-[#C45A46] transition-all text-sm">Call ${escapeHtml(phone)}</a>` : ""}
      <a href="#contact" class="inline-flex items-center justify-center px-6 py-3 border border-white/20 text-white/80 font-medium rounded-lg hover:bg-white/10 transition-all text-sm">Request appointment</a>
    </div>
  </div>
</section>`,
  });

  // ── Testimonials Section ──
  if (testimonials.length > 0) {
    const testimonialCards = testimonials
      .map(
        (t) => `<div class="bg-white rounded-xl p-6" style="border: 1px solid rgba(0,0,0,0.06); box-shadow: 0 1px 2px rgba(0,0,0,0.04);">
      <div class="flex items-center gap-1 mb-3">${Array.from({ length: t.rating }).map(() => '<svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/></svg>').join("")}</div>
      <p class="text-sm text-[#1A1D23]/80 leading-relaxed mb-4">"${escapeHtml(t.text)}"</p>
      <p class="text-xs font-medium text-[#1A1D23]/50">${escapeHtml(t.author)}</p>
    </div>`,
      )
      .join("\n    ");

    sections.push({
      name: "testimonials",
      content: `<section class="py-16 sm:py-20 px-6" style="background: #F7F8FA;">
  <div class="max-w-5xl mx-auto">
    <h2 class="text-2xl sm:text-3xl font-semibold text-[#1A1D23] text-center mb-2">What people say</h2>
    <p class="text-sm text-gray-400 text-center mb-10">From Google Reviews. Real words from real people.</p>
    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
    ${testimonialCards}
    </div>
  </div>
</section>`,
    });
  }

  // ── About Section -- use REAL data, not stock phrases ──
  // Build from actual review count, rating, and address.
  // Never "Proven Results" or "Community Focused" -- those are the puppy mill.
  const aboutItems: Array<{ title: string; body: string }> = [];

  if (rating && rating >= 4.5 && reviewCount) {
    aboutItems.push({
      title: `${rating} stars, ${reviewCount} reviews`,
      body: `Real ratings from real people who chose ${escapedName}.`,
    });
  }
  if (address) {
    const city = checkupData?.place?.city || checkupData?.market?.city || "";
    if (city) {
      aboutItems.push({
        title: `Located in ${escapeHtml(city)}`,
        body: `Serving the ${escapeHtml(city)} community and surrounding areas.`,
      });
    }
  }
  if (phone) {
    aboutItems.push({
      title: "Easy to reach",
      body: `Call <a href="tel:${escapeHtml(phone)}" class="text-[#D56753] font-semibold">${escapeHtml(phone)}</a> or use the form below.`,
    });
  }
  // If we have no real data, show one honest item
  if (aboutItems.length === 0) {
    aboutItems.push({
      title: `About ${escapedName}`,
      body: "More details are being added as Alloro learns about this business.",
    });
  }

  const aboutCards = aboutItems.map(item =>
    `<div class="text-center">
      <h3 class="font-semibold text-[#1A1D23] mb-2">${item.title}</h3>
      <p class="text-gray-500 text-sm leading-relaxed">${item.body}</p>
    </div>`
  ).join("\n");

  sections.push({
    name: "about",
    content: `<section class="py-20 px-6">
  <div class="max-w-4xl mx-auto text-center">
    <h2 class="text-3xl font-semibold text-[#1A1D23] mb-10">${escapedName}</h2>
    <div class="grid gap-8 md:grid-cols-${Math.min(aboutItems.length, 3)} mt-6">
      ${aboutCards}
    </div>
  </div>
</section>`,
  });

  // ── Contact / Hours Section ──
  const contactParts: string[] = [];
  if (address) {
    contactParts.push(`<div class="mb-6">
        <h3 class="font-semibold text-[#1A1D23] mb-1">Location</h3>
        <p class="text-gray-600">${escapeHtml(address)}</p>
      </div>`);
  }
  if (phone) {
    contactParts.push(`<div class="mb-6">
        <h3 class="font-semibold text-[#1A1D23] mb-1">Phone</h3>
        <p class="text-gray-600"><a href="tel:${escapeHtml(phone)}" class="text-[#D56753] hover:underline">${escapeHtml(phone)}</a></p>
      </div>`);
  }
  if (website) {
    contactParts.push(`<div class="mb-6">
        <h3 class="font-semibold text-[#1A1D23] mb-1">Website</h3>
        <p class="text-gray-600"><a href="${escapeHtml(website)}" target="_blank" rel="noopener" class="text-[#D56753] hover:underline">${escapeHtml(website)}</a></p>
      </div>`);
  }

  const hoursBlock = hoursHtml
    ? `<div>
        <h3 class="font-semibold text-[#1A1D23] mb-3">Hours</h3>
        <ul class="text-gray-600 text-sm">${hoursHtml}</ul>
      </div>`
    : "";

  sections.push({
    name: "contact",
    content: `<section id="contact" class="py-20 px-6 bg-[#212D40] text-white">
  <div class="max-w-4xl mx-auto">
    <h2 class="text-3xl font-bold text-center mb-12">Get in Touch</h2>
    <div class="grid gap-12 md:grid-cols-2">
      <div>
        ${contactParts.join("\n        ") || `<p class="text-gray-300">Contact us to learn more about our services.</p>`}
      </div>
      ${hoursBlock ? `<div>${hoursBlock}</div>` : ""}
    </div>
  </div>
</section>`,
  });

  // ── Footer Section ──
  sections.push({
    name: "footer",
    content: `<footer class="py-8 px-6 bg-gray-900 text-gray-400 text-center text-sm">
  <p>&copy; ${new Date().getFullYear()} ${escapedName}. All rights reserved.</p>
  <p class="mt-2">Powered by <a href="https://getalloro.com" class="text-[#D56753] hover:underline" target="_blank" rel="noopener">Alloro</a></p>
</footer>`,
  });

  return sections;
}

// -----------------------------------------------------------------------
// Build wrapper (full HTML shell with Tailwind CDN)
// -----------------------------------------------------------------------

function buildWrapper(orgName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(orgName)}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; }
  </style>
</head>
<body>
{{slot}}
</body>
</html>`;
}

// -----------------------------------------------------------------------
// Main: generate website project + homepage
// -----------------------------------------------------------------------

// -----------------------------------------------------------------------
// Photo Quality Assessment + Brief
// The Canon says: photo brief is a PRODUCT OUTPUT, not a request.
// The practice receives specific, plain-English directions for
// 3-5 photos to take with an iPhone.
// -----------------------------------------------------------------------

function assessPhotoQuality(checkupData: any): {
  quality: "good" | "low" | "none";
  count: number;
  hasHighRes: boolean;
  brief: string[] | null;
} {
  const photos: Array<{ widthPx?: number; heightPx?: number }> =
    checkupData?.place?.photos || [];
  const count = photos.length;
  const hasHighRes = photos.some((p) => (p.widthPx || 0) >= 800);

  if (count >= 5 && hasHighRes) {
    return { quality: "good", count, hasHighRes, brief: null };
  }

  // Generate specific, plain-English photo directions
  // Not photography jargon. Just: take this photo, of this, in this location.
  const brief: string[] = [];

  if (count === 0) {
    brief.push(
      "Take a photo of the whole team together. Natural light if possible. Smiling, not posed. This becomes your homepage hero image.",
      "Take a photo of your front entrance or lobby during a normal day. People want to see what they're walking into.",
      "Take a photo of your main workspace or treatment area. Clean, well-lit, modern equipment visible.",
    );
  } else {
    // Has some photos but needs more or better quality
    if (!hasHighRes) {
      brief.push(
        "Your current photos are low resolution. Retake with your iPhone in good lighting. Hold the phone steady and tap to focus.",
      );
    }
    if (count < 3) {
      brief.push(
        "Add a team photo. Real people build more trust than a logo or building exterior.",
      );
    }
    if (count < 5) {
      brief.push(
        "Add a photo of your workspace. Show people what the experience feels like.",
      );
    }
  }

  return {
    quality: count > 0 ? "low" : "none",
    count,
    hasHighRes,
    brief: brief.length > 0 ? brief : null,
  };
}

export async function generateInstantWebsite(input: CheckupWebsiteInput): Promise<{
  projectId: string;
  hostname: string;
  previewUrl: string;
} | null> {
  const { orgId, orgName, placeId, checkupData, category } = input;

  // Check if a project already exists for this org
  const existing = await ProjectModel.findByOrganizationId(orgId);

  if (existing) {
    logger.info(`[InstantWebsite] Project already exists for org ${orgId}, skipping`);
    return {
      projectId: existing.id,
      // The pre-refactor inline read returned an untyped row; preserve the exact
      // runtime value (no coercion) while satisfying the typed return shape.
      hostname: existing.generated_hostname as string,
      previewUrl: `https://${existing.generated_hostname}.sites.getalloro.com`,
    };
  }

  const projectId = uuid();
  const hostname = generateHostnameFromName(orgName);
  const wrapper = buildWrapper(orgName);
  const sections = buildHomepageSections(orgName, checkupData || {}, category);
  const pageId = uuid();
  const previewUrl = `https://${hostname}.sites.getalloro.com`;
  const photoAssessment = assessPhotoQuality(checkupData || {});

  // Atomic: project + homepage + org status must land together. A crash after
  // the project insert would otherwise leave an orphan project with no homepage
  // — and the dedup check at the top of this function would then treat that
  // broken project as "already generated" on every retry. The model owns the
  // transaction boundary; payloads are passed verbatim.
  await ProjectModel.createInstantWebsiteWithHomepage({
    projectRow: {
      id: projectId,
      organization_id: orgId,
      generated_hostname: hostname,
      display_name: orgName,
      selected_place_id: placeId || null,
      status: "LIVE",
      primary_color: "#D56753",
      accent_color: "#212D40",
      wrapper,
      created_at: new Date(),
      updated_at: new Date(),
    },
    pageRow: {
      id: pageId,
      project_id: projectId,
      path: "/",
      version: 1,
      status: "published",
      generation_status: "ready",
      sections: JSON.stringify(sections),
      display_name: "Home",
      sort_order: 0,
      created_at: new Date(),
      updated_at: new Date(),
    },
    organizationId: orgId,
    organizationUpdate: {
      patientpath_status: "preview_ready",
      patientpath_preview_url: previewUrl,
      // Store photo assessment so the dashboard can show the photo brief
      ...(photoAssessment.brief ? { photo_brief: JSON.stringify(photoAssessment) } : {}),
    },
  });

  // Write notification (best-effort, kept outside the transaction so a
  // notification failure never rolls back the committed website)
  await NotificationModel.create({
    organization_id: orgId,
    title: "Your website preview is ready",
    message: `We built a custom website for ${orgName} using your real data and reviews. Take a look.`,
    type: "system",
    metadata: {
      source: "instant_website_generator",
      preview_url: previewUrl,
      project_id: projectId,
    },
  }).catch(() => {});

  logger.info(`[InstantWebsite] Created project ${projectId} for org ${orgId} -> ${previewUrl}`);

  return { projectId, hostname, previewUrl };
}
