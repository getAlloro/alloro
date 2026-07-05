/**
 * OAuth finish route (/auth/google/finish).
 *
 * The backend callback minted the JWT, set the non-httpOnly `auth_token`
 * cookie, and redirected here. This page copies that cookie into localStorage
 * via the normal session helpers (so getCommonHeaders picks it up), then sends
 * the user on — /admin for the admin flow. On `?error=` it shows the reason and
 * a way back to the login. No token is ever passed in the URL.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, ShieldAlert } from "lucide-react";
import { setAuthSession, setSharedAuthCookie } from "../api";

function readCookie(name: string): string | null {
  const target = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

const ERROR_COPY: Record<string, string> = {
  AUTH_DOMAIN_FORBIDDEN: "That Google account isn't a @getalloro.com account.",
  AUTH_EMAIL_UNVERIFIED: "Use your @getalloro.com Google account to sign in.",
  AUTH_NOT_CONFIGURED: "Google sign-in isn't configured yet. Contact an admin.",
  AUTH_NO_SESSION: "Sign-in didn't complete. Please try again.",
  AUTH_STATE_MISSING: "Sign-in expired. Please try again.",
  AUTH_STATE_MISMATCH: "Sign-in couldn't be verified. Please try again.",
  AUTH_FAILED: "Sign-in failed. Please try again.",
};

export default function AuthGoogleFinish() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flow = params.get("flow") || "admin";
    const err = params.get("error");

    if (err) {
      setError(err);
      return;
    }

    const token = readCookie("auth_token");
    if (!token) {
      setError("AUTH_NO_SESSION");
      return;
    }

    setAuthSession({ token });
    setSharedAuthCookie(token);

    // Let other tabs know a login happened (mirrors AdminLogin's prior behavior).
    try {
      const channel = new BroadcastChannel("auth_channel");
      channel.postMessage({ type: "login", token });
      channel.close();
    } catch {
      // BroadcastChannel not supported — non-fatal.
    }

    window.location.replace(flow === "admin" ? "/admin" : "/dashboard");
  }, []);

  const backHref = "/admin";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <motion.div
        className="w-full max-w-md rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        {error ? (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <ShieldAlert className="h-7 w-7 text-red-500" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">
              Couldn't sign you in
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {ERROR_COPY[error] || "Sign-in failed. Please try again."}
            </p>
            <a
              href={backHref}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-alloro-orange px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-alloro-orange/90"
            >
              Back to sign in
            </a>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-alloro-orange/10">
              <Loader2 className="h-7 w-7 animate-spin text-alloro-orange" />
            </div>
            <h1 className="text-lg font-semibold text-gray-900">
              Signing you in…
            </h1>
            <p className="mt-1 text-sm text-gray-500">One moment.</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
