# Organization Detail Shared Submenus

## Why
Organization detail now has multiple sections with their own nested navigation. Keeping Website and GBP Automation tabs inside their content panels makes the page feel inconsistent next to Agent Results.

## What
Use the same second-row submenu UI in the organization top navigation for Agent Results, Website, and GBP Automation. Keep underlying content behavior intact while hiding duplicate embedded tab bars.

## Context

**Relevant files:**
- `frontend/src/components/Admin/OrganizationDetailNavigation.tsx` - top navigation and current Agent Results submenu.
- `frontend/src/components/Admin/organizationDetailNavigationConfig.ts` - section/tab key guards.
- `frontend/src/pages/admin/OrganizationDetail.tsx` - URL state and section rendering.
- `frontend/src/pages/admin/WebsiteDetail.tsx` - embedded website tab content.
- `frontend/src/components/Admin/OrgGbpAutomationTab.tsx` - admin GBP automation view state.

**Patterns to follow:**
- Keep org detail navigation URL-driven.
- Keep standalone Website and GBP Automation surfaces unchanged.
- Avoid changing backend data or adding dependencies.

## Constraints

**Must:**
- Use one consistent second-row submenu treatment.
- Keep Website and GBP tabs deep-linkable through `tab`.
- Hide duplicate tab bars when Website/GBP are embedded inside organization detail.

**Must not:**
- Remove existing Website or GBP standalone behavior.
- Touch unrelated GBP automation work in the dirty tree.
- Add dependencies.

**Out of scope:**
- Redesigning WebsiteDetail internals.
- Reworking GBP automation data fetching or actions.

## Risk

**Level:** 2

**Risks identified:**
- `tab` is shared by Agent, Website, and GBP views. -> **Mitigation:** interpret `tab` only in the currently active `section` and default safely per section.
- GBP Automation currently owns its own local active view. -> **Mitigation:** add optional controlled props while preserving local state fallback.

**Blast radius:** Admin organization detail nav, embedded Website detail, embedded GBP automation.

## Tasks

### T1: Shared submenu config
**Do:** Add typed submenu keys and guards for Website and GBP Automation alongside Agent Results.
**Files:** `frontend/src/components/Admin/organizationDetailNavigationConfig.ts`
**Depends on:** none
**Verify:** `cd frontend && npx tsc --noEmit`

### T2: Org nav shared submenu UI
**Do:** Render the same second-row submenu for Agent Results, Website, and GBP Automation.
**Files:** `frontend/src/components/Admin/OrganizationDetailNavigation.tsx`
**Depends on:** T1
**Verify:** `cd frontend && npx eslint src/components/Admin/OrganizationDetailNavigation.tsx`

### T3: Controlled embedded content
**Do:** Drive Website and GBP embedded tabs from organization URL state and hide duplicate internal tab bars.
**Files:** `frontend/src/pages/admin/OrganizationDetail.tsx`, `frontend/src/pages/admin/WebsiteDetail.tsx`, `frontend/src/components/Admin/OrgGbpAutomationTab.tsx`
**Depends on:** T1, T2
**Verify:** `cd frontend && npm run build`

## Done
- [x] `cd frontend && npx tsc --noEmit`
- [x] `cd frontend && npm run build`
- [x] Website uses the org-level submenu when embedded
- [x] GBP Automation uses the org-level submenu when embedded
- [x] Standalone Website and GBP behavior is preserved
