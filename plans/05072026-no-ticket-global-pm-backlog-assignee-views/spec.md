# Global PM Backlog And Assignee Views

## Why
The PM overview shows global backlog pressure but gives no way to inspect or triage those tasks without opening each project. The current `Me` view also only answers "what is assigned to me," while admins need the same workload view for Dave or any other assignee.

## What
Add PM admin views for:
- A global backlog view showing all incomplete Backlog-column tasks across active projects, grouped by project, with controls to assign and move each task into that task's real project columns.
- A generic assignee workload view with a user picker, preserving the current `Me` behavior as the default shortcut while allowing any PM user.

Done means `/admin/pm?view=backlog` opens from the Backlog tile, `/admin/pm?view=assignee&userId={id}` shows that user's `To Do`, `In Progress`, and `Done` tasks, and both views support project, priority, overdue, and unassigned filtering where applicable.

## Context

**Relevant files:**
- `frontend/src/pages/admin/ProjectsDashboard.tsx` - owns `/admin/pm` tabs and currently only supports `overview` and `me`.
- `frontend/src/components/pm/StatsRow.tsx` - renders the non-clickable Backlog metric tile.
- `frontend/src/components/pm/MeTabView.tsx` - closest frontend analog for cross-project assigned workload.
- `frontend/src/components/pm/MeKanbanBoard.tsx` - existing cross-project task board grouped by `To Do`, `In Progress`, `Done`.
- `frontend/src/components/pm/TaskDetailPanel.tsx` - existing assignment, priority, deadline, attachment, and comment panel.
- `frontend/src/api/pm.ts` - typed PM API client functions.
- `frontend/src/types/pm.ts` - PM response types.
- `src/controllers/pm/PmController.ts` - existing `/api/pm/users` source for assignee picker options.
- `src/routes/pm/tasks.ts` - thin task routes mounted under `/api/pm`.
- `src/routes/pm/myTasks.ts` - current `/api/pm/tasks/mine` route.
- `src/routes/pm/stats.ts` - current PM stats/velocity routes.
- `src/controllers/pm/PmMyTasksController.ts` - closest backend analog for cross-project assigned tasks.
- `src/controllers/pm/PmTasksController.ts` - existing task move, assign, bulk delete, and bulk move behavior.
- `src/controllers/pm/PmStatsController.ts` - current global and "me" PM stats logic.
- `src/models/PmTaskModel.ts`, `src/models/PmColumnModel.ts`, `src/models/PmProjectModel.ts` - model home for PM database reads.

**Patterns to follow:**
- Existing PM API envelope consumed by `frontend/src/api/pm.ts` via `unwrapPmEnvelope`.
- Existing route auth pattern: `authenticateToken` + `superAdminMiddleware`.
- Existing task movement contract: `PUT /api/pm/tasks/:id/move` with a real `column_id` and `position`.
- Existing assignment contract: `PUT /api/pm/tasks/:id/assign`.
- Existing PM UI theme via `var(--color-pm-*)` and component-local PM files.

**Reference file:** `frontend/src/components/pm/MeTabView.tsx` - closest view-level analog for assigned workload, stats, velocity, task detail, and selection behavior.

**Reference file:** `src/controllers/pm/PmMyTasksController.ts` - closest backend response shape for cross-project task grouping.

## Constraints

**Must:**
- Treat Backlog as `pm_columns.is_backlog = true`, not a column name string.
- Scope backlog to active projects and incomplete tasks only.
- Use each task's real project column IDs for moves. No fake shared global columns.
- Preserve `Me` as a shortcut/default view.
- Allow assignee views for any PM user returned by `/api/pm/users`.
- Show `To Do`, `In Progress`, and `Done` in assignee views, including completed/Done tasks.
- Keep moving Backlog tasks into non-Backlog columns behind the existing "assignee required" UX rule.
- Keep routes thin and put new aggregate DB reads behind model/service helpers rather than adding more large inline controller queries.

**Must not:**
- Add a database migration unless execution proves an index is required.
- Hardcode Dave or any person-specific email/name.
- Fetch every project board client-side to build global backlog.
- Refactor unrelated PM views or rewrite the existing project board.
- Change existing task movement, assignment, notification, comment, or attachment behavior except where needed to refresh the new views after an existing action.

**Out of scope:**
- Non-admin/client PM views.
- Bulk assign UX.
- Cross-project drag-and-drop between unrelated projects.
- New PM roles or authorization changes.
- Changelog or commit creation.

## Risk

**Level:** 2 - Concern

**Risks identified:**
- Fake cross-project kanban would violate the data model because PM columns are project-owned IDs. -> **Mitigation:** backlog triage uses grouped project sections and per-task moves into that task's actual project columns.
- Existing PM controllers already contain inline Knex queries, which conflicts with current backend conventions. Adding more there deepens architectural drift. -> **Mitigation:** add model/service helper functions for new aggregate reads and keep new controllers thin.
- Backlog/assignee aggregate queries can become N+1 if implemented by looping projects. -> **Mitigation:** use joined aggregate queries and hydrate project column maps in one pass.
- Done tasks may grow over time and make assignee payloads heavy. -> **Mitigation:** keep the v1 behavior aligned with the user's request, but structure filters so a future `showCompleted` or pagination addition is straightforward.
- Existing dirty worktree contains unrelated files. -> **Mitigation:** execution must ignore those files and only touch PM files plus this spec.

