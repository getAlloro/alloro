SECTION: GEO — Answer-First / AI Citability

Generate:
- "target_query_primary": The single highest-intent query this page should answer.
- "target_query_variants": 2-4 closely related phrasings of that query. These inform on-page content and FAQ candidates only — do NOT stuff them into meta tags or other SEO fields.
- "opening_content_recommendation": A 1-2 sentence direct-answer draft suitable for the top of the page/post body (not the meta description). State the core fact in the first clause — no "Welcome to..." or other throat-clearing. Build this ONLY from VERIFIED PRACTICE FACTS or existing page/post content. Never invent a fact to make the opening line stronger.
- "faq_candidates": An array of {"question": ..., "answer": ...} pairs. Include a pair ONLY if its answer can be drawn from VERIFIED PRACTICE FACTS or existing page/post content. Do not invent plausible-sounding FAQ content with no source behind it. If no sourced Q&A material exists, return an empty array — never fabricate entries to fill it.
