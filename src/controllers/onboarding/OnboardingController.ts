import { Response } from "express";
import { RBACRequest } from "../../middleware/rbac";
import { AuthenticatedRequest } from "../../middleware/tokenRefresh";
import { extractOrganizationId } from "./feature-utils/onboardingHelpers";
import {
  validateProfileData,
  validateProgressData,
} from "./feature-utils/onboardingValidation";
import {
  completeOnboardingWithProfile,
  completeOnboardingForPasswordUser,
  saveProfileAndBootstrapOrg,
  markOnboardingComplete,
} from "./feature-services/ProfileCompletionService";
import {
  getWizardStatus as getWizardStatusService,
  markWizardComplete,
  resetWizard,
} from "./feature-services/WizardStatusService";
import {
  getSetupProgress as getSetupProgressService,
  updateSetupProgress as updateSetupProgressService,
} from "./feature-services/SetupProgressService";
import { GoogleConnectionModel } from "../../models/GoogleConnectionModel";
import { OrganizationModel } from "../../models/OrganizationModel";
import { resolveOrgType } from "../../config/orgLabels";
import { OrganizationUserModel } from "../../models/OrganizationUserModel";
import { UserModel } from "../../models/UserModel";
import { checkDomain as checkDomainService } from "./feature-services/DomainCheckService";
import {
  getAvailableGBPLocations,
  saveGBPSelection,
  getGBPLocationWebsite,
} from "./feature-services/GbpOnboardingService";
import logger from "../../lib/logger";

/**
 * Consistent error handler preserving the exact response shape
 * from the original onboarding route handlers.
 */
