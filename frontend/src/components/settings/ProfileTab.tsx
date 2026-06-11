/**
 * ProfileTab Component
 *
 * User account settings: password management.
 * Handles two states:
 * 1. No password (legacy Google-only account) — "Set Password" mode
 * 2. Has password — "Change Password" mode (requires current password)
 */

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Key, Eye, EyeOff, Check, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  getPasswordStatus,
  changePassword,
} from "../../api/profile";

const PASSWORD_RULES = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "1 uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "1 number", test: (p: string) => /[0-9]/.test(p) },
];

export const ProfileTab: React.FC = () => {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPasswordStatus();
  }, []);

  const fetchPasswordStatus = async () => {
    try {
      const response = await getPasswordStatus();
      if (response.success) {
        setHasPassword(response.hasPassword);
      }
    } catch (err) {
      console.error("Failed to fetch password status:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const allRulesPass = PASSWORD_RULES.every((rule) => rule.test(newPassword));
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;

  const canSubmit =
    allRulesPass &&
    passwordsMatch &&
    (!hasPassword || currentPassword.length > 0) &&
    !isSaving;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError(null);
    setIsSaving(true);

    try {
      const response = await changePassword({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
        confirmPassword,
      });

      if (response.success) {
        toast.success(response.message);
        setHasPassword(true);
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        setError(response.error || "Failed to update password");
      }
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.message || "Failed to update password";
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <motion.div
          className="flex items-center gap-3 text-gray-400"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-xl" data-wizard-target="settings-account">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-[2rem] border border-black/5 p-6 lg:p-8 shadow-premium relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none"></div>

        <div className="relative z-10">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <div className="p-3 rounded-xl bg-alloro-navy/5 text-alloro-navy">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-display text-lg font-medium text-alloro-navy tracking-tight">
                {hasPassword ? "Change Password" : "Set Password"}
              </h3>
              <p className="text-sm text-slate-500">
                {hasPassword
                  ? "Update your account password"
                  : "Your account doesn't have a password yet. Set one to sign in with email and password."}
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Current Password (only if has password) */}
            {hasPassword && (
              <div>
                <label className="block text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.15em] mb-2">
                  Current Password
                </label>
                <div className="relative">
                  <input
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-xl text-sm font-medium text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange/30 pr-12"
                    placeholder="Enter current password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* New Password */}
            <div>
              <label className="block text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.15em] mb-2">
                {hasPassword ? "New Password" : "Password"}
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    setError(null);
                  }}
                  className="w-full px-4 py-3 bg-alloro-bg border border-black/5 rounded-xl text-sm font-medium text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 focus:border-alloro-orange/30 pr-12"
                  placeholder={hasPassword ? "Enter new password" : "Create a password"}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              {/* Password Rules */}
              {newPassword.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {PASSWORD_RULES.map((rule) => {
                    const passes = rule.test(newPassword);
                    return (
                      <div
                        key={rule.label}
                        className={`flex items-center gap-2 text-xs font-medium ${
                          passes ? "text-green-600" : "text-gray-400"
                        }`}
                      >
                        <Check className={`h-3 w-3 ${passes ? "opacity-100" : "opacity-30"}`} />
                        {rule.label}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-[10px] font-black text-alloro-textDark/40 uppercase tracking-[0.15em] mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    setError(null);
                  }}
                  className={`w-full px-4 py-3 bg-alloro-bg border rounded-xl text-sm font-medium text-alloro-navy focus:outline-none focus:ring-2 focus:ring-alloro-orange/30 pr-12 ${
                    confirmPassword.length > 0 && !passwordsMatch
                      ? "border-red-300"
                      : "border-black/5"
                  }`}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmPassword.length > 0 && !passwordsMatch && (
                <p className="mt-1.5 text-xs font-medium text-red-500">
                  Passwords do not match
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="h-4 w-4 text-red-500 shrink-0" />
                <p className="text-sm font-medium text-red-700">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full px-6 py-3 bg-alloro-navy text-white text-sm font-black uppercase tracking-widest rounded-xl hover:bg-alloro-navy/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {hasPassword ? "Update Password" : "Set Password"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};
