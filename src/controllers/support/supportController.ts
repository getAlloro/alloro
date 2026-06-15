import { Request, Response } from "express";
import { validateInquiryInput } from "./support-utils/validationUtils";
import { processInquiry } from "./support-services/inquiryService";
import logger from "../../lib/logger";

export async function handleInquiry(req: Request, res: Response) {
  try {
    const validation = validateInquiryInput(req.body);

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        error: validation.error,
        message: validation.message,
      });
    }

    const result = await processInquiry(validation.data!);

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: "EMAIL_FAILED",
        message:
          "We couldn't send your message at this time. Please try again later or contact us directly.",
      });
    }

    return res.json({
      success: true,
      message:
        "Your message has been sent successfully. We'll get back to you soon!",
      messageId: result.messageId,
    });
  } catch (error: any) {
    logger.error({ err: error.message || error }, "[Support] Error processing inquiry:");
    return res.status(500).json({
      success: false,
      error: "SERVER_ERROR",
      message: "An unexpected error occurred. Please try again later.",
    });
  }
}

export function healthCheck(_req: Request, res: Response) {
  res.json({
    success: true,
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
}
