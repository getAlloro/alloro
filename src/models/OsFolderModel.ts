import { db } from "../database/connection";
import { BaseModel, QueryContext } from "./BaseModel";

export interface IOsFolder {
  id: string;
  name: string;
  parent_id: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * os.folders — folder tree for the internal OS knowledge base Library
 * (plans/07042026-alloro-os-admin-port, D4/D11).
 *
 * §11.7 posture: os.* tables are internal-admin SINGLE-TENANT by design — no
 * organization/location column exists. Isolation is enforced by the
 * super-admin gate on every /api/admin/os route (§11.1), not by per-row
 * tenant scoping. P2 completes the folder API (tree reads, move/rename,
 * delete, cycle-guard ancestor walk).
 */
export class OsFolderModel extends BaseModel {
  protected static tableName = "os.folders";

  static async createFolder(
    data: {
      name: string;
      parent_id?: string | null;
      created_by?: number | null;
    },
    trx?: QueryContext
  ): Promise<IOsFolder> {
    return super.create(data, trx);
  }

  static async listAll(trx?: QueryContext): Promise<IOsFolder[]> {
    return this.table(trx)
      .select("id", "name", "parent_id", "created_by", "created_at", "updated_at")
      .orderBy("name", "asc");
  }

  static async findFolderById(
    id: string,
    trx?: QueryContext
  ): Promise<IOsFolder | undefined> {
    return super.findById(id, trx);
  }

  static async updateFolder(
    id: string,
    patch: { name?: string; parent_id?: string | null },
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx).where({ id }).update({ ...patch, updated_at: new Date() });
  }

  static async deleteFolder(id: string, trx?: QueryContext): Promise<number> {
    // os.documents.folder_id is ON DELETE SET NULL — docs fall back to root.
    return this.table(trx).where({ id }).del();
  }

  static async hasChildren(id: string, trx?: QueryContext): Promise<boolean> {
    return Boolean(await this.table(trx).where({ parent_id: id }).first("id"));
  }

  static async countDocumentsInFolder(
    id: string,
    trx?: QueryContext
  ): Promise<number> {
    const row = await this.table(trx)
      .from("os.documents")
      .where({ folder_id: id })
      .count("id as count")
      .first();
    return parseInt(String(row?.count ?? "0"), 10) || 0;
  }

  /** Non-archived document counts per folder — one grouped query for the tree. */
  static async countDocumentsPerFolder(
    trx?: QueryContext
  ): Promise<Map<string, number>> {
    const rows: { folder_id: string; count: string }[] = await this.table(trx)
      .from("os.documents")
      .whereNotNull("folder_id")
      .whereNull("archived_at")
      .groupBy("folder_id")
      .select("folder_id")
      .count("id as count");
    return new Map(
      rows.map((row) => [row.folder_id, parseInt(String(row.count), 10) || 0])
    );
  }

  /**
   * Ancestor chain of a folder (nearest first), via a recursive CTE — the
   * cycle guard for moves: moving F under P is illegal when P === F or F is
   * an ancestor of P. Parameterized raw (§10.2); depth-capped defensively.
   */
  static async listAncestorIds(
    id: string,
    trx?: QueryContext
  ): Promise<string[]> {
    const result = await (trx || db).raw(
      `with recursive ancestors as (
         select f.id, f.parent_id, 1 as depth
         from os.folders f
         where f.id = ?
         union all
         select p.id, p.parent_id, a.depth + 1
         from os.folders p
         join ancestors a on p.id = a.parent_id
         where a.depth < 50
       )
       select id from ancestors where id <> ? order by depth asc`,
      [id, id]
    );
    return result.rows.map((row: { id: string }) => row.id);
  }
}
