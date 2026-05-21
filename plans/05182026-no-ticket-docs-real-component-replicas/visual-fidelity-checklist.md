# Visual Fidelity Checklist — Docs Replicas vs Real App

Compiled by auditing every replica file against its real frontend component.
Organized by impact tier. Excludes expected omissions (hooks, API calls, loading/error states, modals).

---

## HIGH IMPACT — Visually noticeable on first look

### Cross-cutting

- [ ] **`glass-header` missing everywhere** — Referrals Hub, Todo List, Notifications all use a frosted-glass sticky header (`backdrop-filter blur + sticky + z-index`) in the real app. All replicas use plain static headers.
- [ ] **`shadow-premium` inconsistent** — Some replicas substitute `shadow-sm` or `shadow-lg` where the real app uses the custom `shadow-premium` class. Audit each and match.
- [ ] **`rounded-[2rem]` vs `rounded-3xl`** — Several replicas use `rounded-3xl` (1.5rem) where the real app uses `rounded-[2rem]`. Difference is subtle but visible on large cards (Todo cards, Billing card).
- [ ] **Framer Motion entrance animations** — All real components use `motion.div` fade-in/slide-up entry animations. Replicas are static. Consider adding simple CSS entrance animations as an approximation, or accept as intentional omission.

### Auth Pages

- [ ] **AuthLayout uses `min-h-full` instead of `min-h-screen`** — Real pages use `min-h-screen` for guaranteed vertical centering. Replica may not center in all DesktopViewport sizes. Fix: change to `min-h-screen`.
- [ ] **ForgotPassword Step 2 entirely missing** — Real has a two-step flow: email entry, then reset code + new password. Replica only shows Step 1. Missing: 6-digit code input (`font-mono text-2xl tracking-[0.5em]`), new password fields, reset button. This is a large visual omission.

### Practice Hub

- [ ] **HighlightedText not rendered** — Real Hero card uses `parseHighlightTags` to render `<highlight>` text with orange underline. Replica renders plain text — the hero action text looks flat.
- [ ] **Hero card uses custom `focus-card-dark` class** — Replica uses `bg-[#0a1628]` which is close but may miss gradient overlays or other properties defined in the real CSS class.
- [ ] **DomainStrips not interactive** — Real uses accordion expand/collapse. Replica renders all strips statically. Visual difference if real default state is collapsed.

### Referrals Hub

- [ ] **Bar chart visual fidelity** — User specifically flagged bars/graphs not matching. The horizontal bar chart implementation needs comparison against the real component's exact bar widths, colors, label positioning, and spacing.
- [ ] **`glass-header` sticky header missing** — Real uses frosted glass sticky header. Replica has a plain static header.

### Local Rankings

- [ ] **HealthGauge is static** — Real uses framer-motion `pathLength` animation for smooth arc drawing. Replica uses static SVG `strokeDasharray/strokeDashoffset`. No animation on load.
- [ ] **Cohort delta sub-lines missing** — Real shows "+X.XX vs cohort avg" comparison text below each factor bar in FactorBreakdown. Replica omits these entirely.
- [ ] **CSS custom properties vs inline style object** — Replica uses an inline `S = { borderSoft, textSoft }` constants object instead of CSS variables or Tailwind tokens. Should use the same border/text classes as the real component.
- [ ] **`font-mono-display` vs `font-mono`** — Real uses a custom `font-mono-display` class. Replica uses standard `font-mono`.
- [ ] **Accordion sections in DriversPanel** — Real uses `<details>`/`<summary>` for expandable factor groups. Replica renders all content flat. Visual difference if real default state has sections collapsed.

### Todo List

- [ ] **Card hover effect missing** — Real uses `shadow-premium hover:shadow-2xl hover:-translate-y-1` (lift on hover). Replica uses `shadow-sm hover:shadow-lg` with no translate.
- [ ] **`glass-header` sticky header missing** — Same as other dashboard pages.

### Website Editor

- [ ] **Sidebar width wrong** — Real EditorSidebar is `w-[380px]`. Replica is `w-[340px]`. 40px visual discrepancy.
- [ ] **Sidebar tab layout wrong** — Real uses left-aligned tabs with `gap-4`. Replica uses equal-width centered tabs (`flex-1`). Different visual alignment.
- [ ] **Undo/Redo buttons missing** — Real toolbar shows Undo2/Redo2 buttons. Replica omits them entirely.
- [ ] **Save & Publish button missing** — Real shows animated Save button in toolbar. Replica omits it.

---

## MEDIUM IMPACT — Noticeable on close inspection

### Sidebar

