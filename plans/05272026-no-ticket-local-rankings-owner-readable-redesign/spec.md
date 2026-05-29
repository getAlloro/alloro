# Local Rankings Owner-Readable Redesign

## Why
The client Local Rankings page has useful ranking and GBP engagement data, but the first screen asks a non-technical practice owner to interpret too many labels, scores, chips, and proprietary terms. The redesign should make the page tell one clear story: where the practice appears on Google Maps, who it competes with, and what action should happen next.

## What
Redesign the `/rankings` Overview experience so the primary reading order is:
1. A larger plain-English insight.
2. The Google Maps position number with a clear uncertainty tooltip.
3. Selected competitors on Google Maps.
4. Review and Google post actions that Alloro can help with.

Demote the proprietary Practice Health computation into a secondary details surface, replace vague/static UI language with owner-readable copy, remove unhelpful filler labels/chips, and update `/Users/rustinedave/Desktop/alloro-docs` parity.

## Context

**Relevant files:**
- `frontend/src/components/dashboard/RankingsDashboard.tsx` - owns `/rankings`, current Overview/Alloro Engage tabs, Maps rank card, insight callout, competitor list, Practice Health gauge, factors, gaps, and recommendations.
- `frontend/src/components/dashboard/rankings/competitorComparison.ts` - builds selected competitor rows used by the Google Maps competitor list and comparison modal.
- `frontend/src/components/dashboard/rankings/RankingsDashboardViewTabs.tsx` - current `Overview` / `Alloro Engage™` toggle.
- `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx` - overview card for review engagement; already reads review counts, reply coverage, work items, and post schedule data from `useGbpAutomation`.
- `frontend/src/components/dashboard/gbp-automation/GbpAutomationPanel.tsx` - existing Reviews / GBP Posts / Settings action surface. Keep this as the action owner.
- `frontend/src/api/gbpAutomation.ts` - typed GBP automation response shape, including review counts, reply ops, work items, next post generation, sync health, and published-post APIs.
- `frontend/src/hooks/queries/useGbpAutomationQueries.ts` - React Query owner for GBP automation data and mutations.
- `src/controllers/practice-ranking/PracticeRankingController.ts` - `GET /latest` returns completed rankings, previous ranking comparison, onboarding status, selected competitor metadata, Maps search data, and LLM analysis.
- `src/controllers/practice-ranking/feature-utils/util.ranking-formatter.ts` - formats `searchPosition`, `searchCheckedAt`, `searchPositionSource`, selected competitor rows, `practiceHealth`, `rankingFactors`, `rawData`, and `llmAnalysis`.
- `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx` - docs visual replica for this page.
- `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts` - docs page copy, hotspots, steps, and changelog.

**Patterns to follow:**
- Match the current client dashboard/PMS light card language: constrained `1320px` layout, white cards, soft borders, 14px radius, restrained orange/navy accents, direct headings.
- Keep data-fetching in existing hooks/components; no API calls directly in new components.
- Keep GBP action state inside `GbpAutomationPanel` and its children.
- If extracting from `RankingsDashboard.tsx`, put focused subcomponents under `frontend/src/components/dashboard/rankings/` and keep each new component under 200 lines.

**Reference files:**
- `frontend/src/components/dashboard/DashboardOverview.tsx` - closest client dashboard composition pattern.
- `frontend/src/components/PMS/dashboard/PmsDashboardSurface.tsx` - closest owner-readable dashboard hierarchy.
- `frontend/src/components/dashboard/focus/LocalRankingCard.tsx` - compact “Maps estimate + summary” pattern; use its simplicity, not its raw query-key pattern.
- `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx` - existing overview engagement card to evolve rather than replace.

## Research Findings

- `/rankings` is rendered by `Dashboard.tsx` when the route is `/rankings`; `RankingsDashboard` receives the active organization and selected location.
- `GET /api/practice-ranking/latest` already returns the needed ranking data for this redesign: `searchPosition`, `searchQuery`, `searchCheckedAt`, `searchStatus`, selected competitor search results, previous search data, `practiceHealth`, `rankingFactors`, and `llmAnalysis`.
- The current UI already uses `toLocaleDateString`, which is browser-local, but the top-level `Latest snapshot` label uses `observedAt`. The safer source for the Google Maps number is `searchCheckedAt`; if that cannot be shown reliably, hide the date rather than showing a misleading one.
- Current problematic copy includes `Market Intelligence`, `Practice insight`, `Practice Health`, `EST IN TOP 10`, `weighted score`, `Top moves to climb`, `Opportunities`, `Alloro Engage™`, and repeated `GBP` labels. These read like internal/product language, not practice-owner language.
- `GbpEngagementSummaryCard` already has enough data to summarize review reply backlog and post-draft state from `readiness`, `workItems`, and `nextPostGenerationAt`; no backend work is required for the overview card.
- GBP performance metrics such as calls, website clicks, directions, impressions, and search breakdown exist in GBP controller/service plumbing, but they are not part of the current `/rankings` overview response. Adding them here would expand this from a UI redesign into a new data-product decision.

