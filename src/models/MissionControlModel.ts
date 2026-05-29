import { db } from "../database/connection";

export type MissionControlSubscriptionStatus =
  | "active"
  | "inactive"
  | "trial"
  | "cancelled";

export interface MissionControlOrgBase {
  id: number;
  name: string;
  domain: string | null;
  organization_type: "health" | "saas" | null;
  subscription_tier: "DWY" | "DFY" | null;
  subscription_status: MissionControlSubscriptionStatus;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  billing_quantity_override: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface MissionControlProjectSummary {
  status: string | null;
  generated_hostname: string | null;
  custom_domain: string | null;
  updated_at: Date | null;
}

export interface MissionControlPmsSummary {
  id: number;
  status: string;
  timestamp: Date;
  is_client_approved: boolean;
}

export interface MissionControlRankingSummary {
  id: number;
  status: string;
  rank_score: number | null;
  search_position: number | null;
  created_at: Date;
}

export interface MissionControlAdminUserSummary {
  id: number;
  organization_id: number;
  name: string | null;
  email: string;
  role: "admin";
}

export interface MissionControlBaseData {
  organizations: MissionControlOrgBase[];
  userCounts: Record<number, number>;
  adminUsers: Record<number, MissionControlAdminUserSummary[]>;
  locationCounts: Record<number, number>;
  gbpConnections: Record<number, boolean>;
  websites: Record<number, MissionControlProjectSummary>;
  pendingTaskCounts: Record<number, number>;
  unreadNotificationCounts: Record<number, number>;
  latestPms: Record<number, MissionControlPmsSummary>;
  latestRankings: Record<number, MissionControlRankingSummary>;
}

export class MissionControlModel {
  static async getBaseData(): Promise<MissionControlBaseData> {
    const [
      organizations,
      userCounts,
      adminUsers,
      locationCounts,
      gbpConnections,
      websites,
      pendingTaskCounts,
      unreadNotificationCounts,
      latestPms,
      latestRankings,
    ] = await Promise.all([
      this.listOrganizations(),
      this.countByOrganization("organization_users"),
      this.getAdminUsersByOrganization(),
      this.countByOrganization("locations"),
      this.getGbpConnections(),
      this.getLatestWebsiteSummaries(),
      this.getPendingTaskCounts(),
      this.getUnreadNotificationCounts(),
      this.getLatestPmsSummaries(),
      this.getLatestRankingSummaries(),
    ]);

    return {
      organizations,
      userCounts,
      adminUsers,
      locationCounts,
      gbpConnections,
      websites,
      pendingTaskCounts,
      unreadNotificationCounts,
      latestPms,
      latestRankings,
    };
  }

  private static async listOrganizations(): Promise<MissionControlOrgBase[]> {
    const rows = await db("organizations")
      .select(
        "id",
        "name",
        "domain",
        "organization_type",
        "subscription_tier",
        "subscription_status",
        "stripe_customer_id",
        "stripe_subscription_id",
        "stripe_price_id",
        "billing_quantity_override",
        "created_at",
        "updated_at",
      )
      .orderBy("created_at", "desc");

    return rows.filter((org) => !isSandboxOrganization(org.name));
  }

  private static async countByOrganization(
    tableName: string,
  ): Promise<Record<number, number>> {
    const rows = await db(tableName)
      .select("organization_id")
      .whereNotNull("organization_id")
      .count<{ organization_id: number; count: string | number }[]>("* as count")
      .groupBy("organization_id");

    return rowsToCountMap(rows);
  }

  private static async getGbpConnections(): Promise<Record<number, boolean>> {
    const rows = await db("google_connections")
      .select("organization_id")
      .whereNotNull("organization_id")
      .count<{ organization_id: number; count: string | number }[]>("* as count")
      .groupBy("organization_id");

    return Object.fromEntries(
      rows.map((row) => [Number(row.organization_id), Number(row.count) > 0]),
    );
  }

