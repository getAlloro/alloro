import { mybusinessaccountmanagement_v1 } from "@googleapis/mybusinessaccountmanagement";
import { mybusinessbusinessinformation_v1 } from "@googleapis/mybusinessbusinessinformation";
import { OAuth2Client } from "google-auth-library";
import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { GooglePropertyModel } from "../../../models/GooglePropertyModel";

export async function fetchAvailableGBPProperties(
  oauth2Client: OAuth2Client
): Promise<any[]> {
  const accountManagement =
    new mybusinessaccountmanagement_v1.Mybusinessaccountmanagement({
      auth: oauth2Client,
    });

  const businessInfo =
    new mybusinessbusinessinformation_v1.Mybusinessbusinessinformation({
      auth: oauth2Client,
    });

  const accountsResp = await accountManagement.accounts.list();
  const accounts = accountsResp.data.accounts || [];

  const availableProperties: any[] = [];
  for (const account of accounts) {
    if (account.name) {
      const locationsResp = await businessInfo.accounts.locations.list({
        parent: account.name,
        readMask: "name,title,storeCode,metadata",
      });

      const locations = locationsResp.data.locations || [];
      locations.forEach((loc) => {
        availableProperties.push({
          id: loc.name,
          name: loc.title,
          accountId: account.name?.split("/")[1],
          locationId: loc.name?.split("/")[1],
          address: loc.storeCode,
        });
      });
    }
  }

  return availableProperties;
}

export async function getAvailablePropertiesByType(
  type: string,
  oauth2Client: OAuth2Client,
  options?: { excludeLinkedForOrganizationId?: number }
): Promise<any[]> {
  if (type === "gbp") {
    const properties = await fetchAvailableGBPProperties(oauth2Client);

    // Hide GBP profiles that already back one of the org's locations: the
    // (google_connection_id, external_id) unique index forbids linking the
    // same profile twice, so offering it in the picker only invites a clash.
    const orgId = options?.excludeLinkedForOrganizationId;
    if (orgId) {
      const connection =
        await GoogleConnectionModel.findOneByOrganization(orgId);
      if (connection) {
        const linked = await GooglePropertyModel.findByConnectionId(
          connection.id
        );
        const linkedExternalIds = new Set(linked.map((p) => p.external_id));
        return properties.filter(
          (p) => !p.locationId || !linkedExternalIds.has(p.locationId)
        );
      }
    }
    return properties;
  }

  const error = new Error("Invalid property type") as any;
  error.statusCode = 400;
  error.body = { error: "Invalid property type" };
  throw error;
}
