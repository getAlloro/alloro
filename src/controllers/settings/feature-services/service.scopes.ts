import { GoogleConnectionModel } from "../../../models/GoogleConnectionModel";
import { parseScopes, buildScopeStatus, getMissingScopes } from "../feature-utils/util.scope-parser";

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
  const missingScopes = getMissingScopes(scopeStatus);

  return {
    scopes: scopeStatus,
    missingCount: missingScopes.length,
    missingScopes,
    allGranted: missingScopes.length === 0,
  };
}
