// Copied from: frontend/src/pages/Signup.tsx @ v0.0.82

import { Mail, Lock, Eye, UserPlus } from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { AuthLayout } from "./AuthLayout";
import { HotspotZone } from "../HotspotZone";

export function SignUpReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <AuthLayout>
      {/* Heading */}
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-2">
          Create your Alloro account
        </h1>
        <p className="text-slate-500 text-sm">
          Get started with growth you can see.
        </p>
      </div>

      {/* Signup Form */}
      <div className="space-y-4">
        {/* Email Field */}
        <HotspotZone
          id="email-field"
          hotspot={findHotspot("email-field")}
          isActive={activeHotspotId === "email-field"}
          onHotspotClick={onHotspotClick}
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
                readOnly
                placeholder="Enter your email"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>
        </HotspotZone>

        {/* Password Field */}
        <HotspotZone
          id="password-field"
          hotspot={findHotspot("password-field")}
          isActive={activeHotspotId === "password-field"}
          onHotspotClick={onHotspotClick}
        >
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
                type="password"
                readOnly
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Eye className="w-4 h-4" />
              </div>
            </div>
          </div>
        </HotspotZone>

        {/* Confirm Password Field */}
        <HotspotZone
          id="confirm-password-field"
          hotspot={findHotspot("confirm-password-field")}
          isActive={activeHotspotId === "confirm-password-field"}
          onHotspotClick={onHotspotClick}
        >
          <div>
            <label
              htmlFor="confirmPassword"
              className="block text-sm font-medium text-alloro-navy mb-2"
            >
              Confirm Password
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="confirmPassword"
                type="password"
                readOnly
                placeholder="Re-enter your password"
                className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Eye className="w-4 h-4" />
              </div>
            </div>
          </div>
        </HotspotZone>

        {/* Submit Button */}
        <HotspotZone
          id="submit-btn"
          hotspot={findHotspot("submit-btn")}
          isActive={activeHotspotId === "submit-btn"}
          onHotspotClick={onHotspotClick}
        >
          <button
            type="button"
            className="w-full py-3 px-4 bg-alloro-orange hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex justify-center items-center gap-2 shadow-lg shadow-blue-900/20"
          >
            <UserPlus className="w-4 h-4" />
            Create Account
          </button>
        </HotspotZone>

        {/* Sign In Link */}
        <HotspotZone
          id="signin-link"
          hotspot={findHotspot("signin-link")}
          isActive={activeHotspotId === "signin-link"}
          onHotspotClick={onHotspotClick}
        >
          <p className="text-center text-sm text-slate-500">
            Already have an account?{" "}
            <span className="text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium cursor-pointer">
              Sign in
            </span>
          </p>
        </HotspotZone>
      </div>

      {/* Terms Text */}
      <div className="text-center mt-6">
        <p className="text-slate-500 text-sm">
          By signing up, you agree to our{" "}
          <span className="text-alloro-orange">Terms of Service</span>
        </p>
      </div>
    </AuthLayout>
  );
}
