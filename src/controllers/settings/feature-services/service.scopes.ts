import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { parseScopes, buildScopeStatus, getMissingScopes } from "../feature-utils/util.scope-parser";
import { getIntegrationForOrganization } from "../../admin-websites/feature-services/service.gsc-integration";

/**
 * An active, admin-managed Search Console integration (a website_integrations
 * row with connectionOwner=admin) provides GSC data for the org even when the
 * org's own Google connection lacks the webmasters scope. Returns true when
 * such an integration exists so the settings UI doesn't request access an
 * admin already granted. Org-owned active integrations are intentionally NOT
 * honored here — those imply the org's connection already carries the scope,
 * and if it later loses it we want the request to resurface.
 */
async function hasActiveAdminGscIntegration(organizationId: number): Promise<boolean> {
  try {
    const integration = await getIntegrationForOrganization(organizationId);
    return (
      !!integration &&
      integration.status === "active" &&
      integration.metadata?.connectionOwner === "admin"
    );
  } catch {
    // No website project / not linked, or website-builder lookup failed —
    // never let it break the scopes endpoint; fall back to scope-only result.
    return false;
  }
}

export async function getGrantedScopes(organizationId: number) {
  if (!organizationId) {
    const error = new Error("Missing organization ID") as any;
    error.statusCode = 400;
    error.body = { error: "Missing organization ID" };
    throw error;
  }

  const googleConnections = await GoogleConnectionModel.findByOrganization(organizationId);

  if (googleConnections.length === 0) {
    const error = new Error("Account not found") as any;
    error.statusCode = 404;
    error.body = { error: "Account not found" };
    throw error;
  }

  const normalizedScopes = Array.from(
    new Set(
      googleConnections.flatMap((connection) => parseScopes(connection.scopes)),
    ),
  );

  const scopeStatus = buildScopeStatus(normalizedScopes);
  let missingScopes = getMissingScopes(scopeStatus);

  // Honor an admin-managed GSC integration as a satisfied GSC scope.
  if (missingScopes.includes("gsc") && (await hasActiveAdminGscIntegration(organizationId))) {
    scopeStatus.gsc.granted = true;
    missingScopes = getMissingScopes(scopeStatus);
  }

  return {
    scopes: scopeStatus,
    missingCount: missingScopes.length,
    missingScopes,
    allGranted: missingScopes.length === 0,
  };
}