function handleError(res: Response, error: any, operation: string): void {
  logger.error({ err: error?.message || error }, `[Onboarding] ${operation} Error:`);

  const statusCode = error?.statusCode || 500;

  if (statusCode === 500) {
    res.status(500).json({
      success: false,
      error: `Failed to ${operation.toLowerCase()}`,
      message: error?.message || "Unknown error occurred",
      timestamp: new Date().toISOString(),
    });
    return;
  }

  // For 4xx errors, match the original response shapes
  if (statusCode === 400) {
    res.status(400).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  if (statusCode === 404) {
    res.status(404).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    return;
  }

  res.status(statusCode).json({
    success: false,
    error: error.message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * GET /api/onboarding/status
 *
 * Check if user has completed onboarding and return profile data.
 * Handles both OAuth users (have google_connections) and password-only users (no org yet).
 */
export async function getOnboardingStatus(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = req.organizationId;

    // Password-only user with no organization yet — return "not started" status
    if (!organizationId) {
      const userId = req.userId;
      const user = userId ? await UserModel.findById(userId) : null;

      res.json({
        success: true,
        onboardingCompleted: false,
        hasPropertyIds: false,
        propertyIds: null,
        organizationId: null,
        organizationType: "health",
        hasGoogleConnection: false,
        role: null,
        profile: {
          firstName: user?.first_name || null,
          lastName: user?.last_name || null,
          phone: user?.phone || null,
          practiceName: null,
          operationalJurisdiction: null,
          domainName: null,
          email: user?.email || null,
        },
      });
      return;
    }

    const googleAccount = await GoogleConnectionModel.findOneByOrganization(organizationId);
    const org = await OrganizationModel.findById(organizationId);

    // Look up user's role in this organization
    const userId = req.userId;
    const user = userId ? await UserModel.findById(userId) : null;
    const orgUser = userId ? await OrganizationUserModel.findByUserAndOrg(userId, organizationId) : null;
    const role = orgUser?.role || null;

    // User has org but no Google connection
    if (!googleAccount) {
      res.json({
        success: true,
        onboardingCompleted: !!org?.onboarding_completed,
        hasPropertyIds: false,
        propertyIds: null,
        organizationId,
        organizationType: resolveOrgType(org?.organization_type),
        hasGoogleConnection: false,
        role,
        profile: {
          firstName: user?.first_name || null,
          lastName: user?.last_name || null,
          phone: user?.phone || null,
          practiceName: org?.name || null,
          operationalJurisdiction: org?.operational_jurisdiction || null,
          domainName: org?.domain || null,
          email: user?.email || null,
        },
      });
      return;
    }

    // Profile fields and onboarding_completed now live on organizations/users
    // (google_connections only stores OAuth tokens + google_property_ids)
    res.json({
      success: true,
      onboardingCompleted: !!org?.onboarding_completed,
      hasPropertyIds: !!googleAccount.google_property_ids,
      propertyIds: googleAccount.google_property_ids || null,
      organizationId,
      organizationType: resolveOrgType(org?.organization_type),
      hasGoogleConnection: true,
      role,
      profile: {
        firstName: user?.first_name || null,
        lastName: user?.last_name || null,
        phone: user?.phone || null,
        practiceName: org?.name || null,
        operationalJurisdiction: org?.operational_jurisdiction || null,
        domainName: org?.domain || null,
        email: user?.email || null,
      },
    });
  } catch (error) {
    handleError(res, error, "Check onboarding status");
  }
}

/**
 * POST /api/onboarding/save-properties
 *
 * Save user's profile information and mark onboarding as complete.
 * Creates or updates the organization within a transaction.
 *
 * Supports two paths:
 * - OAuth users: req.organizationId exists → use completeOnboardingWithProfile
 * - Password users: no org yet → use completeOnboardingForPasswordUser to bootstrap
 */
export async function completeOnboarding(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const { profile } = req.body;
    const profileData = validateProfileData(profile);

    const organizationId = req.organizationId;

    if (organizationId) {
      // OAuth user path — org already exists
      const result = await completeOnboardingWithProfile(
        organizationId,
        profileData
      );

      res.json({
        success: true,
        message: "Onboarding completed successfully",
        profile: result.profile,
      });
    } else {
      // Password user path — no org yet, bootstrap one
      const userId = req.userId;
      if (!userId) {
        res.status(401).json({
          success: false,
          error: "Authentication required",
          timestamp: new Date().toISOString(),
        });
        return;
      }

      const result = await completeOnboardingForPasswordUser(
        userId,
        profileData
      );

      res.json({
        success: true,
        message: "Onboarding completed successfully",
        organizationId: result.organizationId,
        profile: result.profile,
      });
    }
  } catch (error) {
    handleError(res, error, "Save properties");
  }
}

/**
 * POST /api/onboarding/save-profile
 *
 * Save profile data and create/update the organization (Step 2).
 * Does NOT mark onboarding as complete — that happens in Step 3.
 */
export async function saveProfile(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const { profile } = req.body;
    const profileData = validateProfileData(profile);

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({
        success: false,
        error: "Authentication required",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const result = await saveProfileAndBootstrapOrg(
      userId,
      req.organizationId,
      profileData
    );

    res.json({
      success: true,
      message: "Profile saved successfully",
      organizationId: result.organizationId,
      profile: result.profile,
    });
  } catch (error) {
    handleError(res, error, "Save profile");
  }
}

/**
 * POST /api/onboarding/complete
 *
 * Mark onboarding as complete (Step 3 finalization).
 * Profile data was already saved in Step 2. This just flips the flag.
 */
export async function completeOnboardingFinal(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = req.organizationId;

    if (!organizationId) {
      res.status(400).json({
        success: false,
        error: "Organization must be created before completing onboarding",
        timestamp: new Date().toISOString(),
      });
      return;
    }

    await markOnboardingComplete(organizationId);

    res.json({
      success: true,
      message: "Onboarding completed successfully",
    });
  } catch (error) {
    handleError(res, error, "Complete onboarding");
  }
}

/**
 * GET /api/onboarding/wizard/status
 *
 * Check if user has completed the product tour wizard.
 */
export async function getWizardStatus(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = extractOrganizationId(req);

    const wizardCompleted = await getWizardStatusService(organizationId);

    res.json({
      onboarding_wizard_completed: wizardCompleted,
    });
  } catch (error) {
    handleError(res, error, "Check wizard status");
  }
}

/**
 * PUT /api/onboarding/wizard/complete
 *
 * Mark the product tour wizard as completed.
 */
export async function completeWizard(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = extractOrganizationId(req);

    await markWizardComplete(organizationId);

    res.json({
      success: true,
      onboarding_wizard_completed: true,
    });
  } catch (error) {
    handleError(res, error, "Complete wizard");
  }
}

