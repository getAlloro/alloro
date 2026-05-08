import { Knex } from "knex";
import { db } from "../database/connection";
import { BaseModel, PaginatedResult, QueryContext } from "./BaseModel";

export type SupportTicketType =
  | "bug_report"
  | "feature_request"
  | "website_edit";

export type SupportTicketStatus =
  | "new"
  | "triaged"
  | "in_progress"
  | "waiting_on_client"
  | "resolved"
  | "wont_fix"
  | "archived";

export type SupportTicketSeverity = "low" | "medium" | "high";
export type SupportTicketPriority = "p0" | "p1" | "p2" | "p3";

export interface SupportTicket {
  id: string;
  public_id: string;
  organization_id: number;
  location_id: number | null;
  created_by_user_id: number | null;
  assigned_to_user_id: number | null;
  type: SupportTicketType;
  status: SupportTicketStatus;
  severity: SupportTicketSeverity;
  priority: SupportTicketPriority;
  /** Deprecated. Category was removed from the support product surface. */
  category: string | null;
  target_sprint: string | null;
  title: string;
  current_page_url: string | null;
  requested_completion_date: string | null;
  guided_answers: Record<string, unknown>;
  internal_notes: string | null;
  resolution_notes: string | null;
  ack_email_sent_at: Date | string | null;
  resolved_email_sent_at: Date | string | null;
  resolved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

export interface SupportTicketListItem extends SupportTicket {
  organization_name?: string | null;
  created_by_name?: string | null;
  created_by_email?: string | null;
  assigned_to_name?: string | null;
  assigned_to_email?: string | null;
  latest_message_at?: Date | string | null;
  client_visible_message_count?: number;
}

export interface ClientTicketFilters {
  status?: SupportTicketStatus | "open";
  type?: SupportTicketType;
  limit?: number;
  offset?: number;
}

export interface AdminTicketFilters extends ClientTicketFilters {
  organizationId?: number;
  assignedToUserId?: number | "unassigned";
  q?: string;
}

export class SupportTicketModel extends BaseModel {
  protected static tableName = "support_tickets";
  protected static jsonFields = ["guided_answers"];

  static async nextPublicSequence(trx?: QueryContext): Promise<number> {
    const result = await (trx || db).raw(
      "SELECT nextval('support_ticket_public_id_seq') AS value",
    );
    return Number(result.rows?.[0]?.value || 0);
  }

  static async create(
    data: Partial<SupportTicket>,
    trx?: QueryContext,
  ): Promise<SupportTicket> {
    return super.create(data as Record<string, unknown>, trx);
  }

  static async findById(
    id: string,
    trx?: QueryContext,
  ): Promise<SupportTicket | undefined> {
    return super.findById(id, trx);
  }

