import { apiGet, apiPost } from "./index";
import { logger } from "../lib/logger";

const baseurl = "/auth/google";

async function getOAuthUrl() {
  try {
    return await apiGet({
      path: baseurl,
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function validateToken(connectionId: number) {
  try {
    return await apiGet({
      path: baseurl + `/validate/${connectionId}`,
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function disconnectAccount() {
  try {
    return await apiPost({
      path: baseurl + `/disconnect`,
      passedData: {},
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

const googleAuth = {
  getOAuthUrl,
  validateToken,
  disconnectAccount,
};

export default googleAuth;
