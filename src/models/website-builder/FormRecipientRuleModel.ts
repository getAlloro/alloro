import { BaseModel, QueryContext } from "../BaseModel";

export interface IFormRecipientRule {
  id: string;
  project_id: string;
  form_name: string;
  form_key: string;
  recipients: string[];
  is_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

export class FormRecipientRuleModel extends BaseModel {
  protected static tableName = "website_builder.form_recipient_rules";
  protected static jsonFields = ["recipients"];

  static async findByProjectAndFormKey(
    projectId: string,
    formKey: string,
    trx?: QueryContext,
  ): Promise<IFormRecipientRule | undefined> {
    const row = await this.table(trx)
      .where({ project_id: projectId, form_key: formKey })
      .first();
    return row ? this.deserializeJsonFields(row) : undefined;
  }

  static async listByProject(
    projectId: string,
    trx?: QueryContext,
  ): Promise<IFormRecipientRule[]> {
    const rows = await this.table(trx)
      .where({ project_id: projectId })
      .orderBy("form_name", "asc");
    return rows.map((row: IFormRecipientRule) =>
      this.deserializeJsonFields(row),
    );
  }

  static async upsertForForm(
    data: {
      project_id: string;
      form_name: string;
      form_key: string;
      recipients: string[];
      is_enabled: boolean;
    },
    trx?: QueryContext,
  ): Promise<IFormRecipientRule> {
    const payload = this.serializeJsonFields({
      ...data,
      updated_at: new Date(),
    });

    const [row] = await this.table(trx)
      .insert({
        ...payload,
        created_at: new Date(),
      })
      .onConflict(["project_id", "form_key"])
      .merge({
        form_name: payload.form_name,
        recipients: payload.recipients,
        is_enabled: payload.is_enabled,
        updated_at: payload.updated_at,
      })
      .returning("*");

    return this.deserializeJsonFields(row);
  }
}