  static async updateTicket(
    id: string,
    data: Partial<SupportTicket>,
    trx?: QueryContext,
  ): Promise<SupportTicket | undefined> {
    const serialized = this.serializeJsonFields({
      ...data,
      updated_at: new Date(),
    });

    const [row] = await this.table(trx)
      .where({ id })
      .update(serialized)
      .returning("*");

    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findClientTicket(
    idOrPublicId: string,
    organizationId: number,
    trx?: QueryContext,
  ): Promise<SupportTicket | undefined> {
    const row = await this.table(trx)
      .where("organization_id", organizationId)
      .whereNot("status", "archived")
      .andWhere((qb) => {
        qb.where("id", idOrPublicId).orWhere("public_id", idOrPublicId);
      })
      .first();

    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async findAdminTicket(
    idOrPublicId: string,
    trx?: QueryContext,
  ): Promise<SupportTicketListItem | undefined> {
    const row = await this.adminBaseQuery(trx)
      .where((qb) => {
        qb.where("support_tickets.id", idOrPublicId).orWhere(
          "support_tickets.public_id",
          idOrPublicId,
        );
      })
      .first();

    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listClientTickets(
    organizationId: number,
    filters: ClientTicketFilters = {},
    trx?: QueryContext,
  ): Promise<PaginatedResult<SupportTicketListItem>> {
    const { limit = 25, offset = 0 } = filters;

    const buildQuery = (query: Knex.QueryBuilder, includeAggregates = true) => {
      const qb = query;

      if (includeAggregates) {
        qb.select(
          "support_tickets.*",
          db.raw(
            "MAX(support_ticket_messages.created_at) FILTER (WHERE support_ticket_messages.visibility = 'client_visible') AS latest_message_at",
          ),
          db.raw(
            "COUNT(support_ticket_messages.id) FILTER (WHERE support_ticket_messages.visibility = 'client_visible')::int AS client_visible_message_count",
          ),
        )
          .leftJoin(
            "support_ticket_messages",
            "support_ticket_messages.ticket_id",
            "support_tickets.id",
          )
          .groupBy("support_tickets.id");
      }

      qb.where("support_tickets.organization_id", organizationId)
        .whereNot("support_tickets.status", "archived")
        .from("support_tickets");

      this.applyCommonFilters(qb, filters);

      return qb;
    };

    const countResult = await buildQuery(this.table(trx), false)
      .countDistinct("support_tickets.id as count")
      .first();
    const total = Number(countResult?.count || 0);

    const rows = await buildQuery(this.table(trx), true)
      .orderBy("support_tickets.created_at", "desc")
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((row: unknown) => this.deserializeJsonFields(row)),
      total,
    };
  }

  static async listAdminTickets(
    filters: AdminTicketFilters = {},
    trx?: QueryContext,
  ): Promise<PaginatedResult<SupportTicketListItem>> {
    const { limit = 50, offset = 0 } = filters;

    const buildQuery = (query: Knex.QueryBuilder, includeAggregates = true) => {
      const qb = query
        .leftJoin(
          "organizations",
          "organizations.id",
          "support_tickets.organization_id",
        )
        .leftJoin(
          "users as creators",
          "creators.id",
          "support_tickets.created_by_user_id",
        )
        .leftJoin(
          "users as assignees",
          "assignees.id",
          "support_tickets.assigned_to_user_id",
        );

      if (includeAggregates) {
        qb.select(
          "support_tickets.*",
          "organizations.name as organization_name",
          "creators.email as created_by_email",
          db.raw(
            "COALESCE(creators.name, NULLIF(CONCAT_WS(' ', creators.first_name, creators.last_name), ''), creators.email) AS created_by_name",
          ),
          "assignees.email as assigned_to_email",
          db.raw(
            "COALESCE(assignees.name, NULLIF(CONCAT_WS(' ', assignees.first_name, assignees.last_name), ''), assignees.email) AS assigned_to_name",
          ),
          db.raw(
            "MAX(support_ticket_messages.created_at) FILTER (WHERE support_ticket_messages.visibility = 'client_visible') AS latest_message_at",
          ),
          db.raw(
            "COUNT(support_ticket_messages.id) FILTER (WHERE support_ticket_messages.visibility = 'client_visible')::int AS client_visible_message_count",
          ),
        )
          .leftJoin(
            "support_ticket_messages",
            "support_ticket_messages.ticket_id",
            "support_tickets.id",
          )
          .groupBy(
            "support_tickets.id",
            "organizations.name",
            "creators.id",
            "assignees.id",
          );
      }

      this.applyCommonFilters(qb, filters);

      if (filters.organizationId) {
        qb.where("support_tickets.organization_id", filters.organizationId);
      }

      if (filters.assignedToUserId === "unassigned") {
        qb.whereNull("support_tickets.assigned_to_user_id");
      } else if (filters.assignedToUserId) {
        qb.where(
          "support_tickets.assigned_to_user_id",
          filters.assignedToUserId,
        );
      }

      if (filters.q) {
        const search = `%${filters.q.trim()}%`;
        qb.where((whereQb) => {
          whereQb
            .whereILike("support_tickets.public_id", search)
            .orWhereILike("support_tickets.title", search)
            .orWhereILike("organizations.name", search)
            .orWhereILike("creators.email", search);
        });
      }

      return qb;
    };

    const countResult = await buildQuery(this.table(trx), false)
      .countDistinct("support_tickets.id as count")
      .first();
    const total = Number(countResult?.count || 0);

    const rows = await buildQuery(this.table(trx), true)
      .orderByRaw(
        "CASE support_tickets.status WHEN 'new' THEN 1 WHEN 'triaged' THEN 2 WHEN 'in_progress' THEN 3 WHEN 'waiting_on_client' THEN 4 WHEN 'resolved' THEN 5 WHEN 'wont_fix' THEN 6 WHEN 'archived' THEN 7 ELSE 8 END",
      )
      .orderBy("support_tickets.created_at", "desc")
      .limit(limit)
      .offset(offset);

    return {
      data: rows.map((row: unknown) => this.deserializeJsonFields(row)),
      total,
    };
  }

  private static adminBaseQuery(trx?: QueryContext): Knex.QueryBuilder {
    return this.table(trx)
      .select(
        "support_tickets.*",
        "organizations.name as organization_name",
        "creators.email as created_by_email",
        db.raw(
          "COALESCE(creators.name, NULLIF(CONCAT_WS(' ', creators.first_name, creators.last_name), ''), creators.email) AS created_by_name",
        ),
        "assignees.email as assigned_to_email",
        db.raw(
          "COALESCE(assignees.name, NULLIF(CONCAT_WS(' ', assignees.first_name, assignees.last_name), ''), assignees.email) AS assigned_to_name",
        ),
      )
      .leftJoin(
        "organizations",
        "organizations.id",
        "support_tickets.organization_id",
      )
      .leftJoin(
        "users as creators",
        "creators.id",
        "support_tickets.created_by_user_id",
      )
      .leftJoin(
        "users as assignees",
        "assignees.id",
        "support_tickets.assigned_to_user_id",
      );
  }

  private static applyCommonFilters(
    qb: Knex.QueryBuilder,
    filters: ClientTicketFilters,
  ): void {
    if (filters.status === "open") {
      qb.whereNotIn("support_tickets.status", [
        "resolved",
        "wont_fix",
        "archived",
      ]);
    } else if (filters.status) {
      qb.where("support_tickets.status", filters.status);
    } else {
      qb.whereNot("support_tickets.status", "archived");
    }

    if (filters.type) {
      qb.where("support_tickets.type", filters.type);
    }
  }
}
