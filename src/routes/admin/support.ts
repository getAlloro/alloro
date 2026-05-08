import express from "express";
import { authenticateToken } from "../../middleware/auth";
import { superAdminMiddleware } from "../../middleware/superAdmin";
import * as controller from "../../controllers/admin-support/AdminSupportTicketsController";
import * as attachmentsController from "../../controllers/support/SupportTicketAttachmentsController";
import multer from "multer";
import { MAX_FILE_SIZE_BYTES } from "../../controllers/support/support-attachments-utils/constants";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES },
});

router.get(
  "/tickets",
  authenticateToken,
  superAdminMiddleware,
  controller.listTickets
);

router.get(
  "/tickets/:ticketId",
  authenticateToken,
  superAdminMiddleware,
  controller.getTicket
);

router.patch(
  "/tickets/:ticketId",
  authenticateToken,
  superAdminMiddleware,
  controller.updateTicket
);

router.get(
  "/tickets/:ticketId/attachments",
  authenticateToken,
  superAdminMiddleware,
  attachmentsController.listAdminAttachments
);

router.post(
  "/tickets/:ticketId/attachments",
  authenticateToken,
  superAdminMiddleware,
  upload.single("file"),
  attachmentsController.uploadAdminAttachment
);

router.get(
  "/tickets/:ticketId/attachments/:attachmentId/url",
  authenticateToken,
  superAdminMiddleware,
  attachmentsController.getAdminAttachmentUrl
);

router.post(
  "/tickets/:ticketId/messages",
  authenticateToken,
  superAdminMiddleware,
  controller.addMessage
);

export default router;
