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
 * tenant scoping. P1 ships the minimal reads/writes; P2 completes the
 * folder API (rename, move, delete).
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
}
