import { BaseModel, QueryContext } from "../BaseModel";

export interface IFormCatalogPreference {
  id: string;
  project_id: string;
  form_name: string;
  form_key: string;
  display_label: string | null;
  sort_order: number | null;
  created_at: Date;
  updated_at: Date;
}

export type FormCatalogPreferenceUpsert = {
  project_id: string;
  form_name: string;
  form_key: string;
  display_label: string | null;
  sort_order: number | null;
};

export class FormCatalogPreferenceModel extends BaseModel {
  protected static tableName = "website_builder.form_catalog_preferences";

  static async listByProject(
    projectId: string,
    trx?: QueryContext,
  ): Promise<IFormCatalogPreference[]> {
    return this.table(trx)
      .where({ project_id: projectId })
      .orderBy("sort_order", "asc", "last")
      .orderBy("form_name", "asc");
  }

  static async upsertMany(
    preferences: FormCatalogPreferenceUpsert[],
    trx?: QueryContext,
  ): Promise<IFormCatalogPreference[]> {
    const rows: IFormCatalogPreference[] = [];

    for (const preference of preferences) {
      const payload = {
        ...preference,
        updated_at: new Date(),
      };

      const [row] = await this.table(trx)
        .insert({
          ...payload,
          created_at: new Date(),
        })
        .onConflict(["project_id", "form_key"])
        .merge({
          form_name: payload.form_name,
          display_label: payload.display_label,
          sort_order: payload.sort_order,
          updated_at: payload.updated_at,
        })
        .returning("*");

      rows.push(row);
    }

    return rows;
  }
}
