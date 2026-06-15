/**
 * Unit tests — validate() request-validation middleware.
 *
 * This middleware is cross-cutting (every guarded route mounts it), so the two
 * load-bearing guarantees are asserted directly here rather than only through a
 * route smoke test:
 *   • warn mode  — never rejects; logs would-be misses; passes the request on,
 *                  and the warn log carries field NAMES + issue codes only,
 *                  never values (redaction).
 *   • enforce mode — rejects with the canonical
 *                  { success:false, data:null, error:{ code, message, details } }
 *                  contract shape at HTTP 400; passes valid input through with
 *                  the parsed/coerced value applied.
 *   • never throws — even when schema.safeParse itself blows up, the middleware
 *                  falls through (warn) or returns the standard 400 (enforce).
 *
 * A throwaway Express app is built per case (no app.ts dependency) so the
 * middleware is exercised in isolation. Mirrors the Vitest + supertest + zod
 * style of the existing smoke suite.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";
import request from "supertest";
import { z } from "zod";
import { validate, VALIDATION_ERROR } from "../middleware/validate";
// validate() now logs through the shared Pino logger (the console.* → logger
// codemod). Spy on the logger's methods rather than console.* — the middleware
// uses pino's merge-object form: logger.warn(meta, msg) / logger.error(meta, msg).
import logger from "../lib/logger";

/** Build a one-route app mounting validate() with the given schema/options. */
function makeApp(
  schema: Parameters<typeof validate>[0],
  options?: Parameters<typeof validate>[1],
  method: "post" | "get" = "post",
  path = "/t",
) {
  const app = express();
  app.use(express.json());
  const handler = (_req: express.Request, res: express.Response) =>
    res.status(200).json({ ok: true, received: _req.body, query: _req.query });
  app[method](path, validate(schema, options), handler);
  return app;
}

const bodySchema = z.object({ email: z.string().email(), age: z.number().optional() });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("validate() — warn mode (default)", () => {
  it("passes a VALID body through to the handler (200)", async () => {
    const app = makeApp(bodySchema, { mode: "warn" });
    const res = await request(app).post("/t").send({ email: "a@b.com" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("passes an INVALID body through anyway (200) and does NOT reject", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const app = makeApp(bodySchema, { mode: "warn" });
    const res = await request(app).post("/t").send({ email: "not-an-email" });

    expect(res.status).toBe(200); // warn never rejects
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it("redaction: warn log carries field names + issue codes, NEVER values", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const app = makeApp(bodySchema, { mode: "warn" });

    const secret = "super-secret-value@nope";
    await request(app).post("/t").send({ email: secret });

    // Pino merge-object form: logger.warn(meta, msg) — meta is the FIRST arg.
    const [meta] = warnSpy.mock.calls[0] as [Record<string, unknown>, string];
    expect(meta.fields).toContain("email");
    expect(Array.isArray(meta.issues)).toBe(true);
    // The offending VALUE must not appear anywhere in the logged metadata.
    expect(JSON.stringify(meta)).not.toContain(secret);
  });

  it("defaults to warn when no mode is given (env not enforcing in tests)", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const app = makeApp(bodySchema); // no options at all
    const res = await request(app).post("/t").send({ email: "bad" });
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("validate() — enforce mode", () => {
  it("rejects an INVALID body with 400 + canonical contract shape", async () => {
    const app = makeApp(bodySchema, { mode: "enforce" });
    const res = await request(app).post("/t").send({ email: "nope" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: VALIDATION_ERROR },
    });
    expect(typeof res.body.error.message).toBe("string");
    // details carry field names + issue codes, not values.
    expect(res.body.error.details.fields).toContain("email");
  });

  it("does NOT leak the offending value in the 400 response", async () => {
    const app = makeApp(bodySchema, { mode: "enforce" });
    const secret = "leak-me@please";
    const res = await request(app).post("/t").send({ email: secret });
    expect(JSON.stringify(res.body)).not.toContain(secret);
  });

  it("passes a VALID body through (200) and applies the parsed value", async () => {
    const coercing = z.object({ n: z.coerce.number() });
    const app = makeApp(coercing, { mode: "enforce" });
    const res = await request(app).post("/t").send({ n: "42" });
    expect(res.status).toBe(200);
    expect(res.body.received.n).toBe(42); // coerced string → number
  });
});

describe("validate() — targets", () => {
  it("validates params (warn-only) without rejecting", async () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    const app = express();
    const schema = z.object({ id: z.coerce.number().int().positive() });
    app.get(
      "/item/:id",
      validate(schema, { target: "params", mode: "warn" }),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    const res = await request(app).get("/item/not-a-number");
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("enforces on params and 400s an invalid value", async () => {
    const app = express();
    const schema = z.object({ id: z.coerce.number().int().positive() });
    app.get(
      "/item/:id",
      validate(schema, { target: "params", mode: "enforce" }),
      (_req, res) => res.status(200).json({ ok: true }),
    );
    const res = await request(app).get("/item/abc");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(VALIDATION_ERROR);
  });
});

describe("validate() — never throws", () => {
  it("falls through in warn mode when safeParse itself throws", async () => {
    const errSpy = vi.spyOn(logger, "error").mockImplementation(() => logger);
    // A schema-like object whose safeParse throws — simulates an internal blow-up.
    const exploding = {
      safeParse: () => {
        throw new Error("boom");
      },
    } as unknown as Parameters<typeof validate>[0];

    const app = makeApp(exploding, { mode: "warn" });
    const res = await request(app).post("/t").send({ anything: 1 });

    expect(res.status).toBe(200); // fell through, did not 500
    expect(errSpy).toHaveBeenCalled();
  });

  it("returns the standard 400 in enforce mode when safeParse throws", async () => {
    vi.spyOn(logger, "error").mockImplementation(() => logger);
    const exploding = {
      safeParse: () => {
        throw new Error("boom");
      },
    } as unknown as Parameters<typeof validate>[0];

    const app = makeApp(exploding, { mode: "enforce" });
    const res = await request(app).post("/t").send({ anything: 1 });

    expect(res.status).toBe(400); // standard contract, not an unhandled 500
    expect(res.body).toMatchObject({
      success: false,
      data: null,
      error: { code: VALIDATION_ERROR },
    });
  });
});
