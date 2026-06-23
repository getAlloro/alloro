/**
 * Admin Organizations API
 *
 * Typed functions for admin organization management endpoints.
 * All functions use apiGet/apiPatch/apiDelete which internally call getPriorityItem
 * for auth tokens, making them pilot-mode-aware.
 */

import { apiGet, apiPatch, apiDelete, apiPost, apiPut } from "./index";

/**
 * Typed interfaces for admin org responses
 */

export interface AdminOrganization {
  id: number;
  name: string;
  domain: string | null;
  organization_type: "health" | "generic" | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  archived_at: string | null;
  archived_by_user_id: number | null;
  archive_reason: string | null;
  archive_metadata: Record<string, unknown> | null;
  created_at: string;
  userCount: number;
  connections: { gbp: boolean };
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
  joined_at: string;
  has_password: boolean;
}

export interface AdminConnection {
  accountId: string;
  email: string;
  properties: { gbp?: unknown[] };
}

export interface AdminWebsite {
  id: number;
  generated_hostname: string;
  status: string;
  created_at: string;
}

export interface AdminOrganizationDetail {
  id: number;
  name: string;
  domain: string | null;
  organization_type: "health" | "generic" | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_status: string | null;
  stripe_customer_id: string | null;
  archived_at: string | null;
  archived_by_user_id: number | null;
  archive_reason: string | null;
  archive_metadata: Record<string, unknown> | null;
  created_at: string;
  userCount?: number;
  users: AdminUser[];
  connections: AdminConnection[];
  website: AdminWebsite | null;
}

export interface AdminGoogleProperty {
  id: number;
  location_id: number;
  type: "gbp";
  external_id: string;
  display_name: string | null;
  metadata: Record<string, unknown> | null;
  selected: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdminLocation {
  id: number;
  organization_id: number;
  name: string;
  domain: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
  googleProperties: AdminGoogleProperty[];
}

export interface AdminLocationsResponse {
  success: boolean;
  locations: AdminLocation[];
  total: number;
}

export interface AdminOrganizationsListResponse {
  success: boolean;
  view: AdminOrganizationListView;
  organizations: AdminOrganization[];
}

export interface AdminOrganizationDetailResponse {
  success: boolean;
  organization: AdminOrganizationDetail;
  users: AdminUser[];
  connections: AdminConnection[];
  website: AdminWebsite | null;
}

export interface PilotSessionResponse {
  success: boolean;
  token: string;
  googleAccountId: number | null;
  user: { id: number; email: string };
}

export type RecipientChannel = "website_form" | "agent_notifications";
export type RecipientSource =
  | "configured"
  | "legacy_project"
  | "org_admins"
  | "google_connection"
  | "env_fallback"
  | "none";

export interface RecipientOrgUserOption {
  name: string;
  email: string;
  role: string;
}

export interface RecipientChannelState {
  channel: RecipientChannel;
  recipients: string[];
  effectiveRecipients: string[];
  effectiveSource: RecipientSource;
}

export interface AdminRecipientSettingsData {
  channels: Record<RecipientChannel, RecipientChannelState>;
  orgUsers: RecipientOrgUserOption[];
}

export interface AdminRecipientSettingsResponse {
  success: boolean;
  data: AdminRecipientSettingsData;
}

export type AdminOrganizationListView = "active" | "archived" | "all";

export interface AdminOrganizationArchiveResult {
  organization: AdminOrganizationDetail;
  archivedProjects: number;
  disconnectedDomains: number;
  pausedAutomationSettings: number;
}

export interface AdminOrganizationUnarchiveResult {
  organization: AdminOrganizationDetail;
  restoredProjects: number;
  restoredAutomationSettings: number;
}

/**
 * List all organizations with summary metadata
 */
export async function adminListOrganizations(
  view: AdminOrganizationListView = "active"
): Promise<AdminOrganizationsListResponse> {
  return apiGet({ path: `/admin/organizations?view=${view}` });
}

/**
 * Get a single organization with users, connections, and website details
 */
export async function adminGetOrganization(
  orgId: number
): Promise<AdminOrganizationDetailResponse> {
  return apiGet({ path: `/admin/organizations/${orgId}` });
}

/**
 * Get recipient settings for both organization-level recipient channels.
 */
export async function adminGetRecipientSettings(
  orgId: number
): Promise<AdminRecipientSettingsResponse> {
  return apiGet({ path: `/admin/organizations/${orgId}/recipient-settings` });
}

/**
 * Update explicit recipients for one organization recipient channel.
 */
export async function adminUpdateRecipientSettings(
  orgId: number,
  channel: RecipientChannel,
  recipients: string[]
): Promise<AdminRecipientSettingsResponse> {
  return apiPut({
    path: `/admin/organizations/${orgId}/recipient-settings/${channel}`,
    passedData: { recipients },
  });
}

/**
 * Update organization name
 */
export async function adminUpdateOrganizationName(
  orgId: number,
  name: string
): Promise<{ success: boolean; message: string; organization: { id: number; name: string } }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}`,
    passedData: { name },
  });
}

/**
 * Update organization subscription tier
 */
export async function adminUpdateOrganizationTier(
  orgId: number,
  tier: "DWY" | "DFY"
): Promise<{ success: boolean; tier: string; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/tier`,
    passedData: { tier },
  });
}

