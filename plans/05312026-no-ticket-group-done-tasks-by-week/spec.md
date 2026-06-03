# Group Done Tasks By Week

## Why
The PM tool's Done lanes get noisy as completed work accumulates. Grouping completed tasks by completion week keeps `/admin/pm` lean while preserving access to historical work.

## What
Show Done tasks in collapsible weekly groups across the individual project board and assignee views. The current week is open by default; older weeks are collapsed. Tasks moved into Done automatically appear in the current week because grouping is based on `completed_at`.

## Context

**Relevant files:**
- `frontend/src/pages/admin/ProjectsDashboard.tsx` - owns `/admin/pm` tabs: Overview, Backlog, Me, People.
- `frontend/src/pages/admin/ProjectBoard.tsx` - owns `/admin/pm/:projectId` and passes project columns into the board.
- `frontend/src/components/pm/KanbanBoard.tsx` - project board drag/drop orchestration.
- `frontend/src/components/pm/KanbanColumn.tsx` - renders individual project columns and task cards.
- `frontend/src/components/pm/MeKanbanBoard.tsx` - renders Me and People cross-project task columns.
- `frontend/src/types/pm.ts` - task types include `completed_at`.
- `src/controllers/pm/PmTasksController.ts` - sets `completed_at` when a task moves into Done and clears it when moved out.

**Patterns to follow:**
- Keep API calls out of components; this task should not need new API calls.
- Keep task status behavior server-owned. Frontend grouping should not create new status semantics.
- Use the existing PM dark visual system and compact card density.
- Use `date-fns` conventions already present in `frontend/src/utils/pmDateFormat.ts` for week calculations.

**Reference file:** `frontend/src/components/pm/BacklogProjectGroup.tsx` - closest existing collapsible grouping pattern in the PM tool.

**Docs parity:**
- Checked `/Users/rustinedave/Desktop/alloro-docs`; no direct `/admin/pm` or PM tool documentation surface was found.
- `TodoListReplica.tsx` exists but appears to document the client task list, not the admin PM board. During execution/finalization, re-check before deciding no docs update is needed.

## Constraints

**Must:**
- Group only Done tasks.
- Use `completed_at` as the grouping source of truth.
- Default the current week group open.
- Default older week groups collapsed.
- Keep the Done column/card drop target usable when groups are collapsed.
- Keep task click, selection, context menu, delete, and drag/drop behavior intact.
- Use a shared helper/component so project Done and Me/People Done do not diverge.
- Label groups as `Week N, Month` with the date range in smaller supporting text.
- Use Monday-start weeks to match existing PM date behavior.

**Must not:**
- Add a database migration.
- Add new workflow columns or persist week group state server-side.
- Change how non-Done columns render.
- Change completion semantics in `PmTasksController`.
- Refactor unrelated PM surfaces.

**Out of scope:**
- Pagination or virtualization for large Done histories.
- User preference persistence for expanded/collapsed historical weeks.
- Editing historical `completed_at` dates.
- Changing velocity/stat calculations.
- Alloro Docs content creation unless a matching PM docs surface is found during the docs parity check.

## Risk

**Level:** 2

**Risks identified:**
- Drag/drop can regress if a collapsed Done lane no longer exposes a stable droppable area -> **Mitigation:** Keep the existing Done column droppable container mounted and collapse only the task list inside weekly groups.
- `completed_at` timestamps are UTC while PM UX usually thinks in Pacific time -> **Mitigation:** compute week buckets using the same Monday-start display convention used by PM date utilities; avoid backend changes unless testing exposes a real timezone mismatch.
- Legacy Done tasks may have missing `completed_at` -> **Mitigation:** put them in a small fallback group such as `No completion date` rather than inventing dates.
- Duplicate grouping logic could drift between project board and Me/People views -> **Mitigation:** extract shared grouping utilities and one reusable weekly Done renderer.

**Blast radius:**
- `/admin/pm/:projectId` Done column.
- `/admin/pm?view=me` Done column.
- `/admin/pm?view=assignee` Done column.
- Focus Mode inherits the project board renderer.
- Existing PM task drag/drop and context menus.

**Pushback:**
- This should not become real weekly workflow columns. Weeks are an archive/display concern. Persisting them as board state would create parallel status systems: column membership and completion-week membership.

## Tasks

### T1: Weekly grouping utilities
**Do:** Add shared PM utilities for grouping Done tasks by Monday-start completion week, current-week detection, label formatting, descending week order, and missing-date fallback handling.
**Files:** `frontend/src/utils/pmDoneWeekGroups.ts`
**Depends on:** none
**Verify:** `cd frontend && npm run build`

### T2: Shared Done week component
**Do:** Add a compact collapsible weekly Done renderer that can render either `TaskCard` or `MeTaskCard` rows through a render prop. Current week opens by default; older groups start collapsed.
**Files:** `frontend/src/components/pm/DoneWeekGroups.tsx`
**Depends on:** T1
**Verify:** Manual: inspect collapsed/open states and keyboard/click behavior.

### T3: Project board Done grouping
**Do:** Use the weekly Done renderer inside `KanbanColumn` only when the column is `Done`. Preserve the existing droppable container, task card behavior, selection, context actions, and quick add behavior.
**Files:** `frontend/src/components/pm/KanbanColumn.tsx`
**Depends on:** T2
**Verify:** Manual: `/admin/pm/:projectId`; move a task into Done and confirm it appears in the current week group.

### T4: Me and People Done grouping
**Do:** Use the same weekly Done renderer in `MeKanbanBoard` only for the `done` column. Preserve cross-project task cards, selection, context actions, drag/drop, and refresh behavior.
**Files:** `frontend/src/components/pm/MeKanbanBoard.tsx`
**Depends on:** T2
**Verify:** Manual: `/admin/pm?view=me` and `/admin/pm?view=assignee`.

### T5: Verification and docs parity check
**Do:** Run type/build verification, check for matching Alloro Docs PM surface, and record whether docs changed or why they did not.
**Files:** `/Users/rustinedave/Desktop/alloro-docs` only if a matching PM docs surface is found.
**Depends on:** T3, T4
**Verify:** `npx tsc --noEmit`; `cd frontend && npm run build`; Manual: project board, Me, People, Focus Mode.

## Done
- [ ] `npx tsc --noEmit` passes or only unrelated pre-existing errors are documented.
- [ ] `cd frontend && npm run build` passes or only unrelated pre-existing warnings are documented.
- [ ] Manual: `/admin/pm/:projectId` Done tasks are grouped by week, current week open, older weeks collapsed.
- [ ] Manual: moving a task into Done puts it in the current week group.
- [ ] Manual: moving a Done task back out clears it from Done after refresh/optimistic update.
- [ ] Manual: `/admin/pm?view=me` and `/admin/pm?view=assignee` Done columns use the same grouping.
- [ ] Manual: Focus Mode still renders the grouped Done column without breaking task open behavior.
- [ ] Docs parity checked in `/Users/rustinedave/Desktop/alloro-docs`; docs updated if a matching PM docs surface exists, otherwise documented as not applicable.
- [ ] No DB migration or backend completion semantics change.
