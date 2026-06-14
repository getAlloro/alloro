import { BaseModel, QueryContext } from "../BaseModel";

/**
 * Owns the `website_builder.ai_command_recommendations` table. This model
 * currently exposes only the method the agentic HTML pipeline needs; the
 * admin-websites feature-services that also touch this table are migrated under
 * a separate domain task. The `execution_result` write mirrors the inline
 * update in utils/website-utils/agenticHtmlPipeline.updateRecStatus verbatim —
 * the caller passes a pre-stringified payload (raw passthrough).
 */
export class AiCommandRecommendationModel extends BaseModel {
  protected static tableName = "website_builder.ai_command_recommendations";

  /**
   * Set the (already-stringified) execution_result for a recommendation by id.
   * Mirrors agenticHtmlPipeline.updateRecStatus.
   */
  static async updateExecutionResult(
    id: string,
    executionResultJson: string,
    trx?: QueryContext
  ): Promise<number> {
    return this.table(trx)
      .where("id", id)
      .update({ execution_result: executionResultJson });
  }
}