/**
 * Set or change organization type (health or generic).
 */
export async function adminUpdateOrganizationType(
  orgId: number,
  type: "health" | "generic"
): Promise<{ success: boolean; type: string; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/type`,
    passedData: { type },
  });
}

/**
 * Archive organization and connected operational surfaces.
 */
export async function adminArchiveOrganization(
  orgId: number,
  reason?: string | null
): Promise<{ success: boolean; data: AdminOrganizationArchiveResult }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/archive`,
    passedData: { reason },
  });
}

/**
 * Restore organization visibility. Domains remain disconnected.
 */
export async function adminUnarchiveOrganization(
  orgId: number
): Promise<{ success: boolean; data: AdminOrganizationUnarchiveResult }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/unarchive`,
    passedData: {},
  });
}

/**
 * Delete organization (requires confirmation)
 */
export async function adminDeleteOrganization(orgId: number): Promise<{ success: boolean }> {
  return apiDelete({ path: `/admin/organizations/${orgId}?confirmDelete=true` });
}

/**
 * Reset Org Data — admin destructive feature
 *
 * Two reset groups in v1:
 * - `pms_ingestion`  → wipes pms_jobs for the org
 * - `agent_referral` → wipes agent_results (and dependent agent_recommendations)
 *                      where agent_type = 'referral_engine'
 *
 * The cascade rule "PMS reset also clears Referral Engine output" is enforced
 * client-side in the modal — backend deletes literally what's in `groups`.
 */
export type ResetGroupKey = "pms_ingestion" | "agent_referral";

export const RESET_GROUP_KEYS: readonly ResetGroupKey[] = [
  "pms_ingestion",
  "agent_referral",
] as const;

export interface ResetPreviewData {
  orgId: number;
  orgName: string;
  counts: Record<ResetGroupKey, number>;
}

export interface ResetResultData {
  success: true;
  groupsExecuted: ResetGroupKey[];
  deletedCounts: Record<string, number>;
}

interface ResetPreviewEnvelope {
  success: boolean;
  data?: ResetPreviewData;
  error?: string;
  errorMessage?: string;
}

interface ResetResultEnvelope {
  success: boolean;
  data?: ResetResultData;
  error?: string;
  errorMessage?: string;
}

/**
 * Fetch row counts per reset group for preview in the modal.
 */
export async function adminPreviewResetData(
  orgId: number
): Promise<ResetPreviewData> {
  const res: ResetPreviewEnvelope = await apiGet({
    path: `/admin/organizations/${orgId}/reset-data/preview`,
  });
  if (!res.success || !res.data) {
    throw new Error(
      res.error || res.errorMessage || "Failed to load reset preview"
    );
  }
  return res.data;
}

/**
 * Execute the reset. Body must include the exact org name (server-validated)
 * and the list of groups to wipe.
 */
export async function adminResetOrgData(
  orgId: number,
  body: { groups: ResetGroupKey[]; confirmName: string }
): Promise<ResetResultData> {
  const res: ResetResultEnvelope = await apiPost({
    path: `/admin/organizations/${orgId}/reset-data`,
    passedData: body,
  });
  if (!res.success || !res.data) {
    throw new Error(
      res.error || res.errorMessage || "Failed to reset organization data"
    );
  }
  return res.data;
}

/**
 * Get all locations for an organization with their Google Properties
 */
export async function adminGetOrganizationLocations(
  orgId: number
): Promise<AdminLocationsResponse> {
  return apiGet({ path: `/admin/organizations/${orgId}/locations` });
}

/**
 * Create a new organization with an initial admin user
 */
export interface AdminCreateOrgInput {
  organization: {
    name: string;
    domain?: string;
    address?: string;
    type?: "health" | "generic";
  };
  user: {
    email: string;
    password: string;
    firstName?: string;
    lastName?: string;
  };
  location: {
    name: string;
    address?: string;
  };
}

export interface AdminCreateOrgResponse {
  success: boolean;
  organizationId: number;
  userId: number;
  locationId: number;
  message: string;
}

export async function adminCreateOrganization(
  input: AdminCreateOrgInput
): Promise<AdminCreateOrgResponse> {
  return apiPost({
    path: "/admin/organizations",
    passedData: input,
  });
}

/**
 * Lock out an organization (sets subscription_status to inactive).
 * Only works for orgs without active Stripe subscription.
 */
export async function adminLockoutOrganization(
  orgId: number
): Promise<{ success: boolean; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/lockout`,
    passedData: {},
  });
}