**Blast radius:**
- `/admin/pm` overview routing and tab behavior.
- Backlog metric tile click behavior.
- Existing `Me` view data loading if generalized.
- PM task assignment and move refresh paths in the new views.
- PM API client typing in `frontend/src/api/pm.ts` and `frontend/src/types/pm.ts`.
- Backend `/api/pm/tasks/*` and `/api/pm/stats/*` route namespace.

**Pushback:**
- Do not build a literal global board with one Backlog/To Do/In Progress/Done set. It sounds convenient, but it lies about the model and will cause bad moves. The better v1 is a global backlog triage surface grouped by project, with controls that move tasks through the real columns for each project.

## Tasks

### T1: Backend Task View Queries
**Do:** Add aggregate PM task view helpers for global backlog and assigned-user task groups. Include project metadata, assignee/creator names, column names, and per-project column IDs needed by the frontend to move tasks safely.
**Files:** `src/models/PmTaskModel.ts`, `src/models/PmColumnModel.ts`, `src/controllers/pm/PmTaskViewsController.ts`
**Depends on:** none
**Verify:** `npm run build`

### T2: Backend Routes And Stats
**Do:** Add thin routes for `GET /api/pm/tasks/backlog`, `GET /api/pm/tasks/assigned/:userId`, and generic assigned-user stats/velocity if the frontend needs parity with `MeTabView`. Preserve `/tasks/mine` by delegating to the same assigned-user helper using `req.user!.userId`.
**Files:** `src/routes/pm/tasks.ts`, `src/routes/pm/myTasks.ts`, `src/routes/pm/stats.ts`, `src/controllers/pm/PmStatsController.ts`
**Depends on:** T1
**Verify:** `npm run build`

### T3: Frontend API And Types
**Do:** Add typed PM API functions and response types for backlog groups, assigned-user task groups, and user-scoped stats/velocity. Keep existing `fetchMyTasks` behavior as a wrapper or compatibility path. Ensure `/api/pm/users` returns numeric IDs so the assignee picker and URL `userId` param share one type contract.
**Files:** `frontend/src/api/pm.ts`, `frontend/src/types/pm.ts`, `src/controllers/pm/PmController.ts`
**Depends on:** T2
**Verify:** `cd frontend && npm run build`

## Revision Log

### Rev 1 - May 8, 2026
**Change:** Included `src/controllers/pm/PmController.ts` in T3 to normalize PM user IDs to numbers.
**Reason:** Local API verification showed `/api/pm/users` returning string IDs, which would break strict `user.id === userId` matching after `userId` is parsed from the URL.
**Updated Done criteria:** Assignee picker must show PM users with numeric IDs and preserve selected-user labels/counts after URL parsing.

### T4: Backlog View
**Do:** Add `/admin/pm?view=backlog` rendering. Make the Backlog tile open this view. Render a left collapsible project-group list with backlog counts and a main triage surface. Each task should expose assignment and move-to-column controls for that task's project (`Backlog`, `To Do`, `In Progress`, `Done`) and refresh after changes.
**Files:** `frontend/src/pages/admin/ProjectsDashboard.tsx`, `frontend/src/components/pm/StatsRow.tsx`, `frontend/src/components/pm/BacklogTabView.tsx`, `frontend/src/components/pm/BacklogProjectGroup.tsx`
**Depends on:** T3
**Verify:** `cd frontend && npm run build`; Manual: click Backlog tile, inspect grouped backlog, assign a backlog task, move it to To Do/In Progress/Done, move it back to Backlog.

### T5: Generic Assignee View
**Do:** Generalize the current `Me` view into a reusable assigned-user view with a PM user picker. Keep `view=me` as the current user's shortcut, and support `view=assignee&userId={id}` for any PM user. Show `To Do`, `In Progress`, and `Done`, including completed tasks. Add filters for project, priority, overdue, and unassigned where they make sense.
**Files:** `frontend/src/pages/admin/ProjectsDashboard.tsx`, `frontend/src/components/pm/MeTabView.tsx`, `frontend/src/components/pm/AssigneeTabView.tsx`, `frontend/src/components/pm/MeKanbanBoard.tsx`
**Depends on:** T3
**Verify:** `cd frontend && npm run build`; Manual: switch from Me to another assignee, verify counts/tasks change, move a task between To Do/In Progress/Done.

## Done
- [x] `npm run build` passes for backend.
- [x] `cd frontend && npm run build` passes.
- [x] Manual: `/admin/pm` overview still renders existing project grid and stats.
- [x] Manual: Backlog tile opens `/admin/pm?view=backlog`.
- [x] Manual: Backlog view shows all incomplete Backlog tasks grouped by active project.
- [x] Manual: Backlog task assignment works and task can move to the real project `To Do`, `In Progress`, `Done`, and back to Backlog.
- [x] Manual: `Me` view still works for the logged-in user.
- [x] Manual: assignee picker can show Dave/any PM user without hardcoding a person.
- [x] Manual: assignee view shows `To Do`, `In Progress`, and `Done`, including completed tasks.
- [x] Manual: filters work for project, priority, overdue, and unassigned where applicable.
- [x] No unrelated dirty-worktree files are modified.