## Design-Agent Assessment

No external design agent is needed for this pass. This belongs in Codex because the main risk is information architecture tied to real data contracts, not open-ended visual exploration.

Use Claude Design / Google Stitch only if the goal changes to a net-new visual direction or a polished standalone mockup set. For this scoped app change, an external mockup tool would likely invent decorative hierarchy and miss the data semantics.

## Constraints

**Must:**
- Lead with an enlarged owner-readable insight using the existing `one_line_summary` / `client_summary` data when present.
- Rename the insight heading from `Practice insight` to `What this means`.
- Keep the Google Maps position as the headline metric, but avoid copy like `Estimated #X in top 10`.
- Add or preserve a question-mark tooltip explaining the Maps number can vary by device, prior search behavior, and exact physical location; state that the source is SerpAPI over Google Maps.
- Replace selected-competitor `EST IN TOP 10` labels with actual positions when available, e.g. `#3 on Maps`; use plain fallback copy such as `Outside top 10` / `Not measured`.
- Shrink the oversized Maps rank typography so it leads without overpowering the insight.
- Demote Practice Health into a secondary `Why you rank here` / `Score details` surface; keep comparison and factor details available, not deleted.
- Keep the selected-competitors-in-Google-Maps view and competitor comparison modal.
- Update the overview GBP card to explain review reply and Google post actions in plain language, using existing data only.
- Replace public-facing `GBP` copy with `Google profile`, `Google reviews`, or `Google posts` where the audience is a client user.
- Update Alloro Docs replica, hotspots, tooltip copy, page steps, and changelog for visible dashboard changes.

**Must not:**
- Add new backend endpoints, database migrations, or Google API fetches in this redesign.
- Add calls, directions, website clicks, search breakdown, or profile-completeness metrics to `/rankings` until each has a clear owner action and Alloro action.
- Remove Practice Health data from the system or admin-facing surfaces.
- Duplicate review/post state outside the existing GBP automation hook/panel.
- Refactor unrelated dashboard/sidebar/onboarding code.
- Change ranking algorithms, ranking pipeline, SerpAPI sampling, or competitor selection behavior.

**Out of scope:**
- New GBP performance metric cards.
- LLM prompt rewrites for ranking analysis.
- Admin Practice Ranking page redesign.
- Production/dev deployment validation.
- Changelog finalization.

## Risk

**Level:** 2

**Risks identified:**
- `RankingsDashboard.tsx` is already over 2,000 lines, so direct edits can deepen the monolith. -> **Mitigation:** extract only the touched overview sections into focused `rankings/` subcomponents instead of adding more inline JSX.
- Renaming `Practice Health` could obscure a useful diagnostic concept. -> **Mitigation:** demote and explain it as `Why you rank here` / `Score details`; keep the score and factor breakdown available behind secondary UI.
- Removing product-y labels like `Alloro Engage™` may affect docs/onboarding language. -> **Mitigation:** update docs parity and keep routes/actions unchanged; only change client-facing labels.
- Dates can remain misleading if the wrong timestamp is used. -> **Mitigation:** use `searchCheckedAt` for the Maps metric and browser-local formatting; hide the date if missing or invalid.
- Adding GBP performance metrics now would create noisy, low-action dashboard drift. -> **Mitigation:** explicitly exclude those metrics from this plan and evaluate them in a separate data-product pass.

**Blast radius:**
- Client `/rankings` Overview first screen.
- `/rankings` Reviews & Posts tab label/CTA copy.
- `GbpEngagementSummaryCard` overview card.
- Competitor comparison entry point and selected competitor list copy.
- Local Rankings docs page and visual replica in `/Users/rustinedave/Desktop/alloro-docs`.
- Onboarding wizard target labels only if visible copy changes touch wizard-anchored sections.

