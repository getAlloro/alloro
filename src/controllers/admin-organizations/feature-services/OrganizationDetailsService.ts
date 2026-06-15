/**
 * Organization Details Service
 *
 * Read-side assembly for admin organization detail surfaces:
 * - full organization detail (users + connections + linked website)
 * - locations with their Google Properties
 * - org-level business-data sync from the primary location
 *
 * Orchestrates models + sibling services and shapes the response payloads.
 * 404/400 guards throw AdminOrgError so the controller relays them verbatim.
 * All DB access stays in models/.
 */

import {
  OrganizationModel,
  IOrganization,
} from "../../../models/OrganizationModel";
import { OrganizationUserModel } from "../../../models/OrganizationUserModel";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { LocationModel } from "../../../models/LocationModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";
import { ProjectModel } from "../../../models/website-builder/ProjectModel";
import * as ConnectionDetectionService from "./ConnectionDetectionService";
import type { ConnectionDetail } from "./ConnectionDetectionService";
import * as BusinessDataService from "../../locations/BusinessDataService";
import { AdminOrgError } from "../feature-utils/AdminOrgError";

export interface OrganizationUserView {
  id: number;
  name: string | null;
  email: string;
  role: string;
  joined_at: Date | string | null;
  has_password: boolean;
}

export interface OrganizationWebsiteView {
  id: string;
  generated_hostname: unknown;
  status: unknown;
  created_at: Date | string | null;
}

export interface OrganizationDetail {
  organization: IOrganization;
  users: OrganizationUserView[];
  connections: ConnectionDetail[];
  website: OrganizationWebsiteView | null;
}

/**
 * Assemble the full organization detail payload (org + users + connections +
 * linked website). Throws AdminOrgError(404) when the org does not exist.
 */
export async function getOrganizationDetail(
  orgId: number
): Promise<OrganizationDetail> {
  const organization = await OrganizationModel.findById(orgId);
  if (!organization) {
    throw new AdminOrgError(404, { error: "Organization not found" });
  }

  // Fetch users - map to original response shape
  const rawUsers = await OrganizationUserModel.listByOrgWithUsers(orgId);
  const users: OrganizationUserView[] = rawUsers.map((u) => ({
    id: u.user_id,
    name: u.name,
    email: u.email,
    role: u.role,
    joined_at: u.created_at,
    has_password: !!u.password_hash,
  }));

  // Fetch connection details
  const linkedAccounts = await GoogleConnectionModel.findByOrganization(orgId);
  const connections =
    ConnectionDetectionService.formatConnectionDetails(linkedAccounts);

  // Fetch linked website - project only the original fields
  const rawWebsite = await ProjectModel.findByOrganizationId(orgId);
  const website: OrganizationWebsiteView | null = rawWebsite
    ? {
        id: rawWebsite.id,
        generated_hostname: (rawWebsite as any).generated_hostname,
        status: rawWebsite.status,
        created_at: rawWebsite.created_at,
      }
    : null;

  return { organization, users, connections, website };
}

/**
 * Fetch all locations for an organization, each enriched with its Google
 * Properties (fetched in parallel). Throws AdminOrgError(404) when the org
 * does not exist.
 */
export async function getOrganizationLocations(orgId: number): Promise<{
  locations: unknown[];
  total: number;
}> {
  const organization = await OrganizationModel.findById(orgId);
  if (!organization) {
    throw new AdminOrgError(404, { error: "Organization not found" });
  }

  const locations = await LocationModel.findByOrganizationId(orgId);

  const locationsWithProperties = await Promise.all(
    locations.map(async (location) => {
      const properties = await GooglePropertyModel.findByLocationId(location.id);
      return {
        ...location,
        googleProperties: properties,
      };
    })
  );

  return {
    locations: locationsWithProperties,
    total: locationsWithProperties.length,
  };
}

/**
 * Copy the primary location's business_data up to the org-level record.
 * Throws AdminOrgError(400) when the primary location has no business data.
 */
export async function syncOrgBusinessDataFromPrimary(
  orgId: number
): Promise<Record<string, unknown>> {
  const locations = await LocationModel.findByOrganizationId(orgId);
  const primary = locations.find((l) => l.is_primary) || locations[0];

  if (!primary?.business_data) {
    throw new AdminOrgError(400, {
      error:
        "Primary location has no business data. Refresh the location first.",
    });
  }

  const synced = await BusinessDataService.updateOrgBusinessData(
    orgId,
    primary.business_data as Record<string, unknown>
  );

  return synced;
}
