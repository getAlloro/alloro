import { apiGet, apiPost, apiPut } from "./index";
import { logger } from "../lib/logger";

const baseurl = "/onboarding";

/**
 * Check if user has completed onboarding
 */
async function getOnboardingStatus() {
  try {
    return await apiGet({
      path: baseurl + `/status`,
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Fetch all available properties (GBP) for the authenticated user
 */
async function getAvailableProperties() {
  try {
    return await apiGet({
      path: baseurl + `/available-properties`,
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Save profile data and create/update organization (Step 2).
 * Does NOT mark onboarding as complete.
 */
async function saveProfile(data: {
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    practiceName: string;
    operationalJurisdiction: string;
    domainName: string;
  };
}) {
  try {
    return await apiPost({
      path: baseurl + `/save-profile`,
      passedData: data,
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Mark onboarding as complete (Step 3 finalization).
 */
async function completeOnboarding() {
  try {
    return await apiPost({
      path: baseurl + `/complete`,
      passedData: {},
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Save user's selected properties (legacy endpoint)
 */
async function saveProperties(data: {
  profile: {
    firstName: string;
    lastName: string;
    phone: string;
    practiceName: string;
    operationalJurisdiction: string;
    domainName: string;
  };
}) {
  try {
    return await apiPost({
      path: baseurl + `/save-properties`,
      passedData: data,
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Check if user has completed the onboarding wizard (product tour)
 */
async function getWizardStatus() {
  try {
    return await apiGet({
      path: baseurl + `/wizard/status`,
    });
  } catch (err) {
    logger.log(err);
    return {
      successful: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Mark the onboarding wizard as completed
 */
async function completeWizard() {
  try {
    return await apiPut({
      path: baseurl + `/wizard/complete`,
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

/**
 * Reset the onboarding wizard (for re-showing the tour)
 */
async function restartWizard() {
  try {
    return await apiPost({
      path: baseurl + `/wizard/restart`,
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

/**
 * Get setup progress wizard state
 */
async function getSetupProgress() {
  try {
    return await apiGet({
      path: baseurl + `/setup-progress`,
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Update setup progress wizard state
 */
async function updateSetupProgress(progress: {
  step1_api_connected: boolean;
  step2_pms_uploaded: boolean;
  dismissed: boolean;
  completed: boolean;
}) {
  try {
    return await apiPut({
      path: baseurl + `/setup-progress`,
      passedData: { progress },
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Fetch available GBP locations for the authenticated user
 */
async function getAvailableGBP() {
  try {
    return await apiGet({
      path: baseurl + `/available-gbp`,
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Save selected GBP locations to google_property_ids.gbp
 */
async function saveGBP(data: Array<{ accountId: string; locationId: string; displayName: string }>) {
  try {
    return await apiPost({
      path: baseurl + `/save-gbp`,
      passedData: { data },
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Fetch website URL for a specific GBP location
 */
async function getGBPWebsite(accountId: string, locationId: string) {
  try {
    return await apiPost({
      path: baseurl + `/gbp-website`,
      passedData: { accountId, locationId },
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

/**
 * Check if a domain is reachable and not behind a firewall
 */
async function checkDomain(domain: string) {
  try {
    return await apiPost({
      path: baseurl + `/check-domain`,
      passedData: { domain },
    });
  } catch (err) {
    logger.log(err);
    return {
      success: false,
      errorMessage: "Technical error, contact developer",
    };
  }
}

const onboarding = {
  getOnboardingStatus,
  getAvailableProperties,
  saveProfile,
  completeOnboarding,
  saveProperties,
  getWizardStatus,
  completeWizard,
  restartWizard,
  getSetupProgress,
  updateSetupProgress,
  getAvailableGBP,
  saveGBP,
  getGBPWebsite,
  checkDomain,
};

export default onboarding;
