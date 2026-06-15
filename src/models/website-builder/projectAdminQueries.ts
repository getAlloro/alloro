/* eslint-disable @typescript-eslint/no-explicit-any */
import { Knex } from "knex";
import { db } from "../../database/connection";
import { QueryContext } from "../BaseModel";
import { ProjectListViewFilter } from "./ProjectModel";

/**
 * Admin-surface query-builder bodies for {@link ProjectModel}, split out of
 * {@link import("./projectQueries")} so each model-layer file stays under the
 * size ceiling. This module holds the admin project-manager
 * (service.project-manager), generation-pipeline (service.generation-pipeline),
 * and admin-controller (AdminWebsitesController) helpers; the core reads/writes,
 * rybbit, custom-domain, and hostname lookups stay in `projectQueries`, which
 * re-exports this module so the facade keeps a single `* as q` import.
 *
 * Behavior-preserving contract: every function builds the SAME query as the
 * original inline body in ProjectModel — identical columns, filters, joins,
 * ordering, limits, return shapes, raw SQL, and timestamp clocks (`db.fn.now()`
 * vs the JS `new Date()`). The table literal (`PROJECTS_TABLE` ===
 * ProjectModel.tableName) keeps the SQL byte-identical.
 */

const PROJECTS_TABLE = "website_builder.projects";

/** Mirror of BaseModel.table(trx) for the projects table. */
function table(trx?: QueryContext): Knex.QueryBuilder {
  return (trx || db)(PROJECTS_TABLE);
}

export async function countAdminListQuery(
  filters: { status?: string; projectListView?: ProjectListViewFilter },
  trx?: QueryContext,
): Promise<number> {
  let countQuery = table(trx);
  if (filters.status) {
    countQuery = countQuery.where("status", filters.status);
  }
  if (filters.projectListView === "active") {
    countQuery = countQuery.whereNotNull("organization_id");
  }
  if (filters.projectListView === "inactive") {
    countQuery = countQuery.whereNull("organization_id");
  }
  if (
    filters.projectListView === "active" ||
    filters.projectListView === "inactive"
  ) {
    countQuery = countQuery.whereNull("archived_at");
  }
  if (filters.projectListView === "archive") {
    countQuery = countQuery.whereNotNull("archived_at");
  }
  const [{ count }] = await countQuery.count("* as count");
  return parseInt(count as string, 10);
}

export function listAdminWithOrganizationQuery(
  filters: {
    status?: string;
    projectListView?: ProjectListViewFilter;
    limit: number;
    offset: number;
  },
  trx?: QueryContext,
): Promise<any[]> {
  let dataQuery = table(trx)
    .leftJoin(
      "organizations",
      `${PROJECTS_TABLE}.organization_id`,
      "organizations.id",
    )
    .select(
      `${PROJECTS_TABLE}.id`,
      `${PROJECTS_TABLE}.user_id`,
      `${PROJECTS_TABLE}.generated_hostname`,
      `${PROJECTS_TABLE}.status`,
      `${PROJECTS_TABLE}.selected_place_id`,
      `${PROJECTS_TABLE}.selected_website_url`,
      `${PROJECTS_TABLE}.template_id`,
      `${PROJECTS_TABLE}.step_gbp_scrape`,
      `${PROJECTS_TABLE}.display_name`,
      `${PROJECTS_TABLE}.custom_domain`,
      `${PROJECTS_TABLE}.primary_color`,
      `${PROJECTS_TABLE}.accent_color`,
      `${PROJECTS_TABLE}.archived_at`,
      `${PROJECTS_TABLE}.created_at`,
      `${PROJECTS_TABLE}.updated_at`,
      db.raw(
        "json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization",
      ),
    );

  if (filters.status) {
    dataQuery = dataQuery.where(`${PROJECTS_TABLE}.status`, filters.status);
  }
  if (filters.projectListView === "active") {
    dataQuery = dataQuery.whereNotNull(`${PROJECTS_TABLE}.organization_id`);
  }
  if (filters.projectListView === "inactive") {
    dataQuery = dataQuery.whereNull(`${PROJECTS_TABLE}.organization_id`);
  }
  if (
    filters.projectListView === "active" ||
    filters.projectListView === "inactive"
  ) {
    dataQuery = dataQuery.whereNull(`${PROJECTS_TABLE}.archived_at`);
  }
  if (filters.projectListView === "archive") {
    dataQuery = dataQuery.whereNotNull(`${PROJECTS_TABLE}.archived_at`);
  }

  return dataQuery
    .orderBy(`${PROJECTS_TABLE}.created_at`, "desc")
    .limit(filters.limit)
    .offset(filters.offset);
}

export async function insertReturningQuery(
  row: Record<string, unknown>,
  trx?: QueryContext,
): Promise<any> {
  const [project] = await table(trx).insert(row).returning("*");
  return project;
}

