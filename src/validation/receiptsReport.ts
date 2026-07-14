import { z } from "zod";

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

const isoDateSchema = z.string().refine(isCalendarDate, {
  message: "Expected a valid ISO date in YYYY-MM-DD format.",
});

export const receiptsReportParamsSchema = z
  .object({
    organizationId: z.coerce.number().int().positive(),
  })
  .strict();

export const receiptsReportQuerySchema = z
  .object({
    startDate: isoDateSchema,
    endDate: isoDateSchema,
  })
  .strict()
  .refine((range) => range.startDate <= range.endDate, {
    message: "startDate must be before or equal to endDate.",
    path: ["endDate"],
  });

export type ReceiptsReportParams = z.infer<
  typeof receiptsReportParamsSchema
>;

export type ReceiptsReportQuery = z.infer<
  typeof receiptsReportQuerySchema
>;
