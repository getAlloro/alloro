import axios, { isAxiosError, type ResponseType } from "axios";
import { getPriorityItem } from "../hooks/useLocalStorage";
import { logger } from "../lib/logger";

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
  error?: string;
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
    throw new ApiError(
      env.error || env.errorMessage || env.message || "Request failed",
      { code: env.errorCode },
    );
  }
  return (env.data !== undefined ? env.data : res) as T;
}

// Prefer environment-configured API base; default to relative "/api" so Vite dev proxy handles CORS in development.
// Define VITE_API_URL in .env for deployments that need an absolute URL.
const api = import.meta.env.VITE_API_URL ?? "/api";

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

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  let jwt: string | null = null;

  if (isPilot) {
    // Pilot mode — use ONLY the sessionStorage token, never localStorage
    jwt = window.sessionStorage.getItem("token");
  } else {
    // Normal mode — auth_token (email/password) with getPriorityItem fallback
    jwt = getPriorityItem("auth_token") || getPriorityItem("token");
  }

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
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }
    return {
      successful: false,
      errorMessage: "An error occurred. Please try again.",
    };
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
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }
    return {
      successful: false,
      errorMessage: "An error occurred. Please try again.",
    };
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
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }
    return {
      successful: false,
      errorMessage: "An error occurred. Please try again.",
    };
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
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }
    return {
      successful: false,
      errorMessage: "An error occurred. Please try again.",
    };
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
    if (isAxiosError(err) && err.response?.data) {
      return err.response.data;
    }
    return {
      successful: false,
      errorMessage: "An error occurred. Please try again.",
    };
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
const storeRefreshedToken = (headers: unknown) => {
  const refreshed = (headers as Record<string, string> | undefined)?.[
    "x-session-refresh"
  ];
  if (!refreshed) return;

  const isPilot =
    typeof window !== "undefined" &&
    (window.sessionStorage?.getItem("pilot_mode") === "true" ||
      !!window.sessionStorage?.getItem("token"));

  if (isPilot) {
    window.sessionStorage.setItem("token", refreshed);
  } else {
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
