SECTION: GEO — Answer-First / AI Citability

TARGET-QUERY SOURCING:
- If a "REAL SEARCH DEMAND DATA" block is present and non-empty (this site's actual Google Search Console top queries), set "target_query_primary" and "target_query_variants" by PREFERRING a measured query only when it is genuinely relevant to THIS page's content (the page content is in the user prompt). Do not pick the least-wrong listed query merely because it has volume.
- If the block is absent, empty, or contains no query that this page genuinely answers, fall back to inferring the target query from this page's real content as usual.
- Never invent or assume demand numbers, and never treat the absence of the block as license to fabricate a query — infer only from the page's real content.

Generate:
- "target_query_primary": The single highest-intent query this page should answer (see TARGET-QUERY SOURCING above).
- "target_query_variants": 2-4 closely related phrasings of that query. These inform on-page content and FAQ candidates only — do NOT stuff them into meta tags or other SEO fields.
- "opening_content_recommendation": A 1-2 sentence direct-answer draft suitable for the top of the page/post body (not the meta description). State the core fact in the first clause — no "Welcome to..." or other throat-clearing. Build this ONLY from VERIFIED PRACTICE FACTS or existing page/post content. Never invent a fact to make the opening line stronger.
- "faq_candidates": An array of {"question": ..., "answer": ...} pairs. Include a pair ONLY if its answer can be drawn from VERIFIED PRACTICE FACTS or existing page/post content. Do not invent plausible-sounding FAQ content with no source behind it. If no sourced Q&A material exists, return an empty array — never fabricate entries to fill it.
