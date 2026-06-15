import { apiPost } from "./index";
import { logger } from "../lib/logger";

const baseurl = "/clarity";

async function getKeyData(domain: string) {
  try {
    return await apiPost({
      path: baseurl + `/getKeyData`,
      passedData: { clientId: domain },
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

async function getAIReadyData(clientId: string) {
  try {
    return await apiPost({
      path: baseurl + `/getAIReadyData`,
      passedData: { clientId },
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

const clarity = {
  getKeyData,
  getAIReadyData,
};

export default clarity;
