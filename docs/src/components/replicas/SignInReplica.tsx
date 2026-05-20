// Copied from: frontend/src/pages/Signin.tsx @ v0.0.82

import { Mail, Lock, Eye, LogIn } from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { AuthLayout } from "./AuthLayout";
import { HotspotZone } from "../HotspotZone";

export function SignInReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <AuthLayout>
      {/* Welcome Message */}
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-2">
          Welcome to Alloro
        </h1>
        <p className="text-slate-500 text-sm">
          Growth you can see. Sign in to get started.
        </p>
      </div>

      {/* Login Form */}
      <div className="space-y-4">
        {/* Email */}
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
                placeholder="Enter your work email"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>
        </HotspotZone>

        {/* Password */}
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
                placeholder="Enter your password"
                className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange outline-none transition-all placeholder:text-slate-400"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Eye className="w-4 h-4" />
              </div>
            </div>
          </div>
        </HotspotZone>

        {/* Sign In Button */}
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
            <LogIn className="w-4 h-4" />
            Sign In
          </button>
        </HotspotZone>

        {/* Links */}
        <div className="text-center space-y-2 pt-2">
          <HotspotZone
            id="forgot-link"
            hotspot={findHotspot("forgot-link")}
            isActive={activeHotspotId === "forgot-link"}
            onHotspotClick={onHotspotClick}
          >
            <p className="text-sm text-slate-500">
              <span className="text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium cursor-pointer">
                Forgot your password?
              </span>
            </p>
          </HotspotZone>

          <HotspotZone
            id="signup-link"
            hotspot={findHotspot("signup-link")}
            isActive={activeHotspotId === "signup-link"}
            onHotspotClick={onHotspotClick}
          >
            <p className="text-sm text-slate-500">
              Don&apos;t have an account?{" "}
              <span className="text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium cursor-pointer">
                Sign up
              </span>
            </p>
          </HotspotZone>
        </div>
      </div>

      {/* Help Text — outside the card in the real app, but inside AuthLayout children here */}
      <div className="text-center mt-6">
        <p className="text-slate-500 text-sm">
          By signing in, you agree to our{" "}
          <span className="text-alloro-orange">Terms of Service</span>
        </p>
      </div>
    </AuthLayout>
  );
}
