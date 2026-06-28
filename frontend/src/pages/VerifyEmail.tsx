import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, CheckCircle2 } from "lucide-react";
import authPassword from "../api/auth-password";
import { setAuthSession } from "../api";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const email = location.state?.email || searchParams.get("email") || "";

  const [code, setCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Redirect to signup if no email is available
  useEffect(() => {
    if (!email) {
      navigate("/signup", { replace: true });
    }
  }, [email, navigate]);

  // Cooldown timer for resend button
  useEffect(() => {
    if (cooldown <= 0) return;

    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [cooldown]);

  const handleVerify = async () => {
    if (code.length !== 6 || isLoading) return;

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      // Pull leadgen tracking id (set on /signup if user came from leadgen
      // tool's "Create Free Account" CTA). Fall back to URL `?ls=` if for
      // any reason it wasn't persisted on Signup mount. Used by the backend
      // to link this new account back to the pre-signup leadgen session.
      let leadgenSessionId: string | undefined;
      try {
        const stored = window.localStorage.getItem("leadgen_session_id");
        if (
          stored &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            stored,
          )
        ) {
          leadgenSessionId = stored;
        }
      } catch {
        // localStorage may be blocked — silently degrade.
      }
      if (!leadgenSessionId) {
        const fromUrl = searchParams.get("ls");
        if (
          fromUrl &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            fromUrl,
          )
        ) {
          leadgenSessionId = fromUrl;
        }
      }

      const response = await authPassword.verifyEmail(
        email,
        code,
        leadgenSessionId,
      );

      if (response.success) {
        // Clear stale onboarding state from any previous session
        localStorage.removeItem("onboardingCompleted");
        localStorage.removeItem("hasProperties");
        // Single-use credential — drop after consume so it can't bleed into
        // a different account/session later.
        localStorage.removeItem("leadgen_session_id");

        setAuthSession({ token: response.token, role: response.user?.role });

        setMessage("Success! Redirecting...");
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 800);
      } else {
        setError(response.error || "Invalid verification code");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || isLoading) return;

    setError("");
    setMessage("");

    try {
      const response = await authPassword.resendVerification(email);

      if (response.success) {
        setMessage("Verification code resent. Check your inbox.");
        setCooldown(60);
      } else {
        setError(response.error || "Failed to resend code");
      }
    } catch {
      setError("An error occurred. Please try again.");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  if (!email) return null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-alloro-bg font-body">
      <div className="max-w-md w-full">
        {/* Main Card */}
        <div className="relative p-8 rounded-2xl bg-white border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-14 h-14 rounded-xl shadow-lg shadow-blue-900/20"
            />
          </div>

          {/* Heading */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold font-heading text-alloro-navy tracking-tight mb-2">
              Verify your email
            </h1>
            <p className="text-slate-500 text-sm">
              Enter the 6-digit code sent to{" "}
              <span className="text-alloro-orange font-semibold">{email}</span>
            </p>
          </div>

          {/* Error/Success Messages */}
          <AnimatePresence mode="wait">
            {(error || message) && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className={`mb-4 p-3 rounded-lg text-center text-sm ${
                  error
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : "bg-green-50 text-green-700 border border-green-200"
                }`}
              >
                {error || message}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Verification Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div>
              <label
                htmlFor="verification-code"
                className="block text-sm font-medium text-alloro-navy mb-2"
              >
                Verification Code
              </label>
              <input
                id="verification-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(value);
                  if (value.length === 6) {
                    setTimeout(() => {
                      if (!isLoading) {
                        handleVerify();
                      }
                    }, 300);
                  }
                }}
                onKeyPress={handleKeyPress}
                placeholder="000000"
                maxLength={6}
                className="w-full px-4 py-4 bg-white border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all text-center tracking-[0.5em] font-mono text-2xl font-bold placeholder:tracking-normal placeholder:text-base text-alloro-navy"
                disabled={isLoading}
                autoFocus
              />
            </div>

            {/* Verify Button */}
            <button
              onClick={handleVerify}
              disabled={isLoading || code.length !== 6}
              className="w-full py-3 px-4 bg-alloro-orange hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-900/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Verify
                </>
              )}
            </button>

            {/* Resend Code Button */}
            <button
              onClick={handleResend}
              disabled={cooldown > 0 || isLoading}
              className="w-full text-sm text-slate-500 hover:text-alloro-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {cooldown > 0
                ? `Resend code (${cooldown}s)`
                : "Resend code"}
            </button>

            {/* Back to Sign Up Link */}
            <p className="text-center">
              <Link
                to="/signup"
                className="text-sm text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium"
              >
                Back to sign up
              </Link>
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
