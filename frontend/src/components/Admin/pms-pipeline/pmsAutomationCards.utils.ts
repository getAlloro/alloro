import { getErrorMessage } from "../../../lib/errorMessage";
import type { StatusFilter } from "./pmsAutomationCards.types";

export const STATUS_LABELS: Record<StatusFilter, string> = {
  all: "All Jobs",
  pending: "Pending",
  waiting_for_approval: "Waiting for Approval",
  approved: "Approved",
  completed: "Completed",
  error: "Error",
};

export const STATUS_STYLES: Record<string, string> = {
  pending: "bg-gray-200 text-gray-700 border-gray-300",
  waiting_for_approval: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
  error: "bg-red-100 text-red-700 border-red-200",
};

export const STATUS_OPTIONS: StatusFilter[] = [
  "all",
  "pending",
  "waiting_for_approval",
  "approved",
  "completed",
  "error",
];


export const APPROVAL_TEXT: Record<"locked" | "pending", string> = {
  locked: "Approved",
  pending: "Needs approval",
};

export const POLL_INTERVAL_MS = 2000;

export const formatTimeElapsed = (value: number | null): string => {
  if (!value && value !== 0) {
    return "—";
  }

  if (value < 60) {
    return `${value}s`;
  }

  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
};

export const formatTimestamp = (value: string): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
};

export const serializeResponse = (value: unknown): string => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return "";
    }
    try {
      return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
      return value;
    }
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const validateJson = (value: string): string | undefined => {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    JSON.parse(trimmed);
    return undefined;
  } catch (error: unknown) {
    return getErrorMessage(error) || "Invalid JSON";
  }
};
