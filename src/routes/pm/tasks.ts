import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/pm/PmTasksController";
import * as taskViews from "../../controllers/pm/PmTaskViewsController";

const router = express.Router();

// GET /api/pm/tasks/backlog — global backlog grouped by project
router.get(
  "/tasks/backlog",
  authenticateToken,
  superAdminMiddleware,
  taskViews.getBacklogTasks
);

// GET /api/pm/tasks/assigned/:userId — cross-project task groups for a PM user
router.get(
  "/tasks/assigned/:userId",
  authenticateToken,
  superAdminMiddleware,
  taskViews.getAssignedTasks
);

// POST /api/pm/projects/:id/tasks — create task in specified column
router.post(
  "/projects/:id/tasks",
  authenticateToken,
  superAdminMiddleware,
  controller.createTask
);

// PUT /api/pm/tasks/:id — update task fields
router.put(
  "/tasks/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.updateTask
);

// PUT /api/pm/tasks/:id/move — move task to column + position
router.put(
  "/tasks/:id/move",
  authenticateToken,
  superAdminMiddleware,
  controller.moveTask
);

// PUT /api/pm/tasks/:id/assign — assign task to user
router.put(
  "/tasks/:id/assign",
  authenticateToken,
  superAdminMiddleware,
  controller.assignTask
);

// DELETE /api/pm/tasks/:id — delete task
router.delete(
  "/tasks/:id",
  authenticateToken,
  superAdminMiddleware,
  controller.deleteTask
);

// POST /api/pm/tasks/bulk/move-to-project — move backlog tasks to another project
router.post(
  "/tasks/bulk/move-to-project",
  authenticateToken,
  superAdminMiddleware,
  controller.bulkMoveTasksToProject
);

// POST /api/pm/tasks/bulk/delete — delete multiple tasks
router.post(
  "/tasks/bulk/delete",
  authenticateToken,
  superAdminMiddleware,
  controller.bulkDeleteTasks
);

export default router;
