import type { Knex } from "knex";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeadgenEventIngestionService } from "../controllers/leadgen-tracking/feature-services/LeadgenEventIngestionService";
import { LeadgenEventModel } from "../models/LeadgenEventModel";
import {
  ILeadgenSession,
  LeadgenSessionModel,
} from "../models/LeadgenSessionModel";
import type { LeadgenEventPayload } from "../validation/leadgenTracking.schemas";

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const AUDIT_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_AUDIT_ID = "33333333-3333-4333-8333-333333333333";
const trx = {} as Knex.Transaction;

function makeSession(
  overrides: Partial<ILeadgenSession> = {}
): ILeadgenSession {
  const now = new Date("2026-07-15T00:00:00.000Z");
  return {
    id: SESSION_ID,
    audit_id: null,
    email: null,
    domain: null,
    practice_search_string: null,
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_term: null,
    utm_content: null,
    user_agent: null,
    browser: null,
    os: null,
    device_type: null,
    user_id: null,
    converted_at: null,
    final_stage: "landed",
    completed: false,
    abandoned: false,
    first_seen_at: now,
    last_seen_at: now,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

function payload(
  event_name: LeadgenEventPayload["event_name"],
  overrides: Partial<LeadgenEventPayload> = {}
): LeadgenEventPayload {
  return { session_id: SESSION_ID, event_name, ...overrides };
}

beforeEach(() => {
  const session = makeSession();
  vi.spyOn(LeadgenSessionModel, "transaction").mockImplementation(
    async (callback) => callback(trx)
  );
  vi.spyOn(LeadgenSessionModel, "findOrCreateLockedForEvent").mockResolvedValue({
    session,
    wasCreated: false,
  });
  vi.spyOn(LeadgenSessionModel, "patchById").mockResolvedValue(1);
  vi.spyOn(LeadgenEventModel, "existsForSessionEvent").mockResolvedValue(false);
  vi.spyOn(LeadgenEventModel, "insertRow").mockResolvedValue();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("LeadgenEventIngestionService", () => {
  it("records the first landed event atomically and keeps the legacy envelope", async () => {
    const result = await LeadgenEventIngestionService.ingest(payload("landed"));

    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(LeadgenSessionModel.transaction).toHaveBeenCalledOnce();
    expect(LeadgenEventModel.insertRow).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: SESSION_ID, event_name: "landed" }),
      trx
    );
    expect(LeadgenSessionModel.patchById).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({ last_seen_at: expect.any(Date) }),
      trx
    );
  });

  it("serializes duplicate progression events so only one insert wins", async () => {
    const recordedEvents = new Set<string>();
    let queue = Promise.resolve();
    vi.mocked(LeadgenSessionModel.transaction).mockImplementation((callback) => {
      const current = queue.then(() => callback(trx));
      queue = current.then(
        () => undefined,
        () => undefined
      );
      return current;
    });
    vi.mocked(LeadgenEventModel.existsForSessionEvent).mockImplementation(
      async (_sessionId, eventName) => recordedEvents.has(eventName)
    );
    vi.mocked(LeadgenEventModel.insertRow).mockImplementation(async (row) => {
      recordedEvents.add(String(row.event_name));
    });

    const results = await Promise.all([
      LeadgenEventIngestionService.ingest(payload("landed")),
      LeadgenEventIngestionService.ingest(payload("landed")),
    ]);

    expect(LeadgenEventModel.insertRow).toHaveBeenCalledOnce();
    expect(results).toContainEqual({ status: 200, body: { ok: true } });
    expect(results).toContainEqual({
      status: 200,
      body: { ok: true, suppressed: "duplicate" },
    });
  });

  it("rolls back a newly established session when semantic validation fails", async () => {
    let sessionWasCreated = false;
    vi.mocked(LeadgenSessionModel.transaction).mockImplementation(
      async (callback) => {
        const snapshot = sessionWasCreated;
        try {
          return await callback(trx);
        } catch (error) {
          sessionWasCreated = snapshot;
          throw error;
        }
      }
    );
    vi.mocked(LeadgenSessionModel.findOrCreateLockedForEvent).mockImplementation(
      async () => {
        sessionWasCreated = true;
        return { session: makeSession(), wasCreated: true };
      }
    );

    const result = await LeadgenEventIngestionService.ingest(
      payload("results_viewed")
    );

    expect(result).toEqual({
      status: 400,
      body: { ok: false, error: "audit_id_required" },
    });
    expect(sessionWasCreated).toBe(false);
    expect(LeadgenEventModel.insertRow).not.toHaveBeenCalled();
  });

  it("rejects an audit identity change", async () => {
    vi.mocked(LeadgenSessionModel.findOrCreateLockedForEvent).mockResolvedValue({
      session: makeSession({ audit_id: AUDIT_ID }),
      wasCreated: false,
    });

    const result = await LeadgenEventIngestionService.ingest(
      payload("stage_viewed_5", { audit_id: OTHER_AUDIT_ID })
    );

    expect(result.body).toEqual({ ok: false, error: "audit_id_conflict" });
    expect(LeadgenEventModel.insertRow).not.toHaveBeenCalled();
  });

  it("requires a prior results_viewed event before one-minute engagement", async () => {
    vi.mocked(LeadgenSessionModel.findOrCreateLockedForEvent).mockResolvedValue({
      session: makeSession({ audit_id: AUDIT_ID, final_stage: "results_viewed" }),
      wasCreated: false,
    });

    const result = await LeadgenEventIngestionService.ingest(
      payload("report_engaged_1min", { audit_id: AUDIT_ID })
    );

    expect(result).toEqual({
      status: 409,
      body: { ok: false, error: "results_viewed_required" },
    });
    expect(LeadgenEventModel.insertRow).not.toHaveBeenCalled();
  });

  it("requires an email for email_submitted", async () => {
    vi.mocked(LeadgenSessionModel.findOrCreateLockedForEvent).mockResolvedValue({
      session: makeSession({ audit_id: AUDIT_ID }),
      wasCreated: false,
    });

    const result = await LeadgenEventIngestionService.ingest(
      payload("email_submitted", { audit_id: AUDIT_ID })
    );

    expect(result.body).toEqual({ ok: false, error: "email_required" });
    expect(LeadgenEventModel.insertRow).not.toHaveBeenCalled();
  });

  it("accepts gate, submission, results, and engagement in authoritative order", async () => {
    const session = makeSession({ audit_id: AUDIT_ID });
    const recordedEvents = new Set<string>();
    vi.mocked(LeadgenSessionModel.findOrCreateLockedForEvent).mockImplementation(
      async () => ({ session, wasCreated: false })
    );
    vi.mocked(LeadgenEventModel.existsForSessionEvent).mockImplementation(
      async (_sessionId, eventName) => recordedEvents.has(eventName)
    );
    vi.mocked(LeadgenEventModel.insertRow).mockImplementation(async (row) => {
      recordedEvents.add(String(row.event_name));
    });
    vi.mocked(LeadgenSessionModel.patchById).mockImplementation(
      async (_sessionId, patch) => {
        Object.assign(session, patch);
        return 1;
      }
    );

    const events: LeadgenEventPayload[] = [
      payload("email_gate_shown", { audit_id: AUDIT_ID }),
      payload("email_submitted", {
        audit_id: AUDIT_ID,
        email: "synthetic@example.com",
      }),
      payload("results_viewed", { audit_id: AUDIT_ID }),
      payload("report_engaged_1min", { audit_id: AUDIT_ID }),
    ];
    const results = [];
    for (const event of events) {
      results.push(await LeadgenEventIngestionService.ingest(event));
    }

    expect(results).toEqual(
      events.map(() => ({ status: 200, body: { ok: true } }))
    );
    expect([...recordedEvents]).toEqual([
      "email_gate_shown",
      "email_submitted",
      "results_viewed",
      "report_engaged_1min",
    ]);
    expect(session.final_stage).toBe("report_engaged_1min");
    expect(session.completed).toBe(true);
  });

  it("persists a write-once audit identity on a valid report event", async () => {
    const result = await LeadgenEventIngestionService.ingest(
      payload("results_viewed", { audit_id: AUDIT_ID })
    );

    expect(result.body).toEqual({ ok: true });
    expect(LeadgenSessionModel.patchById).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        audit_id: AUDIT_ID,
        completed: true,
        abandoned: false,
      }),
      trx
    );
  });

  it("propagates a failed session patch so the database transaction rolls back", async () => {
    vi.mocked(LeadgenSessionModel.patchById).mockRejectedValue(
      new Error("synthetic patch failure")
    );

    await expect(
      LeadgenEventIngestionService.ingest(payload("landed"))
    ).rejects.toThrow("synthetic patch failure");
    expect(LeadgenEventModel.insertRow).toHaveBeenCalledOnce();
  });

  it("records server-authoritative email events and session state in one transaction", async () => {
    vi.spyOn(LeadgenSessionModel, "findByIdForUpdate").mockResolvedValue(
      makeSession()
    );

    const result = await LeadgenEventIngestionService.recordEmailSubmission({
      sessionId: SESSION_ID,
      auditId: AUDIT_ID,
      email: "synthetic@example.com",
      source: "paywall",
    });

    expect(result).toEqual({ status: 200, body: { ok: true } });
    expect(LeadgenEventModel.insertRow).toHaveBeenCalledTimes(2);
    expect(LeadgenSessionModel.patchById).toHaveBeenCalledWith(
      SESSION_ID,
      expect.objectContaining({
        audit_id: AUDIT_ID,
        email: "synthetic@example.com",
        final_stage: "email_submitted",
      }),
      trx
    );
  });

  it("rejects a conflicting audit on server-authoritative email paths", async () => {
    vi.spyOn(LeadgenSessionModel, "findByIdForUpdate").mockResolvedValue(
      makeSession({ audit_id: AUDIT_ID })
    );

    const result = await LeadgenEventIngestionService.recordEmailSubmission({
      sessionId: SESSION_ID,
      auditId: OTHER_AUDIT_ID,
      email: "synthetic@example.com",
      source: "fab-email-notify",
    });

    expect(result).toEqual({
      status: 409,
      body: { ok: false, error: "audit_id_conflict" },
    });
    expect(LeadgenEventModel.insertRow).not.toHaveBeenCalled();
    expect(LeadgenSessionModel.patchById).not.toHaveBeenCalled();
  });

  it("rolls back both email events if the multi-table write fails", async () => {
    const eventRows: string[] = [];
    vi.spyOn(LeadgenSessionModel, "findByIdForUpdate").mockResolvedValue(
      makeSession()
    );
    vi.mocked(LeadgenSessionModel.transaction).mockImplementation(
      async (callback) => {
        const snapshot = [...eventRows];
        try {
          return await callback(trx);
        } catch (error) {
          eventRows.splice(0, eventRows.length, ...snapshot);
          throw error;
        }
      }
    );
    vi.mocked(LeadgenEventModel.insertRow).mockImplementation(async (row) => {
      const eventName = String(row.event_name);
      if (eventName === "email_submitted") {
        throw new Error("synthetic second insert failure");
      }
      eventRows.push(eventName);
    });

    await expect(
      LeadgenEventIngestionService.recordEmailSubmission({
        sessionId: SESSION_ID,
        auditId: AUDIT_ID,
        email: "synthetic@example.com",
        source: "paywall",
      })
    ).rejects.toThrow("synthetic second insert failure");
    expect(eventRows).toEqual([]);
    expect(LeadgenSessionModel.patchById).not.toHaveBeenCalled();
  });
});
