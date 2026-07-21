/**
 * §11.6 pagination helpers for the proof-receipt domain — the list endpoint
 * returns the standard meta shape { page, limit, total, totalPages }.
 * Domain-local copy of the admin-os helper (per §6.3, domains keep their own
 * feature-utils rather than importing across domains).
 *
 * Query values are parsed here, not trusted from zod-coerced req.query:
 * Express 5's req.query is a read-only getter, so the validate() middleware
 * cannot write parsed values back. The schema rejects bad input at the
 * boundary; this parser turns the surviving raw strings into safe integers.
 */

import {
  PROOF_RECEIPT_LIMIT_DEFAULT,
  PROOF_RECEIPT_LIMIT_MAX,
  PROOF_RECEIPT_PAGE_DEFAULT,
} from "../../../validation/proofReceipt.schemas";

export interface ProofReceiptPaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export interface ProofReceiptPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/** Parse + clamp page/limit query strings into safe integers. */
export function parseProofReceiptPagination(
  page?: unknown,
  limit?: unknown
): ProofReceiptPaginationParams {
  const pageParsed = Number.parseInt(String(page ?? ""), 10);
  const limitParsed = Number.parseInt(String(limit ?? ""), 10);

  const safePage =
    Number.isInteger(pageParsed) && pageParsed >= 1
      ? pageParsed
      : PROOF_RECEIPT_PAGE_DEFAULT;
  const safeLimit =
    Number.isInteger(limitParsed) && limitParsed >= 1
      ? Math.min(limitParsed, PROOF_RECEIPT_LIMIT_MAX)
      : PROOF_RECEIPT_LIMIT_DEFAULT;

  return {
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}

/**
 * Build the §11.6 meta object from a total count + current params.
 * totalPages floors at 1 so an empty result still reports a coherent page count.
 */
export function buildProofReceiptPaginationMeta(
  total: number,
  page: number,
  limit: number
): ProofReceiptPaginationMeta {
  return {
    page,
    limit,
    total,
    totalPages: Math.max(Math.ceil(total / limit), 1),
  };
}
