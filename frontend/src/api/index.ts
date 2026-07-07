import axios, {
  isAxiosError,
  type AxiosProgressEvent,
  type ResponseType,
} from "axios";
import { getPriorityItem } from "../hooks/useLocalStorage";
import { logger } from "../lib/logger";
import { decodeJwtUserId } from "../utils/jwt";
import {
  getEmbeddedPilotSession,
  isEmbeddedPilotSession,
  updateEmbeddedPilotToken,
} from "../utils/embeddedPilotSession";

// Re-exported so components use the axios error type-guard via the client (§14.2)
// instead of importing "axios" directly.
export { isAxiosError } from "axios";

/**
 * ApiError — carries a backend error `code` and HTTP `status` alongside the
 * message. Thrown by {@link unwrap} so callers (React Query, try/catch) can
 * surface real failures instead of inspecting a `{ success:false }` envelope.
 * Part of the T4 error-contract unification (code-constitution §17.x).
 */
export class ApiError extends Error {
  readonly code?: string;
  readonly status?: number;
  constructor(message: string, opts?: { code?: string; status?: number }) {
    super(message);
    this.name = "ApiError";
    this.code = opts?.code;
    this.status = opts?.status;
  }
}

interface ApiEnvelope {
  success?: boolean;
  successful?: boolean;
  /** Legacy endpoints send a string; canonical §8.1 endpoints send { code, message, details } */
  error?: string | { code?: string; message?: string; details?: unknown } | null;
  errorMessage?: string;
  errorCode?: string;
  message?: string;
  data?: unknown;
}

/**
 * unwrap — opt-in error-contract helper for the per-domain T4 migration.
 * Pass the result of an `api*` helper: throws an {@link ApiError} when the
 * envelope signals failure (`success:false` / `successful:false`), otherwise
 * returns the payload (the `data` field when present, else the raw body).
 *
 * This lets a single domain adopt throw-on-error WITHOUT changing the shared
 * `api*` primitives, which keep their swallow behavior for un-migrated domains.
 */
export function unwrap<T>(res: unknown): T {
  const env = (res ?? {}) as ApiEnvelope;
  if (env.success === false || env.successful === false) {
    // Canonical endpoints nest { code, message } under error; legacy ones use strings
    const errObj =
      typeof env.error === "object" && env.error !== null ? env.error : null;
    const message =
      errObj?.message ||
      (typeof env.error === "string" ? env.error : "") ||
      env.errorMessage ||
      env.message ||
      "Request failed";
    throw new ApiError(message, { code: errObj?.code || env.errorCode });
  }
  return (env.data !== undefined ? env.data : res) as T;
}

// Prefer environment-configured API base; default to relative "/api" so Vite dev proxy handles CORS in development.
// Define VITE_API_URL in .env for deployments that need an absolute URL.
const api = import.meta.env.VITE_API_URL ?? "/api";

export function isPilotSession(): boolean {
  if (isEmbeddedPilotSession()) return true;

  return (
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"))
  );
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const embeddedPilotToken = getEmbeddedPilotSession()?.token;
  if (embeddedPilotToken) return embeddedPilotToken;

  if (isPilotSession()) {
    return window.sessionStorage.getItem("token");
  }
  return getPriorityItem("auth_token") || getPriorityItem("token");
}

export function setAuthSession({
  token,
  role,
  organizationId,
}: {
  token: string;
  role?: string | null;
  organizationId?: string | number | null;
}): void {
  window.localStorage.setItem("auth_token", token);
  if (role) {
    window.localStorage.setItem("user_role", role);
  }
  if (organizationId !== undefined && organizationId !== null) {
    window.localStorage.setItem("organization_id", String(organizationId));
  }
}

export function clearAuthSession(): void {
  window.localStorage.removeItem("auth_token");
  window.localStorage.removeItem("user_role");
  window.localStorage.removeItem("organization_id");
}

export function setSharedAuthCookie(token: string): void {
  const isProduction = window.location.hostname.includes("getalloro.com");
  const domain = isProduction ? "; domain=.getalloro.com" : "";
  document.cookie = `auth_token=${token}; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax${domain}`;
}

export function clearSharedAuthCookie(): void {
  const isProduction = window.location.hostname.includes("getalloro.com");
  const domain = isProduction ? "; domain=.getalloro.com" : "";
  document.cookie = `auth_token=; path=/; max-age=0${domain}`;
}

