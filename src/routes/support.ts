/**
 * Support Routes
 *
 * Handles user inquiries and support requests
 * - POST /api/support/inquiry - Submit a support request (sends email to admins)
 * - GET /api/support/health - Health check endpoint
 */

import express from "express";
import multer from "multer";
import * as attachmentsController from "../controllers/support/SupportTicketAttachmentsController";
import * as supportController from "../controllers/support/supportController";
import * as ticketsController from "../controllers/support/SupportTicketsController";
import { MAX_FILE_SIZE_BYTES } from "../controllers/support/support-attachments-utils/constants";
import { authenticateToken } from "../middleware/auth";
import {
  locationScopeMiddleware,
  rbacMiddleware,
} from "../middleware/rbac";

const router = express.Router();
const protectedSupport = [
  authenticateToken,
  rbacMiddleware,
  locationScopeMiddleware,
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

/**
 * POST /api/support/inquiry
 * Submit a support request / inquiry
 * This forwards the message to admin team via email
 */
router.post("/inquiry", supportController.handleInquiry);

/**
 * GET /api/support/health
 * Health check endpoint
 */
router.get("/health", supportController.healthCheck);

router.get("/tickets", ...protectedSupport, ticketsController.listTickets);
router.post("/tickets", ...protectedSupport, ticketsController.createTicket);
router.get("/tickets/:ticketId", ...protectedSupport, ticketsController.getTicket);
router.get(
  "/tickets/:ticketId/attachments",
  ...protectedSupport,
  attachmentsController.listClientAttachments
);
router.post(
  "/tickets/:ticketId/attachments",
  ...protectedSupport,
  upload.single("file"),
  attachmentsController.uploadClientAttachment
);
router.get(
  "/tickets/:ticketId/attachments/:attachmentId/url",
  ...protectedSupport,
  attachmentsController.getClientAttachmentUrl
);
router.post(
  "/tickets/:ticketId/messages",
  ...protectedSupport,
  ticketsController.addMessage
);

export default router;
