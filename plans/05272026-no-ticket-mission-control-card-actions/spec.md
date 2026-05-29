# Mission Control Card Actions

## Why
Mission Control cards are getting visually dense. The pilot action should sit with the organization identity, website access should be one click away, and low-priority operational details should not occupy the main card surface by default.

## What
Update each Mission Control organization card so Pilot and Website actions sit below the title block, and move user/location/unread/PMS/rank/payment-method signals into a collapsible Quick details section.

## Context

**Relevant files:**
- `frontend/src/components/Admin/mission-control/OrganizationMissionCard.tsx` - organization card layout and signal chips.
- `frontend/src/components/Admin/mission-control/MissionControlPilotMenu.tsx` - existing pilot menu action.

**Patterns to follow:**
- Keep card click behavior opening the organization detail.
- Stop event propagation for inline card actions.
- Use existing lucide icons and Tailwind styling.

## Constraints

**Must:**
- Keep Pilot using the existing pilot menu.
- Open Website via the organization's Website section.
- Keep operational signals available under Quick details.

**Must not:**
- Change backend data shape for this UI-only tweak.
- Touch unrelated GBP automation work in the dirty tree.
- Add dependencies.

**Out of scope:**
- Adding live website/public-domain launch behavior.
- Reworking Mission Control filters or payment watch.

## Risk

**Level:** 1

**Risks identified:**
- Nested actions inside a clickable card can accidentally trigger card navigation. -> **Mitigation:** stop propagation on action wrappers/buttons.

**Blast radius:** Mission Control organization cards only.

## Tasks

### T1: Reposition Card Actions
**Do:** Move Pilot below the title and add a Website pill beside it.
**Files:** `frontend/src/components/Admin/mission-control/OrganizationMissionCard.tsx`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit`

### T2: Collapse Quick Signals
**Do:** Move user/location/unread/PMS/rank/payment method signals behind a Quick details dropdown.
**Files:** `frontend/src/components/Admin/mission-control/OrganizationMissionCard.tsx`
**Depends on:** T1
**Verify:** `cd frontend && npm run build`

## Done
- [x] `cd frontend && npx tsc --noEmit`
- [x] `cd frontend && npm run build`
- [x] Pilot and Website actions render below the title block
- [x] Quick details dropdown contains the six operational signals
