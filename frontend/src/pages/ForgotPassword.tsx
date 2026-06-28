import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  KeyRound,
  ArrowLeft,
  CheckCircle2,
} from "lucide-react";
import authPassword from "../api/auth-password";
import { setAuthSession } from "../api";

type Step = "email" | "reset";

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [cooldown, setCooldown] = useState(0);

  // Cooldown timer for resend
  useEffect(() => {
    if (cooldown <= 0) return;
    const interval = setInterval(() => {
      setCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldown]);

  const isValidEmail =
    email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleSendCode = async () => {
    if (isLoading || !isValidEmail) return;

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await authPassword.forgotPassword(email);

      if (response.success) {
        setMessage("Reset code sent! Check your inbox.");
        setCooldown(60);
        setStep("reset");
      } else {
        setError(response.error || response.errorMessage || "Failed to send reset code");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (cooldown > 0 || isLoading) return;

    setError("");
    setMessage("");

    try {
      const response = await authPassword.forgotPassword(email);

      if (response.success) {
        setMessage("Reset code resent. Check your inbox.");
        setCooldown(60);
      } else {
        setError(response.error || "Failed to resend code");
      }
    } catch {
      setError("An error occurred. Please try again.");
    }
  };

  const handleResetPassword = async () => {
    if (isLoading || code.length !== 6) return;

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(password)) {
      setError("Password must contain at least 1 uppercase letter");
      return;
    }
    if (!/[0-9]/.test(password)) {
      setError("Password must contain at least 1 number");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await authPassword.resetPassword(
        email,
        code,
        password,
        confirmPassword
      );

      if (response.success) {
        // Clear stale onboarding state from any previous session
        localStorage.removeItem("onboardingCompleted");
        localStorage.removeItem("hasProperties");

        setAuthSession({ token: response.token, role: response.user?.role });

        setMessage("Password reset! Redirecting...");
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 800);
      } else {
        setError(
          response.error || response.errorMessage || "Failed to reset password"
        );
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (step === "email") {
        handleSendCode();
      } else {
        handleResetPassword();
      }
    }
  };

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
            <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-2">
              {step === "email" ? "Forgot your password?" : "Reset your password"}
            </h1>
            <p className="text-slate-500 text-sm">
              {step === "email"
                ? "Enter your email and we'll send you a reset code."
                : <>Enter the 6-digit code sent to{" "}
                    <span className="text-alloro-orange font-semibold">{email}</span>
                  </>}
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

          <AnimatePresence mode="wait">
            {step === "email" ? (
              /* Step 1: Email Entry */
              <motion.div
                key="email-step"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-alloro-navy mb-2"
                  >
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Enter your email"
                      className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
                      disabled={isLoading}
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  onClick={handleSendCode}
                  disabled={isLoading || !isValidEmail}
                  className="w-full py-3 px-4 bg-alloro-orange hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-900/20"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      Send Reset Code
                    </>
                  )}
                </button>

                <p className="text-center text-sm text-slate-500 pt-2">
                  <Link
                    to="/signin"
                    className="inline-flex items-center gap-1 text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back to sign in
                  </Link>
                </p>
              </motion.div>
            ) : (
              /* Step 2: Code + New Password */
              <motion.div
                key="reset-step"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Code Input */}
                <div>
                  <label
                    htmlFor="reset-code"
                    className="block text-sm font-medium text-alloro-navy mb-2"
                  >
                    Reset Code
                  </label>
                  <input
                    id="reset-code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={code}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, "").slice(0, 6);
                      setCode(value);
                    }}
                    onKeyDown={handleKeyPress}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full px-4 py-4 bg-white border-2 border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all text-center tracking-[0.5em] font-mono text-2xl font-bold placeholder:tracking-normal placeholder:text-base text-alloro-navy"
                    disabled={isLoading}
                    autoFocus
                  />
                </div>

                {/* New Password */}
                <div>
                  <label
                    htmlFor="new-password"
                    className="block text-sm font-medium text-alloro-navy mb-2"
                  >
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Min 8 chars, 1 uppercase, 1 number"
                      className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="confirm-password"
                    className="block text-sm font-medium text-alloro-navy mb-2"
                  >
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onKeyDown={handleKeyPress}
                      placeholder="Re-enter your new password"
                      className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Reset Button */}
                <button
                  onClick={handleResetPassword}
                  disabled={isLoading || code.length !== 6 || !password || !confirmPassword}
                  className="w-full py-3 px-4 bg-alloro-orange hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-900/20"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Resetting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Reset Password
                    </>
                  )}
                </button>

                {/* Resend Code */}
                <button
                  onClick={handleResendCode}
                  disabled={cooldown > 0 || isLoading}
                  className="w-full text-sm text-slate-500 hover:text-alloro-orange transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {cooldown > 0
                    ? `Resend code (${cooldown}s)`
                    : "Resend code"}
                </button>

                {/* Back to Sign In */}
                <p className="text-center text-sm text-slate-500">
                  <Link
                    to="/signin"
                    className="inline-flex items-center gap-1 text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back to sign in
                  </Link>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