- [ ] **Location card styling differs** — Real uses `MapPin` icon in a different container style. Replica uses `Globe` in `w-8 h-8 rounded-xl bg-alloro-orange/20`. Real uses `px-8 mb-1` wrapper; replica uses `px-6 py-3`. Font size differs: replica `text-[12px] font-bold` vs real `text-[13px] font-semibold`.
- [ ] **Footer avatar initials** — Real derives from `practiceName.substring(0, 2)`. Replica shows "SC" which doesn't match "Dr. Alex Smith" or any practice name pattern. Should show practice name initials (e.g., "SM" for "Smile Clinic").
- [ ] **Role text** — Real shows "Administrator"/"Manager"/"Viewer". Replica shows "Owner" which isn't a real role string.

### Auth Pages (all three)

- [ ] **Eye toggle is `<div>` not `<button>`** — Loses pointer cursor on hover. Minor but detectable.
- [ ] **Terms links use `<span>` not `<a>`** — Missing `hover:underline` effect on Sign In and Sign Up.
- [ ] **`readOnly` vs `disabled` on inputs** — Some browsers render these differently (disabled adds opacity).

### Settings Tabs

- [ ] **Missing footer** — Real Settings page has a footer with logo image and version text. Replica omits it.
- [ ] **SettingsTabs centering** — Team Members replica wraps tabs in `flex justify-center`. Real Settings page left-aligns them.

### Integrations

- [ ] **Encryption card spacing** — Real uses `space-y-6` between practice card and encryption card. Replica nests both in same HotspotZone with `mt-4`, creating tighter spacing.
- [ ] **GSC row missing hover effect** — Real has `hover:bg-slate-50/50`. Replica has no hover.
- [ ] **Missing `Restart Product Tour` button** — Dashed-border button in left column, absent from replica.

### Team Members

- [ ] **Action elements are `<span>` not `<button>`** — "Change Role" and "Remove" lose pointer cursor.
- [ ] **Spacing** — `space-y-8` in real vs `mb-6` in replica between header and table.

### Account

- [ ] **Missing input focus rings** — Real has `focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange/30`. Replica has only `focus:outline-none`.
- [ ] **Outer wrapper width** — Replica uses `max-w-[900px]` outer + `max-w-xl` card. Real uses just `max-w-xl`. Slightly different page-level width.

### Notifications

- [ ] **Timestamp format** — Real uses `date-fns formatDistanceToNow` for dynamic relative times. Replica hardcodes static strings. Visually fine but not semantically dynamic.

### Support

- [ ] **Missing attachments section** — Real SupportTicketDetail renders `<SupportTicketAttachments>` between header and messages. Replica omits it.
- [ ] **Only 3 of 7 status badges defined** — Missing: triaged, waiting_on_client, wont_fix, archived variants.

---

## LOW IMPACT — Acceptable for docs replicas

- [ ] All `<button>` elements replaced with `<div>` or `<span>` (loses implicit cursor-pointer)
- [ ] Framer Motion `motion.div` entrance animations stripped (expected)
- [ ] Loading/skeleton states not implemented (expected — show happy path only)
- [ ] Error/empty states not implemented (expected)
- [ ] Modal/overlay components not implemented (expected — show default state)
- [ ] `<form>` elements replaced with `<div>` (no visual difference)
- [ ] Collapsed sidebar state not implemented (replica always shows expanded)
- [ ] Mobile responsive layouts not implemented (replica renders at 1440px only)
- [ ] `transition-colors` omitted from some hover elements
- [ ] Interactive accordion sections rendered statically

---

## Recommended Fix Priority

**Wave 1 — Quick wins (< 1 hour):**
1. AuthLayout `min-h-full` -> `min-h-screen`
2. Sidebar: fix location card icon (Globe -> MapPin), initials ("SC" -> "SM"), role ("Owner" -> "Administrator")
3. `rounded-3xl` -> `rounded-[2rem]` where applicable
4. Website sidebar `w-[340px]` -> `w-[380px]`
5. Account input focus rings
6. SettingsTabs left-align (remove `flex justify-center`)

**Wave 2 — Medium effort (2-4 hours):**
7. Add `glass-header` class to docs CSS and apply to Referrals, Todo, Notifications headers
8. Standardize `shadow-premium` usage across all replicas
9. Fix card hover effects (`hover:shadow-2xl hover:-translate-y-1`)
10. Website sidebar tab layout (left-aligned with gap-4)
11. Website toolbar: add Undo/Redo/Save button placeholders
12. Local Rankings: replace inline style object with Tailwind classes
13. Practice Hub: implement HighlightedText rendering
14. Referrals Hub: audit bar chart styling against real component

**Wave 3 — Larger scope (4+ hours):**
15. ForgotPassword Step 2 (reset code + new password form)
16. Local Rankings cohort delta sub-lines
17. Integrations: add Restart Product Tour button, fix spacing
18. Support: add attachments section placeholder, define remaining status badges
