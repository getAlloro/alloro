import { db } from "../database/connection";
import { updateEngagementScoreAsync } from "../services/behavioralIntelligence";

export interface IBehavioralEvent {
  id: string;
  event_type: string;
  org_id: number | null;
  session_id: string | null;
  properties: Record<string, unknown>;
  created_at: Date;
}

export class BehavioralEventModel {
  static async create(data: {
    event_type: string;
    org_id?: number | null;
    session_id?: string | null;
    properties?: Record<string, unknown>;
  }): Promise<IBehavioralEvent> {
    const [row] = await db("behavioral_events")
      .insert({
        event_type: data.event_type,
        org_id: data.org_id ?? null,
        session_id: data.session_id ?? null,
        properties: JSON.stringify(data.properties ?? {}),
      })
      .returning("*");

    // Fire-and-forget engagement score update (debounced hourly per org)
    updateEngagementScoreAsync(data.org_id ?? null);

    return row;
  }

  /**
   * Insert a security rate-limit-hit event with a pre-stringified `properties`
   * payload. Mirrors the fire-and-forget insert in
   * middleware/publicRateLimiter.scraperDetection verbatim: a bare
   * (event_type, properties) insert with NO org_id/session_id and — critically
   * — NONE of the create() side-effects (no updateEngagementScoreAsync). The
   * caller attaches its own .catch().
   */
  static async insertRateLimitHit(data: {
    eventType: string;
    properties: string;
  }): Promise<void> {
    await db("behavioral_events").insert({
      event_type: data.eventType,
      properties: data.properties,
    });
  }

  static async findByType(
    eventType: string,
    limit = 100
  ): Promise<IBehavioralEvent[]> {
    return db("behavioral_events")
      .where({ event_type: eventType })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async findByOrgId(
    orgId: number,
    limit = 100
  ): Promise<IBehavioralEvent[]> {
    return db("behavioral_events")
      .where({ org_id: orgId })
      .orderBy("created_at", "desc")
      .limit(limit);
  }

  static async findBySessionId(
    sessionId: string
  ): Promise<IBehavioralEvent[]> {
    return db("behavioral_events")
      .where({ session_id: sessionId })
      .orderBy("created_at", "asc");
  }

  /**
   * Whether an event of a given type already exists for a session. Mirrors the
   * dedup read in services/firstPatientAttribution.attributeCheckupToOrg.
   * Returns the raw first matching row (or undefined).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async findFirstByTypeAndSession(
    eventType: string,
    sessionId: string
  ): Promise<any> {
    return db("behavioral_events")
      .where({ event_type: eventType })
      .where("session_id", sessionId)
      .first();
  }

  /**
   * Count events of a given type for an org created on/after a cutoff. Mirrors
   * the weekly-attribution count in
   * services/firstPatientAttribution.attributeCheckupToOrg
   * (count("id as count").first()). Returns the raw count row.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static async countByTypeAndOrgSince(
    eventType: string,
    orgId: number,
    since: Date
  ): Promise<any> {
    return db("behavioral_events")
      .where({ event_type: eventType, org_id: orgId })
      .where("created_at", ">=", since)
      .count("id as count")
      .first();
  }

  /**
   * event_type rows for an org created on/after a cutoff, newest-first. Mirrors
   * the inline reads in services/behavioralIntelligence (getEngagementScore /
   * getMostSignificantEvent).
   */
  static async findEventTypesByOrgSince(
    orgId: number,
    since: Date
  ): Promise<{ event_type: string }[]> {
    return db("behavioral_events")
      .where({ org_id: orgId })
      .where("created_at", ">=", since)
      .select("event_type")
      .orderBy("created_at", "desc");
  }

  /**
   * Insert an "agent.finding" event with a pre-stringified `properties`
   * payload, generating the id via gen_random_uuid(). Mirrors the inline insert
   * in services/behavioralIntelligence.recordAgentFinding verbatim.
   */
  static async insertAgentFinding(data: {
    org_id: number;
    properties: string;
  }): Promise<void> {
    await db("behavioral_events").insert({
      id: db.raw("gen_random_uuid()"),
      event_type: "agent.finding",
      org_id: data.org_id,
      properties: data.properties,
      created_at: new Date(),
    });
  }

  /**
   * Recent "agent.finding" rows for an org created on/after a cutoff,
   * newest-first, capped at 20, projected to (properties). Mirrors the reads in
   * services/behavioralIntelligence.getTopAgentFinding / getMostShareableFinding.
   */
  static async findRecentAgentFindingsByOrg(
    orgId: number,
    cutoff: Date
  ): Promise<{ properties: unknown }[]> {
    return db("behavioral_events")
      .where({ event_type: "agent.finding", org_id: orgId })
      .where("created_at", ">=", cutoff)
      .orderBy("created_at", "desc")
      .limit(20)
      .select("properties");
  }

  /**
   * Recent "agent.finding" rows created on/after a cutoff, newest-first, capped
   * at 50, optionally scoped to an org, projected to (properties, org_id).
   * Mirrors the read in services/behavioralIntelligence.getAgentFindings
   * (conditional andWhere on org_id).
   */
  static async findRecentAgentFindings(
    orgId: number | null,
    cutoff: Date
  ): Promise<{ properties: unknown; org_id: number | null }[]> {
    const query = db("behavioral_events")
      .where({ event_type: "agent.finding" })
      .where("created_at", ">=", cutoff)
      .orderBy("created_at", "desc")
      .limit(50);

    if (orgId) query.andWhere({ org_id: orgId });

    return query.select("properties", "org_id");
  }
}
