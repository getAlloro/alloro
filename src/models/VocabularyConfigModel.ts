import { BaseModel, QueryContext } from "./BaseModel";

export interface IVocabularyConfig {
  id: number;
  org_id: number;
  vertical: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  overrides: any;
  created_at?: Date;
  updated_at?: Date;
}

/**
 * Owns the `vocabulary_configs` table. Methods mirror the inline queries
 * previously held in services/vocabularyAutoMapper.ts verbatim — `overrides`
 * is written as a pre-stringified payload (raw passthrough) and the existence
 * read returns the raw row.
 */
export class VocabularyConfigModel extends BaseModel {
  protected static tableName = "vocabulary_configs";

  /** Existing config for an org (raw row, or undefined). */
  static async findByOrgId(
    orgId: number,
    trx?: QueryContext
  ): Promise<IVocabularyConfig | undefined> {
    return this.table(trx).where({ org_id: orgId }).first();
  }

  /**
   * Insert a vocabulary config with a pre-stringified `overrides` payload.
   * Mirrors the inline insert in vocabularyAutoMapper.autoConfigureVocabulary.
   */
  static async insertConfig(
    data: { org_id: number; vertical: string; overrides: string },
    trx?: QueryContext
  ): Promise<void> {
    await this.table(trx).insert({
      org_id: data.org_id,
      vertical: data.vertical,
      overrides: data.overrides,
    });
  }
}