**Pushback:**
- Do not turn this into “show every GBP metric we can access.” Future-us will hate that dashboard. The owner needs one story and one next action, not a wall of semi-actionable numbers.
- Do not send this to a design agent before the data story is locked. The current problem is semantic clutter, not a missing gradient.

## Tasks

## Revision Log

### Rev 1 — May 27, 2026
**Change:** Tighten the first viewport after visual review: pair `What this means` with the Google Maps position card, remove the dead horizontal space in the Maps card, and keep the action/competitor sections in a more balanced reading order.
**Reason:** The first execution technically matched the copy hierarchy, but the screenshot showed an awkward long insight banner, a too-wide rank card with empty center space, and an uneven two-column stack.
**Updated Done criteria:** First viewport should feel like one composed overview row, not separate floating cards fighting for attention.

### Rev 2 — May 27, 2026
**Change:** Reorder the overview again: make `What this means` a full-width single row, place `Google Maps position` and `Why you rank here` side by side, put `Your competitors on Google Maps` directly under the Maps card, move score details/gaps behind CTAs inside `Why you rank here`, render `Best next actions` as three highlighted cards in one row, and place the Reviews & Google posts card below.
**Reason:** The previous side-by-side insight/rank treatment still did not match the intended scanning story. The page should read as summary -> rank/score context -> competitors -> actions -> reviews/posts.
**Updated Done criteria:** Score details and gaps should no longer appear as standalone overview cards; they should open from the `Why you rank here` card.

### Rev 3 — May 28, 2026
**Change:** Fix the broken visual stacking shown in the screenshots by removing forced full-height behavior from the Maps card, aligning the two-column overview to the top, and rendering the score-card CTAs as equal-width buttons.
**Reason:** The Maps card was stretching/overflowing its grid column, causing the competitors table and action cards to overlap. This was a layout bug, not a data issue.
**Updated Done criteria:** Competitors, action cards, and Reviews & Google posts must stack naturally with no overlap at desktop width.

### Rev 4 — May 28, 2026
**Change:** Remove the redundant standalone `Why you rank here` overview card and upgrade `What this means` into a combined overview card with the sentiment text, compact score gauge, verdict, and CTAs for competitor details, score details, and gaps.
**Reason:** The page still had two explanation surfaces competing for attention. The score context belongs inside the primary overview card, not beside it as a second headline card.
**Updated Done criteria:** The overview should have one explanation card before the Maps section; the separate `Why you rank here` card should not render on the main page.

### Rev 5 — May 28, 2026
**Change:** Remove duplicate detail headings inside the score/gaps modals and update the docs replica to show the fused overview card instead of a separate `Why you rank here` card.
**Reason:** The modal screenshots showed repeated titles, and the docs replica still reflected the prior two-card overview.
**Updated Done criteria:** Modal content should not repeat the modal title as the first inner card heading; docs should mirror the combined overview card, Maps card, competitors, actions, and Reviews & Google posts order.

### Rev 6 — May 28, 2026
**Change:** Fold the Google Maps position, query, star rating, review count, and metric sublines into the primary `What this means` card, then remove the standalone Maps card and visible `checked May 25` timestamp labels.
**Reason:** The overview card now reads well, but the Maps position is still a separate card and the checked-date microcopy adds clutter for non-technical users.
**Updated Done criteria:** The first overview card should contain the plain-English takeaway, compact score context, Maps position summary, star rating, reviews, and CTAs. No visible `checked {date}` label should remain in the main rankings overview.

### Rev 7 — May 28, 2026
**Change:** Rename the Maps headline to `Local Search Estimate`, rename the competitor section to `Your competitors on Local Search`, remove the competitor-details CTA/modal, move the sortable competitor comparison table inline, rename score/gap CTAs, and make the score arc larger with a tooltip instead of a verdict sentence.
**Reason:** Competitor comparison should be visible where the user is already reading competitor data, and the score arc needs explanation without another vague sentence competing with the main insight.
**Updated Done criteria:** No standalone competitor modal or `See competitor details` CTA should remain; the inline competitor section should include the comparison insight, sort menu, and table.

### Rev 8 — May 28, 2026
**Change:** Make `Local Search` the first and default competitor table sort instead of `Review Count`, and update the docs replica to show the same default.
**Reason:** The competitor table should lead with the ranking position the owner came to the page to understand. Review count is still useful, but it should not be the opening sort.
**Updated Done criteria:** The competitor section should load sorted by local search position, with the sort menu showing `Local Search` by default.

