import { getEmbeddedPilotStorageItem } from "../utils/embeddedPilotSession";

export function getItem(key: string): string | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage.getItem(key);
  }
  return null;
}

/**
 * Gets an item from storage with priority: sessionStorage first, then localStorage
 * This enables pilot mode to use sessionStorage while normal sessions use localStorage
 */
export function getPriorityItem(key: string): string | null {
  if (typeof window === "undefined") return null;

  const embeddedPilotValue = getEmbeddedPilotStorageItem(key);
  if (embeddedPilotValue !== null) {
    return embeddedPilotValue;
  }

  // Check sessionStorage first (pilot mode)
  const sessionValue = window.sessionStorage?.getItem(key);
  if (sessionValue !== null && sessionValue !== undefined) {
    return sessionValue;
  }
  // Fall back to localStorage (normal mode)
  return window.localStorage?.getItem(key) || null;
}
