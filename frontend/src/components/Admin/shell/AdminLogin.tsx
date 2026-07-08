import { useState } from "react";
import { motion } from "framer-motion";
import { Shield } from "lucide-react";
import { startAdminGoogleLogin } from "../../../api/auth-sso";

/**
 * Admin sign-in — Google SSO only (plans/07052026-google-sso-admin-and-user-login).
 * The OTP email/code flow was retired; admin access requires a verified
 * @getalloro.com Google account. Any error from the OAuth round-trip arrives
 * here as `?error=<code>` (the finish page redirects failures back to /admin).
 */

const ERROR_COPY: Record<string, string> = {
  AUTH_DOMAIN_FORBIDDEN: "That Google account isn't a @getalloro.com account.",
  AUTH_EMAIL_UNVERIFIED: "Use your @getalloro.com Google account to sign in.",
  AUTH_NOT_CONFIGURED: "Google sign-in isn't configured yet.",
  AUTH_FAILED: "Sign-in failed. Please try again.",
};

function GoogleGlyph() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.24 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.29 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

export function AdminLogin() {
  const [loading, setLoading] = useState(false);
  const error =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("error")
      : null;

  const handleGoogleSignIn = () => {
    setLoading(true);
    startAdminGoogleLogin();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
      >
        {/* Logo and Brand */}
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <motion.img
            src="/logo.png"
            alt="Alloro Logo"
            className="mx-auto mb-4 h-16 w-16 rounded-2xl shadow-lg"
            whileHover={{ scale: 1.05 }}
          />
          <h1 className="text-2xl font-bold text-gray-900">
            <span className="text-alloro-orange">Alloro</span> Admin
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Sign in to access the control panel
          </p>
        </motion.div>

        {/* Card */}
        <motion.div
          className="rounded-2xl border border-gray-100 bg-white p-8 shadow-xl"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-alloro-orange/20 to-alloro-orange/10">
              <Shield className="h-7 w-7 text-alloro-orange" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              Sign in with your Alloro account
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Admin access requires a <b>@getalloro.com</b> Google account.
            </p>
          </div>

          {error && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-center text-sm text-red-700">
              {ERROR_COPY[error] || "Sign-in failed. Please try again."}
            </div>
          )}

          <motion.button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 text-base font-semibold text-gray-700 shadow-sm transition-all hover:bg-gray-50 focus:outline-none focus:ring-4 focus:ring-alloro-orange/20 disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <GoogleGlyph />
            {loading ? "Redirecting…" : "Sign in with Google"}
          </motion.button>
        </motion.div>

        {/* Footer */}
        <motion.div
          className="mt-6 text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
            <Shield className="h-3.5 w-3.5" />
            Protected by Alloro Security
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
