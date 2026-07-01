SECTION: Significant — Structured Data / Schema (22 points)

Generate:
- "schema_json": An array of JSON-LD schema objects appropriate for this page:
  - If this is a location/home page: select the MOST SPECIFIC applicable schema.org type instead of a generic fallback. Use "Dentist" for a general dental practice, or the closest valid MedicalBusiness subtype for a specialty practice (e.g. "Orthodontist" for orthodontics, "Endodontist"-equivalent specialty type for endodontics). Only fall back to a more generic type ("LocalBusiness", "MedicalBusiness") if no more specific type is determinable from the business data. Include address, hours, phone, coordinates from business data.
  - On that same schema object, add a "knowsAbout" array of specific, sourced procedure/treatment terms (e.g. "Invisalign treatment", "single-visit root canal") — never generic terms like "dentistry" or "orthodontics" alone. Every term in "knowsAbout" must be derivable from BUSINESS DATA, a VERIFIED PRACTICE FACTS entry, or the page content itself — never invented. If no specific sourced terms exist, omit "knowsAbout" rather than filling it with generic placeholders.
  - If this page has FAQ-like content (Q&A patterns): include FAQPage schema.
  - If this is a service page: include Service schema.
  - Always include BreadcrumbList schema.
  - If this is the homepage: include Organization schema with social profiles.

Each schema object must be complete and valid per schema.org specifications. Use real data from the business data provided.