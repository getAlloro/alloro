// Copied from: frontend/src/pages/ForgotPassword.tsx @ v0.0.82

import { Lock, Eye, CheckCircle2, ArrowLeft } from "lucide-react";
import type { ReplicaProps } from "../../types/docs";
import { AuthLayout } from "./AuthLayout";
import { HotspotZone } from "../HotspotZone";

export function ForgotPasswordReplica({
  hotspots,
  activeHotspotId,
  onHotspotClick,
}: ReplicaProps) {
  const findHotspot = (id: string) => hotspots.find((h) => h.id === id);

  return (
    <AuthLayout>
      {/* Heading — shows the "reset" step (Step 2) */}
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-2">
          Reset your password
        </h1>
        <p className="text-slate-500 text-sm">
          Enter the 6-digit code sent to{" "}
          <span className="text-alloro-orange font-semibold">
            user@example.com
          </span>
        </p>
      </div>

      {/* Code + New Password (Step 2 — default view) */}
      <div className="space-y-4">
        {/* Reset Code */}
        <HotspotZone
          id="reset-code"
          hotspot={findHotspot("reset-code")}
          isActive={activeHotspotId === "reset-code"}
          onHotspotClick={onHotspotClick}
        >
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
              readOnly
              defaultValue="384291"
              className="w-full px-4 py-4 bg-white border-2 border-slate-300 rounded-xl outline-none text-center tracking-[0.5em] font-mono text-2xl font-bold text-alloro-navy"
            />
          </div>
        </HotspotZone>

        {/* New Password */}
        <HotspotZone
          id="new-password"
          hotspot={findHotspot("new-password")}
          isActive={activeHotspotId === "new-password"}
          onHotspotClick={onHotspotClick}
        >
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
                type="password"
                readOnly
                placeholder="Min 8 chars, 1 uppercase, 1 number"
                className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl outline-none transition-all placeholder:text-slate-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Eye className="w-4 h-4" />
              </span>
            </div>
          </div>
        </HotspotZone>

        {/* Confirm Password */}
        <HotspotZone
          id="confirm-password"
          hotspot={findHotspot("confirm-password")}
          isActive={activeHotspotId === "confirm-password"}
          onHotspotClick={onHotspotClick}
        >
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
                type="password"
                readOnly
                placeholder="Re-enter your new password"
                className="w-full pl-10 pr-12 py-3 bg-white border border-slate-300 rounded-xl outline-none transition-all placeholder:text-slate-400"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                <Eye className="w-4 h-4" />
              </span>
            </div>
          </div>
        </HotspotZone>

        {/* Reset Button */}
        <HotspotZone
          id="reset-btn"
          hotspot={findHotspot("reset-btn")}
          isActive={activeHotspotId === "reset-btn"}
          onHotspotClick={onHotspotClick}
        >
          <button
            type="button"
            className="w-full py-3 px-4 bg-alloro-orange hover:bg-blue-700 text-white font-medium rounded-xl transition-colors flex justify-center items-center gap-2 shadow-lg shadow-blue-900/20"
          >
            <CheckCircle2 className="w-4 h-4" />
            Reset Password
          </button>
        </HotspotZone>

        {/* Resend Code */}
        <HotspotZone
          id="resend-code"
          hotspot={findHotspot("resend-code")}
          isActive={activeHotspotId === "resend-code"}
          onHotspotClick={onHotspotClick}
        >
          <button
            type="button"
            className="w-full text-sm text-slate-500 hover:text-alloro-orange transition-colors"
          >
            Resend code
          </button>
        </HotspotZone>

        {/* Back to Sign In */}
        <HotspotZone
          id="back-link"
          hotspot={findHotspot("back-link")}
          isActive={activeHotspotId === "back-link"}
          onHotspotClick={onHotspotClick}
        >
          <p className="text-center text-sm text-slate-500">
            <span className="inline-flex items-center gap-1 text-alloro-orange hover:text-alloro-orange/80 transition-colors font-medium cursor-pointer">
              <ArrowLeft className="w-3 h-3" />
              Back to sign in
            </span>
          </p>
        </HotspotZone>
      </div>
    </AuthLayout>
  );
}
