import { OrganizationModel, IOrganization } from "../models/OrganizationModel";
import { QueryContext } from "../models/BaseModel";

export class OrganizationArchivedError extends Error {
  statusCode = 423;
  code = "ORGANIZATION_ARCHIVED";

  constructor(
    public readonly organizationId: number,
    message = "Organization is archived"
  ) {
    super(message);
    this.name = "OrganizationArchivedError";
  }
}

export class OrganizationNotFoundError extends Error {
  statusCode = 404;
  code = "ORGANIZATION_NOT_FOUND";

  constructor(public readonly organizationId: number) {
    super("Organization not found");
    this.name = "OrganizationNotFoundError";
  }
}

export function getOrganizationLifecycleErrorStatus(error: unknown): number | null {
  if (
    error instanceof OrganizationArchivedError ||
    error instanceof OrganizationNotFoundError
  ) {
    return error.statusCode;
  }

  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
  ) {
    return (error as { statusCode: number }).statusCode;
  }

  return null;
}

export class OrganizationLifecycleService {
  static isArchived(organization: Pick<IOrganization, "archived_at"> | null | undefined): boolean {
    return Boolean(organization?.archived_at);
  }

  static async assertActive(
    organizationId: number,
    trx?: QueryContext
  ): Promise<IOrganization> {
    const organization = await OrganizationModel.findById(organizationId, trx);

    if (!organization) {
      throw new OrganizationNotFoundError(organizationId);
    }

    if (organization.archived_at) {
      throw new OrganizationArchivedError(organizationId);
    }

    return organization;
  }
}