/**
 * Helper function to get common headers for API requests.
 * JWT is the sole authentication mechanism — sent via Authorization header.
 *
 * In pilot mode the sessionStorage token must be used exclusively.
 * localStorage is shared across same-origin windows, so without this
 * guard the admin's auth_token bleeds into the pilot window.
 */
export const getCommonHeaders = (): Record<string, string> => {
  const headers: Record<string, string> = {};
  const jwt = getAuthToken();

  if (jwt) {
    headers.Authorization = `Bearer ${jwt}`;
  }

  return headers;
};

/**
 * adminFetch — the shared authed fetch wrapper. Attaches the JWT (via
 * getCommonHeaders) without overriding caller-set headers, then returns the raw
 * Response so the caller keeps full control of status / streaming handling (and
 * throws on !response.ok as it sees fit). Replaces the byte-identical helper that
 * was copy-pasted across ~11 api/ domain files (code-constitution §14.2 + §4.3).
 */
export const adminFetch = (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const headers = new Headers(init.headers);
  Object.entries(getCommonHeaders()).forEach(([key, value]) => {
    if (!headers.has(key)) headers.set(key, value);
  });
  return fetch(input, { ...init, headers });
};

export const headExternalResource = (url: string): Promise<Response> =>
  fetch(url, { method: "HEAD" });

/**
 * normalizeApiFailure — collapse any caught request error into the shared
 * failure envelope so the §16.1 error-contract holds: `unwrap()` throws on it and
 * `.success`/`.successful` checks see a failure. Without this, a raw non-envelope
 * error body (a 500 proxy-error string, an HTML page) flowed straight through
 * `unwrap()` as if it were data and crashed array consumers (`x.map is not a function`).
 */
function normalizeApiFailure(err: unknown): ApiEnvelope {
  if (isAxiosError(err) && err.response?.data) {
    const body = err.response.data;
    // Backend already returned a recognized { success | successful } envelope —
    // preserve its code/message so unwrap() throws with the real reason.
    if (typeof body === "object" && ("success" in body || "successful" in body)) {
      return body as ApiEnvelope;
    }
  }
  // No response, or a non-envelope body (raw 500 text, HTML, proxy error): return
  // a safe generic failure. The raw body is logged by the caller, never surfaced
  // to the UI (§3.4 — no internal leakage).
  const status = isAxiosError(err) ? err.response?.status : undefined;
  return {
    success: false,
    successful: false,
    error: "An error occurred. Please try again.",
    errorMessage: "An error occurred. Please try again.",
    ...(status ? { errorCode: `HTTP_${status}` } : {}),
  };
}

export async function apiGet({
  path,
  token,
}: {
  path: string;
  token?: string;
}) {
  try {
    const headers = getCommonHeaders();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const { data } = await axios.get(api + path, {
      headers,
    });
    return data;
  } catch (err: unknown) {
    logger.log(err);
    return normalizeApiFailure(err);
  }
}

export async function apiPost({
  path,
  passedData = {},
  responseType = "json",
  additionalHeaders,
  token,
}: {
  path: string;
  passedData?: object | FormData;
  responseType?: ResponseType;
  additionalHeaders?: {
    Accept?: string;
    [key: string]: string | undefined;
  };
  token?: string;
}) {
  try {
    // Handle FormData differently - don't set Content-Type for FormData
    const isFormData = passedData instanceof FormData;

    // Start with common headers
    const headers: Record<string, string> = getCommonHeaders();

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    // Only add additional headers if they exist and aren't Content-Type for FormData
    if (additionalHeaders) {
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        if (value && !(isFormData && key.toLowerCase() === "content-type")) {
          headers[key] = value;
        }
      });
    }

    // For non-FormData, set default Content-Type if not provided
    if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const { data } = await axios.post(api + path, passedData, {
      responseType,
      headers,
    });
    return data;
  } catch (err: unknown) {
    logger.log(err);
    return normalizeApiFailure(err);
  }
}

export async function apiPostWithProgress({
  path,
  passedData = {},
  additionalHeaders,
  onUploadProgress,
}: {
  path: string;
  passedData?: object | FormData;
  additionalHeaders?: {
    Accept?: string;
    [key: string]: string | undefined;
  };
  onUploadProgress?: (event: AxiosProgressEvent) => void;
}) {
  try {
    const isFormData = passedData instanceof FormData;
    const headers: Record<string, string> = getCommonHeaders();

    if (additionalHeaders) {
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        if (value && !(isFormData && key.toLowerCase() === "content-type")) {
          headers[key] = value;
        }
      });
    }

    if (!isFormData && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    const { data } = await axios.post(api + path, passedData, {
      headers,
      onUploadProgress,
    });
    return data;
  } catch (err: unknown) {
    logger.log(err);
    return normalizeApiFailure(err);
  }
}