/**
 * POST /api/onboarding/wizard/restart
 *
 * Reset the product tour wizard completion flag.
 */
export async function restartWizard(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = extractOrganizationId(req);

    await resetWizard(organizationId);

    res.json({
      success: true,
      onboarding_wizard_completed: false,
    });
  } catch (error) {
    handleError(res, error, "Restart wizard");
  }
}

/**
 * GET /api/onboarding/setup-progress
 *
 * Get the setup progress wizard state.
 */
export async function getSetupProgress(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = req.organizationId;

    if (!organizationId) {
      res.json({
        success: true,
        progress: null,
      });
      return;
    }

    const progress = await getSetupProgressService(organizationId);

    res.json({
      success: true,
      progress,
    });
  } catch (error) {
    handleError(res, error, "Get setup progress");
  }
}

/**
 * PUT /api/onboarding/setup-progress
 *
 * Update the setup progress wizard state.
 */
export async function updateSetupProgress(
  req: RBACRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = extractOrganizationId(req);

    const { progress } = req.body;
    const validatedProgress = validateProgressData(progress);

    await updateSetupProgressService(organizationId, validatedProgress);

    res.json({
      success: true,
      progress,
    });
  } catch (error) {
    handleError(res, error, "Update setup progress");
  }
}

/**
 * GET /api/onboarding/available-gbp
 *
 * Fetch available GBP locations for the authenticated user.
 * Requires tokenRefreshMiddleware (provides req.oauth2Client).
 */
export async function getAvailableGBP(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.oauth2Client) {
      res.status(401).json({ success: false, error: "Authentication failed" });
      return;
    }

    const properties = await getAvailableGBPLocations(req.oauth2Client);

    res.json({
      success: true,
      properties,
    });
  } catch (error) {
    handleError(res, error, "Fetch available GBP locations");
  }
}

/**
 * POST /api/onboarding/save-gbp
 *
 * Save selected GBP locations to google_property_ids.gbp.
 * Same storage pattern as the settings page.
 */
export async function saveGBP(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const organizationId = extractOrganizationId(req);
    const { data } = req.body;

    if (!data || !Array.isArray(data)) {
      const error = new Error("data must be an array of GBP locations");
      (error as any).statusCode = 400;
      throw error;
    }

    const result = await saveGBPSelection(organizationId, data);

    res.json({
      success: true,
      properties: result.properties,
      message: result.message,
    });
  } catch (error) {
    handleError(res, error, "Save GBP selection");
  }
}

/**
 * POST /api/onboarding/gbp-website
 *
 * Fetch the website URL for a specific GBP location.
 * Returns the raw websiteUri and a clean domain.
 */
export async function getGBPWebsite(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    if (!req.oauth2Client) {
      res.status(401).json({ success: false, error: "Authentication failed" });
      return;
    }

    const { accountId, locationId } = req.body;

    if (!accountId || !locationId) {
      const error = new Error("accountId and locationId are required");
      (error as any).statusCode = 400;
      throw error;
    }

    const result = await getGBPLocationWebsite(
      req.oauth2Client,
      accountId,
      locationId
    );

    res.json({
      success: true,
      websiteUri: result.websiteUri,
      domain: result.domain,
    });
  } catch (error) {
    handleError(res, error, "Fetch GBP website");
  }
}

/**
 * POST /api/onboarding/check-domain
 *
 * Check if a domain is reachable and not behind a firewall.
 * Returns valid/warning/unreachable status.
 * Warning does not block — user can still proceed.
 */
export async function checkDomain(
  req: AuthenticatedRequest,
  res: Response
): Promise<void> {
  try {
    const { domain } = req.body;

    if (!domain || typeof domain !== "string") {
      const error = new Error("domain is required");
      (error as any).statusCode = 400;
      throw error;
    }

    const result = await checkDomainService(domain);

    res.json({
      success: true,
      status: result.status,
      message: result.message,
    });
  } catch (error) {
    handleError(res, error, "Check domain");
  }
}
