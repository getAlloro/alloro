const DEFAULT_CLARITY_PROJECT_ID = "x37aveg4i1";
const DEFAULT_CLARITY_PROJECT_URL =
  "https://clarity.microsoft.com/projects/view/x37aveg4i1/dashboard";
const CLARITY_SCRIPT_ID = "alloro-clarity-script";

type ClarityFunction = ((...args: unknown[]) => void) & {
  q?: unknown[][];
};

declare global {
  interface Window {
    clarity?: ClarityFunction;
  }
}

export const CLARITY_PROJECT_ID = sanitizeProjectId(
  getEnvString(
    import.meta.env.VITE_CLARITY_PROJECT_ID,
    DEFAULT_CLARITY_PROJECT_ID,
  ),
);

export const CLARITY_PROJECT_URL = getEnvString(
  import.meta.env.VITE_CLARITY_PROJECT_URL,
  DEFAULT_CLARITY_PROJECT_URL,
);

export function isClarityMonitoringConfigured(): boolean {
  return CLARITY_PROJECT_ID.length > 0 && CLARITY_PROJECT_URL.length > 0;
}

export function ensureClarityScript(): void {
  if (!isClarityMonitoringConfigured()) return;
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (!window.clarity) {
    const clarityQueue: ClarityFunction = (...args: unknown[]) => {
      clarityQueue.q = clarityQueue.q || [];
      clarityQueue.q.push(args);
    };
    window.clarity = clarityQueue;
  }

  if (document.getElementById(CLARITY_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = CLARITY_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.clarity.ms/tag/${CLARITY_PROJECT_ID}`;

  const firstScript = document.getElementsByTagName("script")[0];
  if (firstScript?.parentNode) {
    firstScript.parentNode.insertBefore(script, firstScript);
    return;
  }

  document.head.appendChild(script);
}

export function setClarityTag(key: string, value: string): void {
  if (!window.clarity || !value) return;
  window.clarity("set", key, value);
}

export function recordClarityEvent(eventName: string): void {
  if (!window.clarity) return;
  window.clarity("event", eventName);
}

function sanitizeProjectId(value: string): string {
  const trimmed = value.trim();
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? trimmed : "";
}

function getEnvString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}
