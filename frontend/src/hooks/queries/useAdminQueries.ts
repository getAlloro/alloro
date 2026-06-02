/**
 * TanStack Query hooks for all admin pages.
 *
 * Each hook uses the initialData + initialDataUpdatedAt pattern so that
 * previously-cached data is returned synchronously on mount while a
 * background refetch runs if stale.
 */

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryClient, QUERY_KEYS } from "../../lib/queryClient";

// ─── API imports ─────────────────────────────────────────────────
import {
  adminListOrganizations,
  adminGetOrganization,
  adminGetOrganizationLocations,
  adminGetRecipientSettings,
  type AdminOrganizationListView,
  type AdminOrganization,
  type AdminOrganizationDetail,
  type AdminUser,
  type AdminConnection,
  type AdminWebsite,
  type AdminLocation,
  type AdminRecipientSettingsData,
} from "../../api/admin-organizations";

import { listMinds, type Mind } from "../../api/minds";

import {
  fetchWebsites,
  fetchStatuses,
  fetchWebsiteDetail,
  type FetchWebsitesRequest,
  type WebsitesResponse,
  type StatusesResponse,
  type WebsiteProjectWithPages,
} from "../../api/websites";

import { fetchTemplates, type Template } from "../../api/templates";

// ─── Derived types ───────────────────────────────────────────────

/** Organisation detail merged with its related entities */
export type AdminOrganizationMerged = AdminOrganizationDetail & {
  users: AdminUser[];
  connections: AdminConnection[];
  website: AdminWebsite | null;
};

// =====================================================================
// QUERY HOOKS
// =====================================================================

/**
 * All organisations (list view).
 */
export function useAdminOrganizations(view: AdminOrganizationListView = "active") {
  const queryKey = QUERY_KEYS.organizations(view);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await adminListOrganizations(view);
      if (!response.success) throw new Error("Failed to fetch organizations");
      return response.organizations;
    },
    initialData: () => queryClient.getQueryData<AdminOrganization[]>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * Single organisation with users, connections & website merged in.
 */
export function useAdminOrganization(orgId: number) {
  const queryKey = QUERY_KEYS.organization(orgId);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await adminGetOrganization(orgId);
      if (!response.success)
        throw new Error("Failed to fetch organization detail");

      // Merge related entities onto the organisation object
      const merged: AdminOrganizationMerged = {
        ...response.organization,
        users: response.users,
        connections: response.connections,
        website: response.website,
      };
      return merged;
    },
    enabled: orgId > 0,
    initialData: () =>
      queryClient.getQueryData<AdminOrganizationMerged>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * Locations (with Google Properties) for a single organisation.
 */
export function useAdminOrganizationLocations(orgId: number) {
  const queryKey = QUERY_KEYS.organizationLocations(orgId);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await adminGetOrganizationLocations(orgId);
      if (!response.success) throw new Error("Failed to fetch locations");
      return response.locations;
    },
    enabled: orgId > 0,
    initialData: () => queryClient.getQueryData<AdminLocation[]>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * Recipient settings for a single organisation.
 */
export function useAdminOrganizationRecipientSettings(orgId: number) {
  const queryKey = QUERY_KEYS.organizationRecipientSettings(orgId);

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await adminGetRecipientSettings(orgId);
      if (!response.success) {
        throw new Error("Failed to fetch recipient settings");
      }
      return response.data;
    },
    enabled: orgId > 0,
    initialData: () =>
      queryClient.getQueryData<AdminRecipientSettingsData>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * All minds (admin list).
 */
export function useAdminMinds() {
  const queryKey = QUERY_KEYS.adminMinds;

  return useQuery({
    queryKey,
    queryFn: async () => {
      // listMinds() already unwraps the response — returns Mind[] directly
      return listMinds();
    },
    initialData: () => queryClient.getQueryData<Mind[]>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * Website projects with pagination & optional status filter.
 */
export function useAdminWebsites(
  params?: FetchWebsitesRequest,
) {
  const queryKey = QUERY_KEYS.adminWebsites(params);

  return useQuery({
    queryKey,
    queryFn: async () => {
      // fetchWebsites returns the full { data, pagination } response
      const response = await fetchWebsites(params);
      if (!response.success) throw new Error("Failed to fetch websites");
      return response;
    },
    initialData: () => queryClient.getQueryData<WebsitesResponse>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * Distinct website statuses for the filter dropdown.
 */
export function useAdminStatuses() {
  const queryKey = QUERY_KEYS.adminStatuses;

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await fetchStatuses();
      if (!response.success) throw new Error("Failed to fetch statuses");
      return response;
    },
    initialData: () => queryClient.getQueryData<StatusesResponse>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * All templates.
 */
export function useAdminTemplates() {
  const queryKey = QUERY_KEYS.adminTemplates;

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await fetchTemplates();
      if (!response.success) throw new Error("Failed to fetch templates");
      return response;
    },
    initialData: () =>
      queryClient.getQueryData<{ success: boolean; data: Template[] }>(
        queryKey,
      ),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

/**
 * Single website project detail (by UUID).
 */
export function useAdminWebsiteDetail(uuid: string | undefined) {
  const queryKey = QUERY_KEYS.adminWebsiteDetail(uuid || "");

  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await fetchWebsiteDetail(uuid!);
      return response.data;
    },
    enabled: !!uuid,
    staleTime: 30 * 1000, // 30 seconds — user expects fresh state during editing
    initialData: () =>
      queryClient.getQueryData<WebsiteProjectWithPages>(queryKey),
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKey)?.dataUpdatedAt,
  });
}

// =====================================================================
// INVALIDATION HOOKS
// =====================================================================

/**
 * Invalidate website detail query.
 */
export function useInvalidateAdminWebsiteDetail() {
  const qc = useQueryClient();

  const invalidate = useCallback(
    (uuid: string) =>
      qc.invalidateQueries({ queryKey: QUERY_KEYS.adminWebsiteDetail(uuid) }),
    [qc],
  );

  const setData = useCallback(
    (uuid: string, data: WebsiteProjectWithPages) =>
      qc.setQueryData(QUERY_KEYS.adminWebsiteDetail(uuid), data),
    [qc],
  );

  return { invalidate, setData };
}

/**
 * Invalidate organisation queries.
 */
export function useInvalidateOrganizations() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(
    () => qc.invalidateQueries({ queryKey: QUERY_KEYS.organizationsAll }),
    [qc],
  );

  const invalidateOne = useCallback(
    (id: number) =>
      qc.invalidateQueries({ queryKey: QUERY_KEYS.organization(id) }),
    [qc],
  );

  return { invalidateAll, invalidateOne };
}

/**
 * Invalidate admin minds list.
 */
export function useInvalidateAdminMinds() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(
    () => qc.invalidateQueries({ queryKey: QUERY_KEYS.adminMinds }),
    [qc],
  );

  return { invalidateAll };
}

/**
 * Invalidate admin websites queries (all param variants).
 */
export function useInvalidateAdminWebsites() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(
    () => qc.invalidateQueries({ queryKey: QUERY_KEYS.adminWebsitesAll }),
    [qc],
  );

  return { invalidateAll };
}

/**
 * Invalidate admin templates query.
 */
export function useInvalidateAdminTemplates() {
  const qc = useQueryClient();

  const invalidateAll = useCallback(
    () => qc.invalidateQueries({ queryKey: QUERY_KEYS.adminTemplates }),
    [qc],
  );

  return { invalidateAll };
}
