export const PAGE_SIZE = 10;

export const APP_URL =
  process.env.NODE_ENV === "production"
    ? "https://app.getalloro.com"
    : "http://localhost:5174";

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const ALLOWED_MIME_TYPES = [
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

export const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"];

export type PmsStatus = "pending" | "error" | "completed" | string;
