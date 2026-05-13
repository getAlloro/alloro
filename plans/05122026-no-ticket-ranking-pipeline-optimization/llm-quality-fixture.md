# Falls Church LLM Quality Fixture

## Baseline Source
Local Falls Church ranking timing pass before this optimization.

## Baseline Timings
- End-to-end harness runtime: ~202s.
- `processLocationRanking`: ~168.9s.
- LLM step: ~80.3s.
- Apify competitor detail scrape: ~36.1s.
- Pipeline client GBP fetch: ~24.2s.
- Pre-identification GBP fetch: ~26.2s.
- Apify Maps lookup: ~16s.

## Baseline Facts The New Output Must Preserve
- Practice: One Endodontics - Falls Church.
- Specialty/category: Endodontist.
- Rating/reviews: 5.0 rating and about 1,442 reviews in the verified rerun.
- Review velocity: about 54 new reviews in the 30-day GBP window.
- Maps estimate: #2 for `endodontist in Falls Church, VA`.
- Practice Health should remain high when GBP data is valid; a low score caused by `Dentist` plus zero reviews is a data-quality regression, not an acceptable faster result.
- Website audit should use `https://www.1endodontics.com/` when present in GBP.

## Acceptance Checks
- JSON parses and keeps the existing schema.
- `one_line_summary` names the biggest real next step, not generic SEO advice.
- `client_summary` or `render_text` mentions the Maps estimate and the key Practice Health driver.
- Recommendations cite numeric facts from the compact packet.
- Output is materially shorter than the baseline long-form response without becoming vague.

## New Run Notes
- New end-to-end runtime: 175.7s including a 77.7s identifier LLM outlier before `processLocationRanking`.
- New pipeline runtime: 75.3s for `processLocationRanking`.
- New LLM duration: 49.7s.
- New input/output tokens: 2,710 / 2,561.
- Output accepted: yes. JSON parsed, 4 gaps, 3 recommendations, and a specific one-line summary.
- Notes: `client_gbp` remained valid (`Endodontist`, 5.0 rating, 1,442 reviews, 54 reviews in 30d). `client_gbp` fetch reused the prefetch payload in 292ms. Curated competitor details reused 8 and scraped 0. Website audit used `https://www.1endodontics.com/`.
