import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

/**
 * Scope fragment that marks a connection as GBP-capable. Initial signup and
 * GBP connect flows always request business.manage (OAuthFlowService
 * REQUIRED_SCOPES); auxiliary connections (e.g. GSC-only admin overrides)
 * never carry it.
 */
const GBP_SCOPE_FRAGMENT = "business.manage";

export interface IGoogleConnection {
  id: number;
  google_user_id: string;
  email: string;
  refresh_token: string;
  access_token: string | null;
  token_type: string | null;
  expiry_date: Date | null;
  scopes: string | null;
  organization_id: number;
  google_property_ids: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class GoogleConnectionModel extends BaseModel {
  protected static tableName = "google_connections";
  protected static jsonFields = ["google_property_ids"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    return super.findById(id, trx);
  }

  /**
   * Find a connection by id, returned as the raw DB row (no JSON
   * deserialization). Matches callers that consumed the original
   * db("google_connections").where({ id }).first() result directly and parse
   * google_property_ids themselves.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawById(id: number, trx?: QueryContext): Promise<any> {
    return this.table(trx).where({ id }).first();
  }

  /**
   * First connection for an organization, returned as the raw DB row (no JSON
   * deserialization). Matches the OAuth helper, which consumed the original
   * db("google_connections").where({ organization_id }).first() result
   * directly (reads id/refresh_token/access_token/expiry_date). No scope/order
   * constraints — distinct from findOneByOrganization.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findRawByOrganization(
    organizationId: number,
    trx?: QueryContext
  ): Promise<any> {
    return this.table(trx).where({ organization_id: organizationId }).first();
  }

  /**
   * Find a single connection by id joined to its organization, projecting the
   * full connection row plus org domain/name/archived_at. Mirrors the inline
   * monthly-agents-run account fetch (leftJoin organizations, select gc.*,
   * o.domain as domain_name, o.name as practice_name, o.archived_at as
   * org_archived_at). Returned raw to preserve original consumption.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findByIdWithOrganizationDetails(
    id: number,
    trx?: QueryContext
  ): Promise<any> {
    return (trx || db)("google_connections as gc")
      .leftJoin("organizations as o", "gc.organization_id", "o.id")
      .where("gc.id", id)
      .select(
        "gc.*",
        "o.domain as domain_name",
        "o.name as practice_name",
        "o.archived_at as org_archived_at"
      )
      .first();
  }

  /**
   * All onboarded connections joined to their organization, projecting the
   * full connection row plus org domain/name. Mirrors the inline
   * gbp-optimizer / process-all account list (join organizations, where
   * o.onboarding_completed = true, select gc.*, o.domain as domain_name,
   * o.name as practice_name). Note: no archived filter and no ordering, to
   * match the original queries exactly.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOnboardedConnectionsWithOrganization(
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("google_connections as gc")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("o.onboarding_completed", true)
      .select("gc.*", "o.domain as domain_name", "o.name as practice_name");
  }

  /**
   * Onboarded clients for the tasks-creation dropdown: (gc.id, o.domain as
   * domain_name, gc.email), ordered by domain asc. Mirrors the inline
   * TasksController.getClients query verbatim (no archived filter).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOnboardedClientsForTasks(
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("google_connections as gc")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("o.onboarding_completed", true)
      .select("gc.id", "o.domain as domain_name", "gc.email")
      .orderBy("o.domain", "asc");
  }

  /**
   * All onboarded, non-archived connections joined to their organization,
   * projecting the full connection row plus org domain/name. Mirrors the
   * inline proofline account list (join organizations, where
   * o.onboarding_completed = true, whereNull o.archived_at, select gc.*,
   * o.domain as domain_name, o.name as practice_name).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOnboardedActiveConnectionsWithOrganization(
    trx?: QueryContext
  ): Promise<any[]> {
    return (trx || db)("google_connections as gc")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("o.onboarding_completed", true)
      .whereNull("o.archived_at")
      .select("gc.*", "o.domain as domain_name", "o.name as practice_name");
  }

  /**
   * Find a connection by Google user ID.
   * The user_id column was dropped in migration 20260221000004.
   * Looks up by google_user_id only; optionally narrows by organization_id.
   */
  static async findByGoogleUserId(
    googleUserId: string,
    organizationId?: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const query = this.table(trx).where({ google_user_id: googleUserId });

    if (organizationId) {
      query.andWhere({ organization_id: organizationId });
    }

    const row = await query.first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByGoogleUserIdForOrganization(
    googleUserId: string,
    organizationId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    return this.findByGoogleUserId(googleUserId, organizationId, trx);
  }

  static async findByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const rows = await this.table(trx)
      .where({ organization_id: orgId });
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  /**
   * First Google connection for an org with no scope/order constraints,
   * returned as a raw row (untyped) to match the original untyped
   * `db(...).first()` consumption — the notification helper reads columns
   * (practice_name, domain_name) beyond IGoogleConnection. Mirrors the plain
   * inline lookup in utils/core/notificationHelper.createNotification verbatim
   * — distinct from findOneByOrganization, which additionally filters on GBP
   * scope and orders.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findFirstByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<any> {
    const row = await this.table(trx)
      .where({ organization_id: orgId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * The organization's primary Google connection — the GBP-capable row.
   * Auxiliary connections (GSC-only harvest accounts, admin overrides) are
   * excluded so they never leak into onboarding status, locations, PMS, or
   * recipient resolution. Must order rather than require google_property_ids:
   * during onboarding the primary connection exists before property ids are
   * saved (GbpOnboardingService.saveGBPSelection).
   */
  static async findOneByOrganization(
    orgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx)
      .where({ organization_id: orgId })
      .andWhere("scopes", "ilike", `%${GBP_SCOPE_FRAGMENT}%`)
      .orderByRaw("(google_property_ids is not null) desc, id asc")
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findByIdForOrganization(
    id: number,
    orgId: number,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx)
      .where({ id, organization_id: orgId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async create(
    data: Partial<IGoogleConnection>,
    trx?: QueryContext
  ): Promise<IGoogleConnection> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<IGoogleConnection>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async updatePropertyIds(
    id: number,
    propertyIds: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(
      id,
      { google_property_ids: propertyIds } as Record<string, unknown>,
      trx
    );
  }

  static async updateTokens(
    id: number,
    tokens: {
      access_token: string;
      refresh_token?: string;
      token_type?: string;
      expiry_date?: Date;
      scopes?: string;
    },
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, tokens as Record<string, unknown>, trx);
  }

  static async findByOrgWithScope(
    orgId: number,
    scopeSubstring: string,
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const rows = await this.table(trx)
      .where({ organization_id: orgId })
      .andWhere("scopes", "ilike", `%${scopeSubstring}%`);
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  static async findByEmailsWithScope(
    emails: string[],
    scopeSubstring: string,
    trx?: QueryContext
  ): Promise<IGoogleConnection[]> {
    const normalizedEmails = emails
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (normalizedEmails.length === 0) return [];

    const rows = await this.table(trx)
      .whereIn("email", normalizedEmails)
      .andWhere("scopes", "ilike", `%${scopeSubstring}%`);
    return rows.map((row: IGoogleConnection) =>
      this.deserializeJsonFields(row)
    );
  }

  /**
   * Generic findOne for arbitrary where clauses.
   */
  static async findOne(
    where: Record<string, unknown>,
    trx?: QueryContext
  ): Promise<IGoogleConnection | undefined> {
    const row = await this.table(trx).where(where).first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * A connection joined to its organization for the ranking trigger flow:
   * returns the connection's property ids plus org domain/name/archived_at,
   * so the handler can validate the account and resolve the org domain in a
   * single query. Raw projection (caller parses google_property_ids).
   */
  static async findWithOrganizationForTrigger(
    connectionId: number,
    trx?: QueryContext
  ): Promise<
    | {
        id: number;
        organization_id: number;
        google_property_ids: unknown;
        org_domain: string | null;
        org_name: string | null;
        org_archived_at: Date | null;
      }
    | undefined
  > {
    return (trx || db)("google_connections as gc")
      .leftJoin("organizations as o", "gc.organization_id", "o.id")
      .where("gc.id", connectionId)
      .select(
        "gc.id",
        "gc.organization_id",
        "gc.google_property_ids",
        "o.domain as org_domain",
        "o.name as org_name",
        "o.archived_at as org_archived_at"
      )
      .first();
  }

  /**
   * All onboarded, non-archived organizations' GBP-capable connections,
   * projected for the ranking "accounts" list (connection id +
   * google_property_ids, org name/domain), ordered by org name ascending.
   */
  static async findOnboardedAccountsWithOrganization(
    trx?: QueryContext
  ): Promise<
    Array<{
      id: number;
      google_property_ids: unknown;
      org_name: string | null;
      org_domain: string | null;
    }>
  > {
    return (trx || db)("google_connections as gc")
      .join("organizations as o", "gc.organization_id", "o.id")
      .where("o.onboarding_completed", true)
      .whereNull("o.archived_at")
      .select(
        "gc.id",
        "gc.google_property_ids",
        "o.name as org_name",
        "o.domain as org_domain"
      )
      .orderBy("o.name", "asc");
  }

  /**
   * Onboarded, non-archived org/connection pairs for the ranking batch setup,
   * optionally narrowed to a single connection id. Mirrors the inline ranking
   * executor query (organizations join google_connections, where
   * o.onboarding_completed = true, whereNull o.archived_at, optional
   * gc.id filter, select o.id as organization_id, o.name as org_name,
   * o.domain, gc.id as connection_id).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findOnboardedOrgConnectionsForRanking(
    connectionIdFilter?: number,
    trx?: QueryContext
  ): Promise<any[]> {
    let query = (trx || db)("organizations as o")
      .join("google_connections as gc", "gc.organization_id", "o.id")
      .where("o.onboarding_completed", true)
      .whereNull("o.archived_at")
      .select(
        "o.id as organization_id",
        "o.name as org_name",
        "o.domain",
        "gc.id as connection_id"
      );

    if (connectionIdFilter) {
      query = query.where("gc.id", connectionIdFilter);
    }

    return query;
  }
}
