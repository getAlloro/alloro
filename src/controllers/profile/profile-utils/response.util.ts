import logger from "../../../lib/logger";

export interface ProfileData {
  operational_jurisdiction: string | null;
}

export function formatProfileDataResponse(data: ProfileData) {
  return {
    success: true,
    data: {
      operational_jurisdiction: data.operational_jurisdiction,
    },
  };
}

export function formatProfileUpdateResponse(data: ProfileData) {
  return {
    success: true,
    message: "Profile updated successfully",
    data: {
      operational_jurisdiction: data.operational_jurisdiction,
    },
  };
}

export function formatErrorResponse(error: any, operation: string) {
  logger.error({ err: error?.message || error }, `[Profile] ${operation} Error:`);

  const statusCode = error?.statusCode || 500;

  if (statusCode === 500) {
    return {
      statusCode,
      body: {
        success: false,
        error: `Failed to ${operation.toLowerCase()}`,
        message: error?.message || "Unknown error occurred",
        timestamp: new Date().toISOString(),
      },
    };
  }

  return {
    statusCode,
    body: {
      success: false,
      error: error.message,
    },
  };
}
