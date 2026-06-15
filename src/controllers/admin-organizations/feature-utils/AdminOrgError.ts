/**
 * AdminOrgError
 *
 * Typed error carrying the EXACT HTTP status + response body that a service
 * wants the controller to emit. Lets feature-services own validation/guard
 * failures while keeping byte-identical response shapes at the controller edge.
 *
 * The controller's catch does: res.status(err.statusCode).json(err.body).
 */
export class AdminOrgError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: Record<string, unknown>
  ) {
    super(
      typeof body?.message === "string"
        ? (body.message as string)
        : typeof body?.error === "string"
          ? (body.error as string)
          : "Admin organization error"
    );
    this.name = "AdminOrgError";
  }
}

/** Type guard for the controller catch blocks. */
export function isAdminOrgError(error: unknown): error is AdminOrgError {
  return error instanceof AdminOrgError;
}
