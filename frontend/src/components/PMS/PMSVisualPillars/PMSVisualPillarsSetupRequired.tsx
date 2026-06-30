import { ChevronDown, ChevronRight, Lock, Settings } from "lucide-react";
import { usePmsCopy } from "../pmsCopy";

interface PMSVisualPillarsSetupRequiredProps {
  gbpConnected: boolean;
  onNavigateToIntegrations: () => void;
}

export function PMSVisualPillarsSetupRequired({
  gbpConnected,
  onNavigateToIntegrations,
}: PMSVisualPillarsSetupRequiredProps) {
  const copy = usePmsCopy();
  const disconnectedServices = [];
  if (!gbpConnected) disconnectedServices.push("Business Profile");

  return (
    <div className="min-h-screen bg-alloro-bg font-body text-alloro-navy flex flex-col items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Welcome header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
            <span className="w-2 h-2 bg-alloro-orange rounded-full animate-pulse"></span>
            <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">
              Setup Required
            </span>
          </div>
          <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-3">
            Let's Set Up Your Dashboard
          </h1>
          <p className="text-lg text-slate-500 font-medium">
            {copy.setupSubtitle}
          </p>
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {/* Step 1 - Connect Properties */}
          <div
            onClick={() => onNavigateToIntegrations()}
            className="group relative bg-white rounded-3xl border-2 border-alloro-orange shadow-xl shadow-alloro-orange/10 p-8 cursor-pointer hover:shadow-2xl hover:shadow-alloro-orange/20 transition-all duration-300 hover:-translate-y-1"
          >
            <div className="flex items-start gap-6">
              {/* Step number */}
              <div className="shrink-0">
                <div className="w-14 h-14 bg-gradient-to-br from-alloro-orange to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-alloro-orange/30 group-hover:scale-110 transition-transform">
                  <span className="text-2xl font-black text-white">1</span>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-display text-xl font-medium text-alloro-navy tracking-tight">
                    Connect Your Google Business Profile
                  </h3>
                  <span className="px-2 py-1 bg-alloro-orange/10 text-alloro-orange text-[10px] font-black uppercase tracking-wider rounded-lg">
                    Required
                  </span>
                </div>
                <p className="text-slate-500 font-medium leading-relaxed mb-3">
                  Link your Google Business Profile to enable tracking and
                  insights.
                </p>
                <p className="text-sm text-amber-600 font-semibold">
                  Missing: {disconnectedServices.join(", ")}
                </p>
                <div className="flex items-center gap-2 text-alloro-orange font-bold text-sm group-hover:gap-3 transition-all mt-3">
                  <Settings className="w-4 h-4" />
                  <span>Go to Settings</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </div>
            {/* Decorative arrow */}
            <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 w-8 h-8 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center z-10">
              <ChevronDown className="w-4 h-4 text-slate-300" />
            </div>
          </div>

          {/* Step 2 - Data upload (Locked) */}
          <div className="relative bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-8 opacity-60">
            <div className="flex items-start gap-6">
              {/* Step number */}
              <div className="shrink-0">
                <div className="w-14 h-14 bg-slate-200 rounded-2xl flex items-center justify-center">
                  <span className="text-2xl font-black text-slate-400">2</span>
                </div>
              </div>
              {/* Content */}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-black text-slate-400 tracking-tight">
                    {copy.setupUploadTitle}
                  </h3>
                  <span className="px-2 py-1 bg-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                    <Lock className="w-3 h-3" />
                    Locked
                  </span>
                </div>
                <p className="text-slate-400 font-medium leading-relaxed">
                  {copy.setupUploadDescription}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Help text */}
        <p className="text-center text-sm text-slate-400 mt-8">
          Need help?{" "}
          <a
            href="mailto:support@alloro.io"
            className="text-alloro-orange font-semibold hover:underline"
          >
            Contact Support
          </a>
        </p>
      </div>
    </div>
  );
}
