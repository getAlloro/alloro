import { BaseModel, QueryContext } from "./BaseModel";

export interface MarketRankingContext {
  organization_id: number;
  location_id: number;
  specialty: string | null;
  market_location: string | null;
  rank_keywords: string | null;
  search_city: string | null;
  search_state: string | null;
  search_county: string | null;
  search_postal_code: string | null;
  gbp_account_id: string | null;
  gbp_location_id: string | null;
  gbp_location_name: string | null;
}

/**
 * Thin projection over practice_rankings for Market Intelligence. Kept separate
 * from the large legacy PracticeRankingModel so new reads do not grow that file
 * past the code-constitution hard ceiling.
 */
export class PracticeRankingMarketContextModel extends BaseModel {
  protected static tableName = "practice_rankings";

  static async findLatestByOrganization(
    organizationId: number,
    trx?: QueryContext
  ): Promise<MarketRankingContext[]> {
    const rows = await this.table(trx)
      .distinctOn("location_id")
      .where({
        organization_id: organizationId,
        status: "completed",
      })
      .whereNotNull("location_id")
      .orderBy("location_id")
      .orderBy("created_at", "desc")
      .select(
        "organization_id",
        "location_id",
        "specialty",
        "location as market_location",
        "rank_keywords",
        "search_city",
        "search_state",
        "search_county",
        "search_postal_code",
        "gbp_account_id",
        "gbp_location_id",
        "gbp_location_name"
      );
    return rows as MarketRankingContext[];
  }
}