export function updateDisplayNameByIdQuery(
  projectId: string,
  displayName: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where({ id: projectId })
    .update({ display_name: displayName });
}

export async function findDistinctStatusesQuery(
  trx?: QueryContext,
): Promise<string[]> {
  const rows = await table(trx)
    .distinct("status")
    .whereNotNull("status")
    .orderBy("status", "asc");
  return rows.map((s: { status: string }) => s.status);
}

export async function findStatusByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<any> {
  const project = await table(trx)
    .select(
      "id",
      "status",
      "selected_place_id",
      "selected_website_url",
      "step_gbp_scrape",
      "step_website_scrape",
      "step_image_analysis",
      "updated_at",
    )
    .where("id", id)
    .first();
  return project || null;
}

export function findLinkedToOrganizationExceptQuery(
  organizationId: number,
  exceptProjectId: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where("organization_id", organizationId)
    .whereNot("id", exceptProjectId)
    .first();
}

export async function setOrganizationIdReturningQuery(
  projectId: string,
  organizationId: number | null,
  trx?: QueryContext,
): Promise<any> {
  await table(trx)
    .where("id", projectId)
    .update({ organization_id: organizationId, updated_at: db.fn.now() });

  const [updatedProject] = await table(trx)
    .where("id", projectId)
    .returning("*");
  return updatedProject;
}

export function findByIdWithOrganizationQuery(
  id: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .leftJoin(
      "organizations",
      `${PROJECTS_TABLE}.organization_id`,
      "organizations.id",
    )
    .select(
      `${PROJECTS_TABLE}.*`,
      db.raw(
        "json_build_object('id', organizations.id, 'name', organizations.name, 'subscription_tier', organizations.subscription_tier) as organization",
      ),
    )
    .where(`${PROJECTS_TABLE}.id`, id)
    .first();
}

export async function updateFieldsByIdReturningQuery(
  id: string,
  fields: Record<string, unknown>,
  trx?: QueryContext,
): Promise<any> {
  const [project] = await table(trx)
    .where("id", id)
    .update({ ...fields, updated_at: db.fn.now() })
    .returning("*");
  return project;
}

export function setStatusInProgressByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", projectId)
    .update({ status: "IN_PROGRESS", updated_at: db.fn.now() });
}

export function advanceCreatedToInProgressQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", projectId)
    .where("status", "CREATED")
    .update({ status: "IN_PROGRESS", updated_at: db.fn.now() });
}

export function deleteByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx).where("id", id).del();
}

export function updateFieldsByIdQuery(
  id: string,
  fields: Record<string, unknown>,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({ ...fields, updated_at: db.fn.now() });
}

export function findCancelRequestedByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<{ generation_cancel_requested: boolean } | undefined> {
  return table(trx)
    .where("id", projectId)
    .select("generation_cancel_requested")
    .first();
}

export function findIdentityContextByIdQuery(
  projectId: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where("id", projectId)
    .select("id", "template_id", "project_identity")
    .first();
}

export function findLayoutFieldsByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<
  { wrapper: string | null; header: string | null; footer: string | null }
  | undefined
> {
  return table(trx)
    .where("id", id)
    .select("wrapper", "header", "footer")
    .first();
}

export function findLayoutsStatusByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where("id", id)
    .select(
      "layouts_generation_status",
      "layouts_generation_progress",
      "layouts_generated_at",
      "layout_slot_values",
      "wrapper",
      "header",
      "footer",
    )
    .first();
}

export function findRecipientsContextByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where("id", id)
    .select("id", "recipients", "organization_id")
    .first();
}

export function findOrganizationContextByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<any> {
  return table(trx)
    .where("id", id)
    .select("id", "organization_id")
    .first();
}

export function updateRecipientsByIdQuery(
  id: string,
  recipientsJson: string,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({ recipients: recipientsJson, updated_at: db.fn.now() });
}

export function findOrganizationIdByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<{ organization_id: number | null } | undefined> {
  return table(trx)
    .where("id", id)
    .select("organization_id")
    .first();
}

export function findIdOnlyByIdQuery(
  id: string,
  trx?: QueryContext,
): Promise<{ id: string } | undefined> {
  return table(trx).where("id", id).select("id").first();
}

export function findLocationSelectionByIdQuery(
  id: string,
  columns: string[],
  trx?: QueryContext,
): Promise<any> {
  return table(trx).where("id", id).select(columns).first();
}

export function updatePlaceSelectionByIdQuery(
  id: string,
  placeFields: Record<string, unknown>,
  trx?: QueryContext,
): Promise<number> {
  return table(trx)
    .where("id", id)
    .update({ ...placeFields, updated_at: db.fn.now() });
}