### Rev 9 — May 28, 2026
**Change:** Replace the six Reviews & Google posts metric tiles with one highlighted action row that summarizes review reply backlog and flags when no Google post has gone live in the last 15 days. The CTA should say `Go to Alloro Engage™` when action is needed and `Manage Your Reviews` when reviews/posts are healthy.
**Reason:** The six raw tiles add scanning work without telling the owner what to do. This card should summarize the action state, not expose dashboard instrumentation.
**Updated Done criteria:** The Reviews & Google posts card should render one action summary row, handle good/bad review and post states correctly, and use the existing published-posts endpoint only for latest-post freshness.

### Rev 10 — May 28, 2026
**Change:** Tighten the top update-location card so the helper copy and action buttons stay lean and do not wrap on desktop.
**Reason:** The previous copy and button labels were too wide for the card and created awkward line breaks.
**Updated Done criteria:** The update-location card should read as a compact one-row control group on desktop.

### Rev 11 — May 28, 2026
**Change:** Make the Reviews & Google posts action card more editorial with serif emphasis, orange-highlighted counts, richer sentiment from existing review/post freshness variables, and a `Fix with Alloro Engage™` CTA when attention is needed. Move the review trend graph out of the Local Rankings overview and into the Alloro Engage reviews dashboard.
**Reason:** The overview card was still reading like instrumentation plus a chart. The owner needs a stronger explanation and direct action; the graph belongs in the workflow where replies are managed.
**Updated Done criteria:** Local Rankings shows one engaging action card without the trend graph; Alloro Engage reviews shows the trend graph near the reply workflow.

### Rev 12 — May 28, 2026
**Change:** Remove the redundant Reviews & Google posts heading/helper copy, render the reviews/posts action as its own yellow overview-style card, let ranking LLM output provide optional card sentiment, and block website-speed recommendations from ranking outputs.
**Reason:** Website speed work is Alloro-owned and should not be assigned to doctors. The reviews/posts card should read like a single owner action, not a nested module label.
**Updated Done criteria:** The Local Rankings overview should not show a separate Reviews & Google posts heading above the action card, and new ranking recommendations should not include website/page-speed actions.

### Rev 13 — May 28, 2026
**Change:** Fix the main score/source mismatch by making the overview gauge use the same owner-visible 8-factor score sent to the ranking LLM, add a compact review/post engagement summary to the LLM payload, and let the LLM return highlighted overview/engagement card copy.
**Reason:** The page was mixing two score concepts: the gauge rendered the persisted 6-factor competitive score while the LLM summary referenced the 8-factor score. Review reply counts also lived only in the frontend, so the agent could not generate grounded engagement copy.
**Updated Done criteria:** The overview text and gauge must use the same score basis; the LLM may mention review replies only from the compact engagement summary and must omit review-reply language when everything is replied.

### Rev 14 — May 28, 2026
**Change:** Move the Reviews & Google posts card above Best next actions, switch it from yellow to white, and bring back only the important info cards: recent reply backlog, total reply backlog, average response time, reply coverage, and Google post freshness.
**Reason:** The action card is important enough to appear before recommendations, but the yellow overview treatment made it visually compete with the primary What this means card. A white card with compact metrics restores useful context without returning to the noisy six-tile dashboard.
**Updated Done criteria:** Reviews & Google posts appears before Best next actions, uses a white card surface, and shows compact owner-useful metric cards without reintroducing the removed trend graph.

### Rev 15 — May 28, 2026
**Change:** Move the score-detail and gap-detail buttons into the Local Search Estimate card as stacked quick actions on the far right, and pull the star rating/review metrics closer to the rank number.
**Reason:** The white estimate card had unused horizontal space while the buttons sat in a separate row, making the overview feel stretched and disconnected.
**Updated Done criteria:** The Local Search Estimate card should read as one compact unit: rank, query, rating/reviews, then quick actions on the right.

### Rev 16 — May 28, 2026
**Change:** Recompose the overview card into a left content column and a right action rail: What this means plus Local Search Estimate on the left, Local Search Score plus stacked detail buttons on the right.
**Reason:** The previous layout moved the buttons into the estimate card, but the score and buttons still read as separate ideas. The intended shape groups score-related actions together while keeping the local estimate as a clean horizontal card.
**Updated Done criteria:** The score gauge and score/gap actions should live in a unified right rail; Local Search Estimate should remain a wide left-side card with rating/review metrics close to the rank number.

