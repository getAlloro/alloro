import { BaseModel, QueryContext } from "./BaseModel";

export interface IOsAdminUser {
  id: number;
  email: string;
  name: string | null;
  first_name: string | null;
  last_name: string | null;
}

/**
 * Read-only projection of public.users for the OS knowledge base's
 * people-pickers (owner, author — master spec D3): internal Alloro team
 * accounts only (users.is_internal = true, migration 20260701010000).
 * All writes to users stay in UserModel.
 *
 * §11.7 posture: the OS domain is internal-admin single-tenant; every route
 * that reaches this model is super-admin gated (§11.1), so no tenant scoping
 * applies here by design.
 */
export class OsAdminUserModel extends BaseModel {
  protected static tableName = "users";

  static async listInternalUsers(trx?: QueryContext): Promise<IOsAdminUser[]> {
    return this.table(trx)
      .where({ is_internal: true })
      .select("id", "email", "name", "first_name", "last_name")
      .orderBy("email", "asc");
  }
}
