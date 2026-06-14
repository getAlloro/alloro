import { v4 as uuid } from "uuid";
import { BaseModel, QueryContext } from "../BaseModel";

export interface IUserEdit {
  id: number;
  organization_id: number;
  page_id: string | null;
  edit_type: string | null;
  created_at: Date;
}

export interface ComponentEditLog {
  organizationId: number;
  userId: number;
  projectId: string;
  pageId: string;
  componentClass: string;
  instruction: string;
  tokensUsed: number;
  success: boolean;
  errorMessage: string | null;
}

export class UserEditModel extends BaseModel {
  protected static tableName = "website_builder.user_edits";

  static async create(
    data: Partial<IUserEdit>,
    trx?: QueryContext
  ): Promise<IUserEdit> {
    return super.create(data as Record<string, unknown>, trx);
  }

  /**
   * Insert an AI component-edit log row verbatim. The user_edits table carries
   * more columns than IUserEdit (project_id, component_class, instruction,
   * tokens_used, success, error_message), so this writes the full row with a
   * generated uuid and only created_at — matching the original inline
   * db("website_builder.user_edits").insert({...}) in
   * userWebsite.service.editPageComponent (no updated_at injection).
   */
  static async logComponentEdit(
    log: ComponentEditLog,
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert({
      id: uuid(),
      organization_id: log.organizationId,
      user_id: log.userId,
      project_id: log.projectId,
      page_id: log.pageId,
      component_class: log.componentClass,
      instruction: log.instruction,
      tokens_used: log.tokensUsed,
      success: log.success,
      error_message: log.errorMessage,
      created_at: new Date(),
    });
  }

  static async countTodayByOrg(
    orgId: number,
    trx?: QueryContext
  ): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await this.table(trx)
      .where({ organization_id: orgId })
      .where("created_at", ">=", today)
      .count("* as count")
      .first();
    return parseInt(result?.count as string, 10) || 0;
  }
}