/**
 * Unlock an organization (sets subscription_status back to active).
 */
export async function adminUnlockOrganization(
  orgId: number
): Promise<{ success: boolean; message: string }> {
  return apiPatch({
    path: `/admin/organizations/${orgId}/unlock`,
    passedData: {},
  });
}

/**
 * Create a website project for an organization.
 * Only works if the org doesn't already have a project.
 */
export async function adminCreateProject(
  orgId: number
): Promise<{
  success: boolean;
  message: string;
  project?: { generated_hostname: string; status: string };
}> {
  return apiPost({
    path: `/admin/organizations/${orgId}/create-project`,
    passedData: {},
  });
}

/**
 * Remove payment method from an organization.
 * Cancels the Stripe subscription and clears Stripe IDs.
 * Reverts org to admin-granted state.
 */
export async function adminRemovePaymentMethod(
  orgId: number
): Promise<{ success: boolean; message: string }> {
  return apiPost({
    path: `/admin/organizations/${orgId}/remove-payment-method`,
    passedData: {},
  });
}

/**
 * Get detailed billing info for an organization (Stripe data).
 */
export interface AdminBillingPaymentMethod {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface AdminBillingInvoice {
  id: string;
  date: string;
  amount: number;
  currency: string;
  status: string;
  coupon: string | null;
  hostedInvoiceUrl: string | null;
}

export interface AdminBillingDiscount {
  couponName: string;
  percentOff: number | null;
  amountOff: number | null;
}

export interface AdminBillingDetails {
  success: boolean;
  paymentMethod: AdminBillingPaymentMethod | null;
  invoices: AdminBillingInvoice[];
  discount: AdminBillingDiscount | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
}

export async function adminGetBillingDetails(
  orgId: number
): Promise<AdminBillingDetails> {
  return apiGet({ path: `/admin/organizations/${orgId}/billing` });
}

/**
 * Start a pilot session as a specific user
 */
export async function adminStartPilotSession(
  userId: number
): Promise<PilotSessionResponse> {
  return apiPost({
    path: `/admin/pilot/${userId}`,
    passedData: {},
  });
}

/**
 * Set a temporary password for a user (admin only)
 */
export interface AdminSetPasswordResponse {
  success: boolean;
  temporaryPassword: string;
  message: string;
}

export async function adminSetUserPassword(
  userId: number,
  notifyUser: boolean
): Promise<AdminSetPasswordResponse> {
  return apiPost({
    path: `/admin/organizations/users/${userId}/set-password`,
    passedData: { notifyUser },
  });
}

/**
 * Get business data for an organization (org-level + all locations)
 */
export async function adminGetBusinessData(
  orgId: number
): Promise<{
  success: boolean;
  organization: { id: number; name: string; business_data: Record<string, unknown> | null };
  locations: Array<{
    id: number;
    name: string;
    is_primary: boolean;
    business_data: Record<string, unknown> | null;
  }>;
}> {
  return apiGet({ path: `/admin/organizations/${orgId}/business-data` });
}

/**
 * Refresh location business data from Google (admin-scoped)
 */
export async function adminRefreshBusinessData(
  orgId: number,
  locationId: number
): Promise<{ success: boolean; business_data: Record<string, unknown> }> {
  return apiPost({
    path: `/admin/organizations/${orgId}/locations/${locationId}/refresh-business-data`,
    passedData: {},
  });
}

/**
 * Sync org-level business data from primary location
 */
export async function adminSyncOrgBusinessData(
  orgId: number
): Promise<{ success: boolean; business_data: Record<string, unknown> }> {
  return apiPost({
    path: `/admin/organizations/${orgId}/sync-org-business-data`,
    passedData: {},
  });
}
