export class PmsParserError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
    public details: Record<string, unknown> | null = null
  ) {
    super(message);
    this.name = "PmsParserError";
  }
}
