import { apiGet, apiPost, apiPut, unwrap } from "./index";

const baseurl = "/onboarding";

// ─── Response contracts ───
// These endpoints put their fields at the TOP LEVEL (no `data` wrapper), so
// `unwrap` returns the full body. `success`/`successful:false` is only ever an
// error signal — `unwrap` throws an ApiError on it — so on the success path the
// body still carries `.success === true` plus the fields below, which consumers
// keep reading. The real "not onboarded yet" state is `{ success:true,
// onboardingCompleted:false }`, preserved here.

interface OnboardingStatusResponse {
  success?: boolean;
  onboardingCompleted?: boolean;
  hasGoogleConnection?: boolean;
  role?: string;
  organizationId?: number | null;
  organizationType?: "health" | "generic" | null;
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    practiceName?: string | null;
    domainName?: string | null;
    email?: string | null;
  } | null;
  propertyIds?: {
    gbp?: Array<{ accountId?: string; locationId?: string }> | null;
  } | null;
}

interface AvailablePropertiesResponse {
  success?: boolean;
  properties?: Array<{
    id: string;
    name: string;
    accountId: string;
    locationId: string;
    address?: string;
  }>;
}

interface SaveProfileResponse {
  success?: boolean;
  organizationId?: number | null;
}

interface CompleteOnboardingResponse {
  success?: boolean;
}

interface SavePropertiesResponse {
  success?: boolean;
}

interface WizardStatusResponse {
  onboarding_wizard_completed?: boolean;
  error?: string;
}

interface CompleteWizardResponse {
  success?: boolean;
}

interface RestartWizardResponse {
  success?: boolean;
}

interface SetupProgressState {
  step1_api_connected: boolean;
  step2_pms_uploaded: boolean;
  dismissed: boolean;
  completed: boolean;
}

interface GetSetupProgressResponse {
  success?: boolean;
  progress?: SetupProgressState;
}

interface UpdateSetupProgressResponse {
  success?: boolean;
}

interface AvailableGBPResponse {
  success?: boolean;
  properties?: Array<{
    id: string;
    name: string;
    accountId: string;
    locationId: string;
    address?: string;
  }>;
}

interface SaveGBPResponse {
  success?: boolean;
}

interface GBPWebsiteResponse {
  success?: boolean;
  website?: string | null;
}

interface CheckDomainResponse {
  success?: boolean;
  status?: string;
  message?: string;
}

/**
 * Check if user has completed onboarding
 */
async function getOnboardingStatus() {
  return unwrap<OnboardingStatusResponse>(
    await apiGet({
      path: baseurl + `/status`,
    }),
  );
}

/**
 * Fetch all available properties (GBP) for the authenticated user
 */
async function getAvailableProperties() {
  return unwrap<AvailablePropertiesResponse>(
    await apiGet({
      path: baseurl + `/available-properties`,
    }),
  );
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
  return unwrap<SaveProfileResponse>(
    await apiPost({
      path: baseurl + `/save-profile`,
      passedData: data,
    }),
  );
}

/**
 * Mark onboarding as complete (Step 3 finalization).
 */
async function completeOnboarding() {
  return unwrap<CompleteOnboardingResponse>(
    await apiPost({
      path: baseurl + `/complete`,
      passedData: {},
    }),
  );
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
  return unwrap<SavePropertiesResponse>(
    await apiPost({
      path: baseurl + `/save-properties`,
      passedData: data,
    }),
  );
}

/**
 * Check if user has completed the onboarding wizard (product tour)
 */
async function getWizardStatus() {
  return unwrap<WizardStatusResponse>(
    await apiGet({
      path: baseurl + `/wizard/status`,
    }),
  );
}

/**
 * Mark the onboarding wizard as completed
 */
async function completeWizard() {
  return unwrap<CompleteWizardResponse>(
    await apiPut({
      path: baseurl + `/wizard/complete`,
      passedData: {},
    }),
  );
}

/**
 * Reset the onboarding wizard (for re-showing the tour)
 */
async function restartWizard() {
  return unwrap<RestartWizardResponse>(
    await apiPost({
      path: baseurl + `/wizard/restart`,
      passedData: {},
    }),
  );
}

/**
 * Get setup progress wizard state
 */
async function getSetupProgress() {
  return unwrap<GetSetupProgressResponse>(
    await apiGet({
      path: baseurl + `/setup-progress`,
    }),
  );
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
  return unwrap<UpdateSetupProgressResponse>(
    await apiPut({
      path: baseurl + `/setup-progress`,
      passedData: { progress },
    }),
  );
}

/**
 * Fetch available GBP locations for the authenticated user
 */
async function getAvailableGBP() {
  return unwrap<AvailableGBPResponse>(
    await apiGet({
      path: baseurl + `/available-gbp`,
    }),
  );
}

/**
 * Save selected GBP locations to google_property_ids.gbp
 */
async function saveGBP(data: Array<{ accountId: string; locationId: string; displayName: string }>) {
  return unwrap<SaveGBPResponse>(
    await apiPost({
      path: baseurl + `/save-gbp`,
      passedData: { data },
    }),
  );
}

/**
 * Fetch website URL for a specific GBP location
 */
async function getGBPWebsite(accountId: string, locationId: string) {
  return unwrap<GBPWebsiteResponse>(
    await apiPost({
      path: baseurl + `/gbp-website`,
      passedData: { accountId, locationId },
    }),
  );
}

/**
 * Check if a domain is reachable and not behind a firewall
 */
async function checkDomain(domain: string) {
  return unwrap<CheckDomainResponse>(
    await apiPost({
      path: baseurl + `/check-domain`,
      passedData: { domain },
    }),
  );
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