export async function apiPatch({
  path,
  passedData = {},
  additionalHeaders,
}: {
  path: string;
  passedData?: object;
  additionalHeaders?: {
    Accept?: string;
    [key: string]: string | undefined;
  };
}) {
  try {
    // Start with common headers
    const headers: Record<string, string> = {
      ...getCommonHeaders(),
      "Content-Type": "application/json",
    };

    if (additionalHeaders) {
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        if (value) {
          headers[key] = value;
        }
      });
    }

    const { data } = await axios.patch(api + path, passedData, {
      headers,
    });
    return data;
  } catch (err: unknown) {
    logger.log(err);
    return normalizeApiFailure(err);
  }
}

export async function apiPut({
  path,
  passedData = {},
  additionalHeaders,
}: {
  path: string;
  passedData?: object;
  additionalHeaders?: {
    Accept?: string;
    [key: string]: string | undefined;
  };
}) {
  try {
    // Start with common headers
    const headers: Record<string, string> = {
      ...getCommonHeaders(),
      "Content-Type": "application/json",
    };

    if (additionalHeaders) {
      Object.entries(additionalHeaders).forEach(([key, value]) => {
        if (value) {
          headers[key] = value;
        }
      });
    }

    const { data } = await axios.put(api + path, passedData, {
      headers,
    });
    return data;
  } catch (err: unknown) {
    logger.log(err);
    return normalizeApiFailure(err);
  }
}

export async function apiDelete({ path }: { path: string }) {
  try {
    const { data } = await axios.delete(api + path, {
      headers: getCommonHeaders(),
    });

    return data;
  } catch (err: unknown) {
    logger.log(err);
    return normalizeApiFailure(err);
  }
}

// ─── Global Response Interceptors ───

// Track whether we've already fired the session-expired event this page session.
// Prevents multiple modals when several API calls 403 simultaneously.
let sessionExpiredFired = false;

/**
 * Sliding session refresh: when the backend re-issues a token (past half-life),
 * it returns it in the x-session-refresh header. Persist it transparently to the
 * same store getCommonHeaders() reads from — sessionStorage in pilot mode, else
 * localStorage — so the next request rides the fresh token.
 */
export const storeRefreshedToken = (headers: unknown) => {
  const refreshed = (headers as Record<string, string> | undefined)?.[
    "x-session-refresh"
  ];
  if (!refreshed) return;

  // A sliding refresh may only EXTEND the current session, never change who it
  // belongs to. Compare the re-issued token against the token currently in the
  // store we would write to; if they are not the same user (or there is no
  // current session), drop it. This stops an in-flight request from a previous
  // identity re-persisting its token over a freshly-established session — the
  // SSO login clobber (plans/07082026-google-login-session-clobber).
  const refreshedUserId = decodeJwtUserId(refreshed);
  if (refreshedUserId === null) return;

  if (isEmbeddedPilotSession()) {
    const current = getEmbeddedPilotSession()?.token ?? null;
    if (decodeJwtUserId(current) !== refreshedUserId) return;
    updateEmbeddedPilotToken(refreshed);
  } else if (isPilotSession()) {
    const current = window.sessionStorage.getItem("token");
    if (decodeJwtUserId(current) !== refreshedUserId) return;
    window.sessionStorage.setItem("token", refreshed);
  } else {
    const current = window.localStorage.getItem("auth_token");
    if (decodeJwtUserId(current) !== refreshedUserId) return;
    window.localStorage.setItem("auth_token", refreshed);
  }
};

axios.interceptors.response.use(
  (response) => {
    storeRefreshedToken(response?.headers);
    return response;
  },
  (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data;

    storeRefreshedToken(error?.response?.headers);

    // 402 — billing lockout (existing)
    if (status === 402 && data?.errorCode === "ACCOUNT_LOCKED") {
      window.dispatchEvent(new CustomEvent("billing:locked-out"));
    }

    // 403 — expired/invalid JWT → prompt re-login
    if (
      status === 403 &&
      data?.error === "Invalid or expired token" &&
      !sessionExpiredFired
    ) {
      sessionExpiredFired = true;
      window.dispatchEvent(new CustomEvent("session:expired"));
    }

    return Promise.reject(error);
  }
);
