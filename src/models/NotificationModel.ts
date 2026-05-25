import { BaseModel, QueryContext } from "./BaseModel";

export interface INotification {
  id: number;
  organization_id: number | null;
  location_id: number | null;
  title: string;
  message: string | null;
  type: "task" | "pms" | "agent" | "system" | "ranking";
  read: boolean;
  read_timestamp: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export class NotificationModel extends BaseModel {
  protected static tableName = "notifications";
  protected static jsonFields = ["metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<INotification | undefined> {
    return super.findById(id, trx);
  }

  static async create(
    data: Partial<INotification>,
    trx?: QueryContext
  ): Promise<number> {
    const serialized = this.serializeJsonFields({
      ...data,
      read: false,
      created_at: new Date(),
      updated_at: new Date(),
    });
    const [result] = await this.table(trx).insert(serialized).returning("id");
    return typeof result === "object" ? result.id : result;
  }

  static async markRead(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      read: true,
      read_timestamp: new Date(),
      updated_at: new Date(),
    });
  }

  static async deleteById(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).del();
  }

  /**
   * Find notifications for an organization, optionally filtered by location.
   */
  static async findByOrganization(
    organizationId: number,
    options?: {
      locationId?: number | null;
      accessibleLocationIds?: number[];
      limit?: number;
    },
    trx?: QueryContext
  ): Promise<INotification[]> {
    const limit = options?.limit || 10;
    let query = this.table(trx)
      .where("organization_id", organizationId)
      .orderBy("created_at", "desc")
      .limit(limit);

    if (options?.locationId) {
      query = query.where("location_id", options.locationId);
    } else if (options?.accessibleLocationIds && options.accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", options!.accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    const rows = await query.select("*");
    return rows.map((row: INotification) => this.deserializeJsonFields(row));
  }

  /**
   * Count unread notifications for an organization.
   */
  static async countUnreadByOrganization(
    organizationId: number,
    options?: {
      locationId?: number | null;
      accessibleLocationIds?: number[];
    },
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx)
      .where({ organization_id: organizationId, read: false });

    if (options?.locationId) {
      query = query.where(function () {
        this.where("location_id", options.locationId!).orWhereNull("location_id");
      });
    } else if (options?.accessibleLocationIds && options.accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", options!.accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    const result = await query.count("* as count").first();
    return parseInt(result?.count as string, 10) || 0;
  }

  /**
   * Mark all notifications as read for an organization.
   */
  static async markAllReadByOrganization(
    organizationId: number,
    options?: {
      locationId?: number | null;
      accessibleLocationIds?: number[];
    },
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx)
      .where({ organization_id: organizationId, read: false });

    if (options?.locationId) {
      query = query.where(function () {
        this.where("location_id", options.locationId!).orWhereNull("location_id");
      });
    } else if (options?.accessibleLocationIds && options.accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", options!.accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    return query.update({
      read: true,
      read_timestamp: new Date(),
      updated_at: new Date(),
    });
  }

  /**
   * Delete all notifications for an organization.
   */
  static async deleteAllByOrganization(
    organizationId: number,
    options?: {
      locationId?: number | null;
      accessibleLocationIds?: number[];
    },
    trx?: QueryContext
  ): Promise<number> {
    let query = this.table(trx)
      .where({ organization_id: organizationId });

    if (options?.locationId) {
      query = query.where(function () {
        this.where("location_id", options.locationId!).orWhereNull("location_id");
      });
    } else if (options?.accessibleLocationIds && options.accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", options!.accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    return query.del();
  }

  /**
   * List notifications for admin with org + location filters.
   */
  static async listAdmin(
    filters: {
      organization_id: number;
      location_id?: number;
      limit?: number;
      offset?: number;
    },
    trx?: QueryContext
  ): Promise<{ notifications: INotification[]; total: number }> {
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;

    let baseQuery = this.table(trx)
      .where("notifications.organization_id", filters.organization_id);

    if (filters.location_id) {
      baseQuery = baseQuery.where("notifications.location_id", filters.location_id);
    }

    const countResult = await baseQuery.clone().count("* as count").first();
    const total = parseInt(countResult?.count as string, 10) || 0;

    const rows = await baseQuery
      .clone()
      .leftJoin("locations", "notifications.location_id", "locations.id")
      .select("notifications.*", "locations.name as location_name")
      .orderBy("notifications.created_at", "desc")
      .limit(limit)
      .offset(offset);

    const notifications = rows.map((row: INotification) => this.deserializeJsonFields(row));
    return { notifications, total };
  }

  /**
   * Find notification by ID and verify organization ownership.
   */
  static async findByIdAndOrganization(
    id: number,
    organizationId: number,
    trx?: QueryContext
  ): Promise<INotification | undefined> {
    const row = await this.table(trx)
      .where({ id, organization_id: organizationId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }
}