### Rev 17 — May 28, 2026
**Change:** Stretch the Local Search Estimate card to fill the remaining left-column height and replace the route-level Rankings skeleton loader with the same centered cogitating loader used by the parent dashboard.
**Reason:** The overview left column had an awkward blank cream area below the estimate card, and the page visibly switched from the simple loader into a heavier skeleton state after the parent dashboard finished loading.
**Updated Done criteria:** The estimate card fills the remaining overview space on desktop, and `/rankings` should keep the centered cogitating loader throughout its loading path instead of changing into the skeleton.

### Rev 18 — May 28, 2026
**Change:** Simplify the Reviews & Google posts card by removing average response time and reply coverage tiles, adding a normal title/subtitle header, removing the alert icon badge, and removing the `What this means` eyebrow from the main overview card.
**Reason:** The remaining reviews/posts card should read like a clean dashboard section, not a warning module with secondary operational metrics. The overview sentence is already clear enough without an extra label above it.
**Updated Done criteria:** Reviews & Google posts shows only recent reply backlog, total reply backlog, and Google post freshness; the action notice has no icon badge; the overview card has no `What this means` label.

### Rev 19 — May 28, 2026
**Change:** Rename the Reviews & Google posts overview card header to `Alloro Engage™`, remove the tracked-search subtitle, remove the generated action title from the notice, and enlarge the narrative/highlight typography.
**Reason:** The card should read as one strong Alloro Engage action surface rather than a section header plus a second headline. The query subtitle duplicated context already shown above the page.
**Updated Done criteria:** The Alloro Engage card should show one header, one larger narrative line/block, no `endodontist in Fredericksburg, VA` subtitle, and no separate `Reply to Reviews...` heading.

### Rev 20 — May 28, 2026
**Change:** Rename the internal reviews/posts workspace header to `Alloro Engage™` too.
**Reason:** Leaving the old title inside the tab would make the rename inconsistent across the same workflow.
**Updated Done criteria:** No user-facing `Reviews & Google posts` heading should remain in the Local Rankings Engage surfaces.

### Rev 21 — May 28, 2026
**Change:** Reorder the overview page sections to show Best next actions immediately after the main card, followed by Alloro Engage, with the competitor table last.
**Reason:** The action cards should carry the next step right after the main summary, while the competitor table is supporting detail and can sit lower.
**Updated Done criteria:** `/rankings` overview order should be main overview, Best next actions, Alloro Engage, then Your competitors on Local Search.

### Rev 22 — May 28, 2026
**Change:** Tighten the competitor, action, and Alloro Engage card styling: remove the competitor keyword subtitle, use a subtler orange action-card surface, align the Engage heading with section headers, and move Engage metrics plus CTA into a right-side stack.
**Reason:** The competitor subtitle repeats context, the recommendation cards were reading too yellow, and the Engage card needed a clearer two-column information hierarchy.
**Updated Done criteria:** Competitor table header has no search-query subtitle; action cards use the soft orange tint; Engage narrative is 19px display text with orange highlights and a right rail for metrics plus CTA.

### Rev 23 — May 28, 2026
**Change:** Make the `How to close the gap` modal rows expanded/static instead of dropdowns, add an Alloro Engage tooltip, and rebuild the Engage card as a 50/50 split with a 2x2 metric grid plus a full-width CTA below it.
**Reason:** The modal currently looks interactive in a way that adds no value, and the Engage card needs a cleaner metric/action layout with stronger numeric hierarchy.
**Updated Done criteria:** Gap rows show their details by default with no chevrons/dropdown behavior; Alloro Engage explains reviews/posts in a tooltip; Engage metrics render as four larger tiles in a 2x2 grid with the CTA below.

### Rev 24 — May 28, 2026
**Change:** Switch individual recommendation cards back to white elevated cards, then revise Alloro Engage so the three compact metrics sit below the narrative while the right side shows a latest-review draft/save/deploy quick action.
**Reason:** The orange recommendation tiles were too heavy, and the Engage card should do useful work immediately instead of spending the right half on passive metrics.
**Updated Done criteria:** Recommendation cards are white with soft shadows; Alloro Engage shows only the three compact metrics under the text and a single latest-review reply action on the right.

