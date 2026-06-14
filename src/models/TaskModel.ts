import { Knex } from "knex";
import { BaseModel, PaginatedResult, PaginationParams, QueryContext } from "./BaseModel";

export interface ITask {
  id: number;
  organization_id: number | null;
  location_id: number | null;
  title: string;
  description: string | null;
  category: "ALLORO" | "USER";
  agent_type: string | null;
  status: "pending" | "in_progress" | "complete" | "archived";
  is_approved: boolean;
  created_by_admin: boolean;
  due_date: Date | null;
  completed_at: Date | null;
  metadata: Record<string, unknown> | null;
  created_at: Date;
  updated_at: Date;
}

export interface TaskAdminFilters {
  organization_id?: number;
  location_id?: number;
  status?: string;
  category?: string;
  agent_type?: string;
  is_approved?: boolean;
  date_from?: string;
  date_to?: string;
}

export class TaskModel extends BaseModel {
  protected static tableName = "tasks";
  protected static jsonFields = ["metadata"];

  static async findById(
    id: number,
    trx?: QueryContext
  ): Promise<ITask | undefined> {
    return super.findById(id, trx);
  }

  static async findByMetadataField(
    field: string,
    value: string,
    trx?: QueryContext
  ): Promise<ITask[]> {
    const rows = await this.table(trx)
      .whereRaw(`metadata::jsonb->>'${field}' = ?`, [value]);
    return rows.map((row: ITask) => this.deserializeJsonFields(row));
  }

  static async create(
    data: Partial<ITask>,
    trx?: QueryContext
  ): Promise<ITask> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async updateById(
    id: number,
    data: Partial<ITask>,
    trx?: QueryContext
  ): Promise<number> {
    return super.updateById(id, data as Record<string, unknown>, trx);
  }

  static async markComplete(
    id: number,
    trx?: QueryContext
  ): Promise<ITask | undefined> {
    const now = new Date();
    await this.table(trx).where({ id }).update({
      status: "complete",
      completed_at: now,
      updated_at: now,
    });
    return this.findById(id, trx);
  }

  static async findUserTasksForApproval(
    taskIds: number[],
    trx?: QueryContext
  ): Promise<Array<{ organization_id: number | null }>> {
    return this.table(trx)
      .whereIn("id", taskIds)
      .where("is_approved", false)
      .where("category", "USER")
      .select("organization_id");
  }

  static async archive(
    id: number,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({
      status: "archived",
      updated_at: new Date(),
    });
  }

  static async bulkArchive(
    ids: number[],
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).update({
      status: "archived",
      updated_at: new Date(),
    });
  }

  static async bulkUpdateStatus(
    ids: number[],
    status: string,
    trx?: QueryContext
  ): Promise<number> {
    const updateData: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (status === "complete") {
      updateData.completed_at = new Date();
    }
    return this.table(trx).whereIn("id", ids).update(updateData);
  }

  static async bulkUpdateApproval(
    ids: number[],
    isApproved: boolean,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).whereIn("id", ids).update({
      is_approved: isApproved,
      updated_at: new Date(),
    });
  }

  static async bulkInsert(
    tasks: Partial<ITask>[],
    trx?: QueryContext
  ): Promise<void> {
    const serialized = tasks.map((task) =>
      this.serializeJsonFields({
        ...task,
        created_at: new Date(),
        updated_at: new Date(),
      })
    );
    await this.table(trx).insert(serialized);
  }

  static async listAdmin(
    filters: TaskAdminFilters,
    pagination: PaginationParams,
    trx?: QueryContext
  ): Promise<PaginatedResult<ITask>> {
    const buildQuery = (qb: Knex.QueryBuilder) => {
      qb = qb
        .leftJoin("locations", "tasks.location_id", "locations.id")
        .select("tasks.*", "locations.name as location_name");
      if (filters.organization_id) {
        qb = qb.where("tasks.organization_id", filters.organization_id);
      }
      if (filters.location_id) {
        qb = qb.where("tasks.location_id", filters.location_id);
      }
      if (filters.status) {
        qb = qb.where("tasks.status", filters.status);
      } else {
        qb = qb.whereNot("tasks.status", "archived");
      }
      if (filters.category) {
        qb = qb.where("tasks.category", filters.category);
      }
      if (filters.agent_type) {
        qb = qb.where("tasks.agent_type", filters.agent_type);
      }
      if (filters.is_approved !== undefined) {
        qb = qb.where("tasks.is_approved", filters.is_approved);
      }
      if (filters.date_from) {
        qb = qb.where("tasks.created_at", ">=", filters.date_from);
      }
      if (filters.date_to) {
        qb = qb.where("tasks.created_at", "<=", filters.date_to);
      }
      return qb.orderBy("tasks.created_at", "desc");
    };

    return this.paginate<ITask>(buildQuery, pagination, trx);
  }

  /**
   * Find approved tasks for an organization, optionally filtered by location.
   * Excludes archived tasks.
   */
  static async findByOrganizationApproved(
    organizationId: number,
    options?: {
      locationId?: number | null;
      accessibleLocationIds?: number[];
    },
    trx?: QueryContext
  ): Promise<ITask[]> {
    let query = this.table(trx)
      .where({ organization_id: organizationId, is_approved: true })
      .whereNot("status", "archived")
      .orderBy("created_at", "desc");

    if (options?.locationId) {
      query = query.where("location_id", options.locationId);
    } else if (options?.accessibleLocationIds && options.accessibleLocationIds.length > 0) {
      query = query.where(function () {
        this.whereIn("location_id", options!.accessibleLocationIds!).orWhereNull("location_id");
      });
    }

    const rows = await query.select("*");
    return rows.map((row: ITask) => this.deserializeJsonFields(row));
  }

  /**
   * Find a task by ID and verify organization ownership.
   */
  static async findByIdAndOrganization(
    id: number,
    organizationId: number,
    trx?: QueryContext
  ): Promise<ITask | undefined> {
    const row = await this.table(trx)
      .where({ id, organization_id: organizationId })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  /**
   * Approved, non-archived RANKING-agent tasks tied to a specific practice
   * ranking id (matched on metadata->>'practice_ranking_id'), oldest-first.
   * Raw rows (caller's formatter parses metadata).
   */
  static async findApprovedRankingTasksForRanking(
    practiceRankingId: string,
    trx?: QueryContext
  ): Promise<ITask[]> {
    return this.table(trx)
      .where({
        agent_type: "RANKING",
        is_approved: true,
      })
      .whereRaw("metadata::jsonb->>'practice_ranking_id' = ?", [
        practiceRankingId,
      ])
      .whereNot({ status: "archived" })
      .orderBy("created_at", "asc")
      .select("*");
  }

  /**
   * All approved, non-archived RANKING-agent tasks for an organization
   * (across locations), oldest-first. Raw rows.
   */
  static async findApprovedRankingTasksForOrganization(
    organizationId: number,
    trx?: QueryContext
  ): Promise<ITask[]> {
    return this.table(trx)
      .where({
        organization_id: organizationId,
        agent_type: "RANKING",
        is_approved: true,
      })
      .whereNot({ status: "archived" })
      .orderBy("created_at", "asc")
      .select("*");
  }
}
