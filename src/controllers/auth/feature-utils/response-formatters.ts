import { Response } from "express";
import logger from "../../../lib/logger";

/**
 * Error response interface matching the original route's shape
 */
interface ErrorResponse {
  error: string;
  message: string;
  details?: any;
  timestamp: string;
}

/**
 * Enhanced error handler for API responses.
 * Extracts status from error.response.status and includes dev-mode details.
 *
 * @param res Express response object
 * @param error Error object or message
 * @param operation Operation name for logging
 * @returns Express response
 */
export function handleError(res: Response, error: any, operation: string): Response {
  const errorDetails = {
    operation,
    message: error?.message || "Unknown error occurred",
    status: error?.response?.status || error?.status || 500,
    timestamp: new Date().toISOString(),
    stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
  };

  logger.error({ err: {
        ...errorDetails,
        ...(error?.response?.data && { googleApiError: error.response.data }),
      } }, `[AUTH ERROR] ${operation}:`);

  const response: ErrorResponse = {
    error: `Failed to ${operation.toLowerCase()}`,
    message: errorDetails.message,
    timestamp: errorDetails.timestamp,
    ...(process.env.NODE_ENV === "development" && {
      details: errorDetails,
    }),
  };

  return res.status(errorDetails.status).json(response);
}

/**
 * Callback response type matching the original route's shape
 */
interface CallbackResponsePayload {
  success: boolean;
  user: any;
  googleConnection: any;
  message: string;
  accessToken?: string;
  expiresAt?: Date;
  googleConnectionId?: number;
  role?: string;
}

/**
 * Generates the HTML popup response for the OAuth callback.
 * This HTML is sent to the browser after successful OAuth, posts a message
 * to the parent window, and closes the popup.
 *
 * @param response The callback response payload to embed in the HTML
 * @returns HTML string
 */
export function generatePopupHtml(response: CallbackResponsePayload): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <title>Authentication Successful</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      text-align: center;
      padding: 2rem;
    }
    .success-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    h1 {
      margin: 0 0 1rem 0;
      font-size: 1.75rem;
    }
    p {
      margin: 0;
      opacity: 0.9;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="success-icon">\u2713</div>
    <h1>Authentication Successful!</h1>
    <p>This window will close automatically...</p>
  </div>
  <script>
    // Send success message to parent window
    // Use "*" as target origin because cross-origin redirects break origin matching
    // Security is handled by origin validation in the frontend message handler
    if (window.opener) {
      window.opener.postMessage(
        {
          type: 'GOOGLE_OAUTH_SUCCESS',
          payload: ${JSON.stringify(response)}
        },
        '*'
      );
    }

    // Close popup after a short delay
    setTimeout(() => {
      window.close();
    }, 1500);
  </script>
</body>
</html>`;
}