### Rev 25 — May 28, 2026
**Change:** Tighten the latest-review quick action so the review/comment and reply editor fit the right-side card: smaller type, clamped review text with read-more, and a styled compact reply input scrollbar.
**Reason:** The reply card was visually overflowing the available space and the raw review/comment treatment made the action feel heavier than the surrounding Alloro Engage layout.
**Updated Done criteria:** The latest-review quick action fits inside the Engage card at desktop width, long review text can expand/collapse, and the reply input uses the compact styled editor treatment in both app and docs replica.

### Rev 26 — May 28, 2026
**Change:** Make the latest-review quick action occupy the full vertical space of the Alloro Engage card by turning it into a height-filling column and letting the reply editor flex into remaining space.
**Reason:** The card still left unused bottom whitespace after the action buttons, making the right-side action feel underfilled.
**Updated Done criteria:** The latest-review card should fill the right column height with the editor using available vertical space and the action buttons anchored at the bottom.

### Rev 27 — May 28, 2026
**Change:** Add a reply-queue counter above the latest-review header, optimistically decrement it after successful deploys until the queue reaches zero, and shrink the metric headings with per-metric info tooltips.
**Reason:** Owners need to understand there is a queue, see progress as replies are published, and get plain explanations for each compact Engage metric.
**Updated Done criteria:** The quick-action card shows remaining/total reply progress, advances after each successful deploy, renders a same-size caught-up state at zero, and the three Engage metric cards have smaller labels with info tooltips.

### Rev 28 — May 28, 2026
**Change:** Style the competitor table overflow scrollbar with the Alloro orange thumb and pale track.
**Reason:** The default gray browser scrollbar looked unfinished against the redesigned Local Search competitor table.
**Updated Done criteria:** The competitor table horizontal scrollbar uses the branded orange/pale track treatment in the app and docs replica.

### Rev 29 — May 28, 2026
**Change:** Source the reply queue from total replyable review counts instead of the loaded review list, align the three Engage metric cards to the bottom, and decrement the total reply card when quick replies deploy.
**Reason:** The visible quick queue showed 25 because it used loaded review rows, while the real owner-facing backlog was 248 from readiness counts. Metric cards should share the same optimistic progress state.
**Updated Done criteria:** The reply queue reads from total unanswered review count, the `Need replies total` card decrements after successful deploys, and the three Engage metric cards sit aligned at the bottom of the left column.

### Rev 30 — May 28, 2026
**Change:** Move the reply queue count out of its own top banner and into the latest-review header as a larger inline badge before the reviewer label/name.
**Reason:** The queue count should read as part of the latest-review action, not as a separate block above the review metadata.
**Updated Done criteria:** The latest-review quick action shows the queue count before `Latest review reply` and the reviewer name, with the badge tall enough to visually cover both lines.

### Rev 31 — May 28, 2026
**Change:** Simplify the latest-review queue badge to one dynamic remaining-total number and remove the badge background.
**Reason:** The `n/n` treatment and tinted background added unnecessary visual weight now that the number is embedded in the latest-review header.
**Updated Done criteria:** The latest-review quick action shows one orange remaining queue number before the reviewer label/name, without a surrounding tinted badge background.

### Rev 32 — May 28, 2026
**Change:** Add completion feedback after a successful quick reply deploy: success toast, card-deck exit/enter animation, and pulse animation on related reply-count numbers as they decrement.
**Reason:** Publishing a reply should visibly feel like completing one item and moving to the next review, not just silently changing the text.
**Updated Done criteria:** Deploy success shows a toast, swaps the quick-review card with a deck-style animation, and pulses the reply queue/summary metric numbers as the count ticks down.

### T1: Owner-Readable Overview Hierarchy
**Do:** Rework the `/rankings` overview first screen so `What this means` is the first prominent content block, the Maps position card is smaller and clearer, Practice Health moves to secondary details, and the old top-level snapshot card is removed or reduced to actions only. Use `searchCheckedAt` for Maps date copy and hide invalid/missing dates.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, new focused files under `frontend/src/components/dashboard/rankings/`
**Depends on:** none
**Verify:** `cd frontend && npm run build`; Manual: authenticated `/rankings` first viewport has one clear reading path.

