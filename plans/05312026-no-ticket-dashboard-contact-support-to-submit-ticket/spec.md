# Dashboard Getting-Started: Contact Support → Submit a ticket

## Why
The dashboard getting-started empty-state's help link opens a `mailto:` to `support@alloro.io`. Support is now handled by the in-app ticket system at `/help`, so the email is a dead end that doesn't reach our Bug/Issue queue.

## What
Replace the help line in the dashboard getting-started view so it reads **"Having trouble? Submit a ticket"**, where **Submit a ticket** navigates (SPA, no reload) to the bug-report composer at `/help?newTicket=bug_report` instead of opening an email client.

Done when: the getting-started screen shows "Having trouble? Submit a ticket", clicking it stays in-app and opens the support page with the bug-report composer pre-opened — no `mailto:` anywhere on this line.

## Context

**Relevant files:**
- `frontend/src/pages/Dashboard.tsx:296-298` — the only file to change. The help text lives in the "Let's Set Up Your Dashboard" getting-started branch (the empty-state, shown pre-onboarding). Currently: `Need help? <a href="mailto:support@alloro.io" ...>Contact Support</a>`.
- `frontend/src/pages/Help.tsx:74-90` — the `/help` route. Its effect reads `searchParams.get("newTicket")`; when it parses to a valid `SupportTicketType` it opens the composer for that type even with no router state/draft. So `/help?newTicket=bug_report` opens an empty bug-report composer. No screenshot/console-log attachment is needed for this entry point.
- `frontend/src/App.tsx:207` — confirms `/help` is the support page route (`<Route path="/help" element={<Help />} />`).

**Patterns to follow:**
- In-file SPA navigation via the existing `navigate` from `react-router-dom` (`useNavigate`, declared at `Dashboard.tsx:51`). The getting-started view already uses this for its primary CTA — see Reference file.

**Reference file:** `frontend/src/pages/Dashboard.tsx:237` — `onClick={() => navigate("/settings/integrations")}`. Match this: an `onClick` that calls `navigate(...)`, not an `<a href>` (avoids a full page reload) and not a new `Link` import (the file uses `navigate`, not `Link`).

## Constraints

**Must:**
- Keep the change to the single help-text element at `Dashboard.tsx:296-298`.
- Use the in-scope `navigate()` to go to `/help?newTicket=bug_report` (SPA navigation).
- Preserve the existing visual styling of the link portion (`text-alloro-orange font-semibold hover:underline`) and the surrounding `<p className="text-center text-sm text-slate-400 mt-8">`.
- Exact copy: lead text `Having trouble? `, clickable text `Submit a ticket`.

**Must not:**
- No `mailto:` link.
- No new dependencies; no new import (reuse the existing `navigate`).
- Do not touch the other "Need help?" / "Contact Support" strings elsewhere (`PMSVisualPillars.tsx`, `PMSUploadWizardModal.tsx`, `OnboardingContainer.tsx`, `wizardConfig.ts`) — out of scope, no drive-by edits.
- Do not replicate the `GlobalSupportAction` screenshot/console-log capture flow — this is a plain link, not the FAB.

**Out of scope:**
- The floating support FAB (`GlobalSupportAction`) and its capture behavior.
- Any change to the `/help` page, ticket API, or composer.
- The mobile bottom nav / sidebar "Support" item (already correctly point to `/help`).

## Risk

**Level:** 1 (Suggestion / trivial)

**Risks identified:**
- Element semantics: a navigation rendered as a `<button>` vs anchor. → **Mitigation:** the action both routes and opens a composer (an in-app action), and the file's established pattern is `onClick` + `navigate`. Render the clickable text as a `<button type="button">` styled with the existing link classes (add `inline` display if needed so it sits inline in the `<p>`). Acceptable and consistent with `Dashboard.tsx:237`.

**Blast radius:** None beyond `Dashboard.tsx`. The string/link is local to the getting-started empty-state JSX; no exports change, no other consumer.

**Pushback (if any):** None. Low-risk copy + link swap that removes a dead `mailto:` and routes into the real ticket queue.

## Tasks

### T1: Swap the help link to in-app ticket navigation
**Do:** In `frontend/src/pages/Dashboard.tsx` (the help-text `<p>` at lines 296-298), replace `Need help? <a href="mailto:support@alloro.io" className="text-alloro-orange font-semibold hover:underline">Contact Support</a>` with `Having trouble? ` followed by a `<button type="button" onClick={() => navigate("/help?newTicket=bug_report")} className="text-alloro-orange font-semibold hover:underline">Submit a ticket</button>`. Keep the wrapping `<p>` and its classes unchanged.
**Files:** `frontend/src/pages/Dashboard.tsx`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit` (zero new errors). Manual: load the dashboard getting-started empty-state → confirm it reads "Having trouble? Submit a ticket"; click → URL becomes `/help?newTicket=bug_report` (no full reload) and the bug-report composer is open.

## Done
- [ ] `cd frontend && npx tsc --noEmit` — zero errors introduced by this change
- [ ] Getting-started screen shows "Having trouble? Submit a ticket" (no "Contact Support", no "Need help?")
- [ ] No `mailto:` remains on that line; click navigates in-app to `/help?newTicket=bug_report` with the bug composer open
- [ ] No regressions: the other "Need help?"/"Contact Support" usages elsewhere are untouched
