# Pilot Mode Pill Indicator

## Why
The current pilot-mode banner consumes a full bottom bar, competes with the page UI, and includes an End Session action that is too destructive for a passive mode indicator.

## What
Replace the full-width pilot banner with a small top-left overlay pill that says "PILOT MODE", uses the same amber background, and can be dismissed without ending the pilot session.

## Context

**Relevant files:**
- `frontend/src/components/Admin/PilotBanner.tsx` - owns the pilot-mode indicator and current End Session action.
- `frontend/src/App.tsx` - mounts `PilotBanner` globally.

**Patterns to follow:**
- Keep pilot-session token behavior in existing auth/session utilities.
- Use component-local UI state for dismissing the indicator.
- Use an accessible icon button for the dismiss affordance.

**Reference file:** `frontend/src/components/Admin/PilotBanner.tsx` - existing pilot indicator surface.

## Constraints

**Must:**
- Render a compact fixed overlay in the top-left corner.
- Keep the amber pilot background.
- Display only "PILOT MODE" as the visible label.
- Include a dismiss control that hides the indicator only.
- Remove the End Session button and session-clearing behavior from this component.

**Must not:**
- Clear `sessionStorage`, redirect, close the window, or end the pilot session.
- Change pilot-token creation, API auth behavior, or admin pilot launch flows.
- Touch unrelated dashboard/rankings/support files.

**Out of scope:**
- New admin controls for ending pilot sessions.
- Persistence of dismissal across reloads.
- Docs replica updates; pilot mode is an internal/admin overlay, not normal client documentation content.

## Risk

**Level:** 2

**Risks identified:**
- A dismiss button could accidentally keep using the old End Session behavior. -> **Mitigation:** remove `handleEndSession` entirely and use local dismissed state only.
- A top-left overlay could block sidebar controls. -> **Mitigation:** keep the pill small, offset from the viewport edge, and avoid full-width layout.

**Blast radius:**
- Pilot-mode sessions across all client routes where `PilotBanner` is mounted.

**Pushback:**
- Do not hide this behind the old session-ending semantics. The pill is an indicator, not a control plane.

## Tasks

### T1: Compact dismissable pilot pill
**Do:** Replace the bottom banner with a top-left amber pill labeled "PILOT MODE", add a small dismiss button, and remove all End Session/session-clearing logic.
**Files:** `frontend/src/components/Admin/PilotBanner.tsx`
**Depends on:** none
**Verify:** `npx eslint src/components/Admin/PilotBanner.tsx`

## Done
- [ ] `cd frontend && npx eslint src/components/Admin/PilotBanner.tsx`
- [ ] `cd frontend && npm run build`
- [ ] Manual: pilot mode shows a small top-left amber `PILOT MODE` pill.
- [ ] Manual: dismiss hides the pill without clearing pilot session storage.
- [ ] Manual: no End Session button appears in the pilot indicator.