### T2: Ranking Copy Cleanup
**Do:** Replace internal/product copy with owner-readable language:
- `Practice insight` -> `What this means`
- `Practice Health` -> secondary `Why you rank here` / `Score details`
- `EST IN TOP 10` -> actual `#X on Maps` when available
- `Selected competitors in Google Maps` -> `Your competitors on Google Maps`
- `Top moves to climb` -> `Best next actions`
- `Opportunities` -> `Gaps to fix`
- client-facing `GBP` -> `Google profile` / `Google posts` / `Google reviews`
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, `frontend/src/components/dashboard/rankings/RankingsDashboardViewTabs.tsx`, selected files under `frontend/src/components/dashboard/gbp-automation/`
**Depends on:** T1
**Verify:** `rg -n "Practice insight|EST IN TOP 10|Market Intelligence|weighted score|Alloro Engage™|GBP Posts|Deploy to GBP" frontend/src/components/dashboard`.

### T3: Google Maps Trust Tooltip And Competitor Rows
**Do:** Preserve the headline Maps number while making uncertainty contextual, not scary. The tooltip should say the ranking is sampled from Google Maps through SerpAPI and may differ by device, prior searches, and searcher location. Competitor rows should show actual measured positions where available and keep selected competitors even when outside the top 10.
**Files:** `frontend/src/components/dashboard/RankingsDashboard.tsx`, `frontend/src/components/dashboard/rankings/competitorComparison.ts` if label helpers need to move
**Depends on:** T1
**Verify:** Manual: selected competitor rows show positions/fallbacks without `estimated` badge language.

### T4: Reviews And Google Posts Overview Card
**Do:** Evolve `GbpEngagementSummaryCard` into a clearer “Reviews & Google posts” action summary. Show one highlighted action row with review reply backlog, total unanswered reviews, latest Google post freshness, and a CTA that opens the existing action panel. Use the existing published-posts query with `limit: 1` for the 15-day post freshness check; do not add backend fields or new endpoints.
**Files:** `frontend/src/components/dashboard/gbp-automation/GbpEngagementSummaryCard.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpClientAutomationHeader.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpPostsManagerHeader.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpReviewReplySlot.tsx`, `frontend/src/components/dashboard/gbp-automation/GbpLocalPostWorkItemCard.tsx`
**Depends on:** T1
**Verify:** Manual: overview card answers “what needs my attention?” and sends the user to reviews/posts without showing six raw metric tiles.

### T5: Docs Parity
**Do:** Update the Local Rankings docs replica and page copy so the docs show the new first-screen story, renamed labels, Maps tooltip framing, selected competitor table copy, and Reviews & Google posts overview.
**Files:** `/Users/rustinedave/Desktop/alloro-docs/src/components/replicas/LocalRankingsReplica.tsx`, `/Users/rustinedave/Desktop/alloro-docs/src/data/pages/local-rankings.ts`
**Depends on:** T1, T2, T3, T4
**Verify:** `cd /Users/rustinedave/Desktop/alloro-docs && npm run build`.

### T6: Verification And Authenticated Smoke
**Do:** Run build/type checks and do an authenticated local visual smoke of `/rankings` if a browser session is available. Confirm no new broken imports, no dead new exports, no UI overlap at desktop/mobile widths, and docs build passes.
**Files:** no planned code changes
**Depends on:** T1, T2, T3, T4, T5
**Verify:** `npx tsc --noEmit`; `npm run build`; `cd frontend && npm run build`; docs build; manual `/rankings` at desktop and mobile widths.

## Done
- [ ] `npx tsc --noEmit` passes or only unrelated pre-existing errors remain.
- [ ] `npm run build` passes.
- [ ] `cd frontend && npm run build` passes.
- [ ] `/Users/rustinedave/Desktop/alloro-docs` build passes.
- [ ] Static copy audit finds no remaining client-facing `Practice insight`, `EST IN TOP 10`, or `Market Intelligence` labels on `/rankings`.
- [ ] Manual: authenticated `/rankings` first viewport shows `What this means` before detailed scoring.
- [ ] Manual: Local Search Estimate remains the headline metric with a trust tooltip, but no hard “estimated #X in top 10” badge language.
- [ ] Manual: Practice Health/factor scoring is secondary and available through details/comparison, not the first thing competing for attention.
- [ ] Manual: selected competitors on Local Search still render inline and default to the Local Search sort.
- [ ] Manual: Reviews & Google posts overview card renders one action row, flags unanswered reviews and stale/missing Google posts, and uses the requested CTA copy for good/bad states.
