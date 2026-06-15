/**
 * Admin Websites — Form Submissions sub-router
 *
 * Submission inbox: list, mark-all-read, bulk actions (send-email/delete/read),
 * and single-submission get/read-toggle/send-email/delete.
 *
 * Mounted by `../websites.ts` AFTER the super-admin auth hoist, so every route
 * inherits `[authenticateToken, superAdminMiddleware]`. Bulk and literal routes
 * are declared before the parameterized `:submissionId` routes to avoid
 * shadowing, exactly as in the original file.
 */

import express from "express";
import * as controller from "../../../controllers/admin-websites/FormSubmissionsController";

const router = express.Router();

// =====================================================================
// FORM SUBMISSIONS
// =====================================================================

// GET  /:id/form-submissions — List submissions with pagination
router.get("/:id/form-submissions", controller.listFormSubmissions);

// PATCH /:id/form-submissions/mark-all-read — Mark form submissions read
router.patch("/:id/form-submissions/mark-all-read", controller.markAllFormSubmissionsRead);

// Bulk routes must be registered before parameterized :submissionId routes
// POST /:id/form-submissions/bulk/send-email — Bulk send flagged submissions
router.post("/:id/form-submissions/bulk/send-email", controller.bulkSendFormSubmissionsEmail);

// DELETE /:id/form-submissions/bulk — Bulk delete submissions
router.delete("/:id/form-submissions/bulk", controller.bulkDeleteFormSubmissions);

// PATCH /:id/form-submissions/bulk/read — Bulk toggle read status
router.patch("/:id/form-submissions/bulk/read", controller.bulkToggleFormSubmissionsRead);

// GET  /:id/form-submissions/:submissionId — Get single submission
router.get("/:id/form-submissions/:submissionId", controller.getFormSubmission);

// PATCH /:id/form-submissions/:submissionId/read — Toggle read status
router.patch("/:id/form-submissions/:submissionId/read", controller.toggleFormSubmissionRead);

// POST /:id/form-submissions/:submissionId/send-email — Manually send a submission
router.post("/:id/form-submissions/:submissionId/send-email", controller.sendFormSubmissionEmail);

// DELETE /:id/form-submissions/:submissionId — Delete a submission
router.delete("/:id/form-submissions/:submissionId", controller.deleteFormSubmission);

export default router;
