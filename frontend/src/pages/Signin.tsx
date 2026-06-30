import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import authPassword from "../api/auth-password";
import { setAuthSession } from "../api";

export default function SignIn() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const handleLogin = async () => {
    if (isLoading) return;

    setIsLoading(true);
    setError("");
    setMessage("");

    try {
      const response = await authPassword.login(email, password);

      if (response.success) {
        // Clear stale onboarding state from any previous session
        localStorage.removeItem("onboardingCompleted");
        localStorage.removeItem("hasProperties");

        setAuthSession({ token: response.token, role: response.user?.role });

        setMessage("Success! Redirecting...");
        setTimeout(() => {
          window.location.href = "/dashboard";
        }, 800);
      } else if (response.requiresVerification) {
        // Email not verified — redirect to verification page
        navigate("/verify-email", { state: { email } });
      } else {
        setError(response.error || response.errorMessage || "Invalid email or password");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  };

  const isFormValid =
    email &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
    password.length >= 8;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-alloro-bg font-body">
      <div className="max-w-md w-full">
        {/* Main Card */}
        <div className="relative p-8 rounded-2xl bg-white border border-slate-200 shadow-[0_4px_24px_rgba(0,0,0,0.08)]">
          {/* Logo/Brand */}
          <div className="flex justify-center mb-6">
            <img
              src="/logo.png"
              alt="Alloro"
              className="w-14 h-14 rounded-xl shadow-lg shadow-blue-900/20"
            />
          </div>

          {/* Welcome Message */}
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-2">
              Welcome to Alloro
            </h1>
            <p className="text-slate-500 text-sm">
              Growth you can see. Sign in to get started.
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

          {/* Login Form */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Email */}
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
                  placeholder="Enter your work email"
                  className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
                  disabled={isLoading}
                  autoFocus
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-alloro-navy mb-2"
              >
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Enter your password"
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

            {/* Sign In Button */}
            <button
              onClick={handleLogin}
              disabled={isLoading || !isFormValid}
              className="w-full py-3 px-4 bg-alloro-orange hover:bg-blue-700 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-blue-900/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>

            {/* Links */}
            <div className="text-center space-y-2 pt-2">
              <p className="text-sm text-slate-500">
                <Link
                  to="/forgot-password"
                  className="text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium"
                >
                  Forgot your password?
                </Link>
              </p>
              <p className="text-sm text-slate-500">
                Don't have an account?{" "}
                <Link
                  to="/signup"
                  className="text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium"
                >
                  Sign up
                </Link>
              </p>
            </div>
          </motion.div>
        </div>

        {/* Help Text */}
        <div className="text-center mt-6">
          <p className="text-slate-500 text-sm">
            By signing in, you agree to our{" "}
            <a
              href="https://getalloro.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-alloro-orange hover:underline"
            >
              Terms of Service
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
