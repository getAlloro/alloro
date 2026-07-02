SECTION: Significant — Structured Data / Schema (22 points)

Generate:
- "schema_json": An array of JSON-LD schema objects appropriate for this page:
  - If this is a location/home page: use "Dentist" as the @type for any dental, orthodontic, or endodontic specialty practice — schema.org has no dedicated "Orthodontist" or "Endodontist" type, so inventing one produces invalid structured data that gets silently dropped. Convey the specialty through "knowsAbout" and "description" instead of the @type. Only use a more generic type ("LocalBusiness", "MedicalBusiness") if the practice is not a dental/orthodontic/endodontic one. Include address, hours, phone, coordinates from business data.
  - On that same schema object, add a "knowsAbout" array of specific, sourced procedure/treatment terms (e.g. "Invisalign treatment", "single-visit root canal") — never generic terms like "dentistry" or "orthodontics" alone. Every term in "knowsAbout" must be derivable from BUSINESS DATA, a VERIFIED PRACTICE FACTS entry, or the page content itself — never invented. If no specific sourced terms exist, omit "knowsAbout" rather than filling it with generic placeholders.
  - If this is a service page: include Service schema.
  - Always include BreadcrumbList schema.
  - If this is the homepage: include Organization schema with social profiles.

Do NOT emit an "aggregateRating" object on any schema. The system injects the practice's REAL rating and review count from synced review data, only onto the primary business entity — a rating you invent is a false claim and is discarded.

Do NOT hand-author a FAQPage schema here. The system builds FAQPage separately from the sourced "faq_candidates" produced by the GEO section, so it only ever contains real, source-backed Q&A. Inventing FAQ entries in schema_json would put fabricated Q&A on the page.

Each schema object must be complete and valid per schema.org specifications. Use real data from the business data provided. Valid schema.org business @types only — "Dentist", "MedicalBusiness", "MedicalClinic", "Physician", "LocalBusiness", "Organization"; there is no "Dentist"-specialty subtype, so never invent one.