  private static async getAdminUsersByOrganization(): Promise<
    Record<number, MissionControlAdminUserSummary[]>
  > {
    const rows = await db("organization_users")
      .join("users", "organization_users.user_id", "users.id")
      .select(
        "users.id",
        "users.name",
        "users.email",
        "organization_users.organization_id",
        "organization_users.role",
      )
      .where("organization_users.role", "admin")
      .orderBy("organization_users.organization_id", "asc")
      .orderBy("users.name", "asc");

    const usersByOrg: Record<number, MissionControlAdminUserSummary[]> = {};
    for (const row of rows) {
      const orgId = Number(row.organization_id);
      if (!usersByOrg[orgId]) usersByOrg[orgId] = [];
      usersByOrg[orgId].push({
        id: Number(row.id),
        organization_id: orgId,
        name: row.name ?? null,
        email: row.email,
        role: "admin",
      });
    }
    return usersByOrg;
  }

  private static async getLatestWebsiteSummaries(): Promise<
    Record<number, MissionControlProjectSummary>
  > {
    const rows = await db("website_builder.projects")
      .select(
        "organization_id",
        "status",
        "generated_hostname",
        "custom_domain",
        "updated_at",
      )
      .whereNotNull("organization_id")
      .orderBy("organization_id", "asc")
      .orderBy("updated_at", "desc");

    const summaries: Record<number, MissionControlProjectSummary> = {};
    for (const row of rows) {
      const orgId = Number(row.organization_id);
      if (summaries[orgId]) continue;
      summaries[orgId] = {
        status: row.status ?? null,
        generated_hostname: row.generated_hostname ?? null,
        custom_domain: row.custom_domain ?? null,
        updated_at: row.updated_at ?? null,
      };
    }
    return summaries;
  }

  private static async getPendingTaskCounts(): Promise<Record<number, number>> {
    const rows = await db("tasks")
      .select("organization_id")
      .whereNotNull("organization_id")
      .whereIn("status", ["pending", "in_progress"])
      .count<{ organization_id: number; count: string | number }[]>("* as count")
      .groupBy("organization_id");

    return rowsToCountMap(rows);
  }

  private static async getUnreadNotificationCounts(): Promise<
    Record<number, number>
  > {
    const rows = await db("notifications")
      .select("organization_id")
      .whereNotNull("organization_id")
      .where({ read: false })
      .count<{ organization_id: number; count: string | number }[]>("* as count")
      .groupBy("organization_id");

    return rowsToCountMap(rows);
  }

  private static async getLatestPmsSummaries(): Promise<
    Record<number, MissionControlPmsSummary>
  > {
    const rows = await db("pms_jobs")
      .select(
        "organization_id",
        "id",
        "status",
        "timestamp",
        "is_client_approved",
      )
      .whereNotNull("organization_id")
      .where("is_approved", true)
      .orderBy("organization_id", "asc")
      .orderBy("timestamp", "desc");

    const summaries: Record<number, MissionControlPmsSummary> = {};
    for (const row of rows) {
      const orgId = Number(row.organization_id);
      if (summaries[orgId]) continue;
      summaries[orgId] = {
        id: Number(row.id),
        status: row.status,
        timestamp: row.timestamp,
        is_client_approved:
          row.is_client_approved === true || row.is_client_approved === 1,
      };
    }
    return summaries;
  }

  private static async getLatestRankingSummaries(): Promise<
    Record<number, MissionControlRankingSummary>
  > {
    const rows = await db("practice_rankings")
      .select(
        "organization_id",
        "id",
        "status",
        "rank_score",
        "search_position",
        "created_at",
      )
      .whereNotNull("organization_id")
      .orderBy("organization_id", "asc")
      .orderBy("created_at", "desc");

    const summaries: Record<number, MissionControlRankingSummary> = {};
    for (const row of rows) {
      const orgId = Number(row.organization_id);
      if (summaries[orgId]) continue;
      summaries[orgId] = {
        id: Number(row.id),
        status: row.status,
        rank_score: row.rank_score === null ? null : Number(row.rank_score),
        search_position:
          row.search_position === null ? null : Number(row.search_position),
        created_at: row.created_at,
      };
    }
    return summaries;
  }
}

function rowsToCountMap(
  rows: Array<{ organization_id: number; count: string | number }>,
): Record<number, number> {
  return Object.fromEntries(
    rows.map((row) => [Number(row.organization_id), Number(row.count) || 0]),
  );
}

function isSandboxOrganization(name: string): boolean {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
  const compact = normalized.replace(/\s+/g, "");
  return (
    normalized === "test" ||
    compact === "hamiltonwise'sorganization" ||
    compact === "alloroteam'sorganization"
  );
}
