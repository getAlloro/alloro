import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe,
  Mail,
  Shield,
  Lock,
  Activity,
  Search,
  ChevronDown,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useSettingsScopes, usePmsStatus } from "../../hooks/queries/useSettingsQueries";
import { useOnboardingWizard } from "../../contexts/OnboardingWizardContext";
import { PropertiesTab } from "../../components/settings/PropertiesTab";
import { MissingScopeBanner } from "../../components/settings/MissingScopeBanner";
import { PMSUploadBanner } from "../../components/settings/PMSUploadBanner";
import { GoogleConnectButton } from "../../components/GoogleConnectButton";

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
}

const InfoRow = ({ icon, label, value }: InfoRowProps) => (
  <div className="flex items-start gap-4 group">
    <div className="p-2.5 bg-alloro-bg text-alloro-navy/40 rounded-xl shrink-0 group-hover:text-alloro-orange group-hover:bg-alloro-orange/5 transition-all duration-500 border border-black/5 shadow-inner-soft group-hover:shadow-premium">
      {icon}
    </div>
    <div className="min-w-0 text-left">
      <div className="text-[8px] font-black text-alloro-textDark/30 uppercase tracking-[0.2em] mb-0.5 leading-none">
        {label}
      </div>
      <div className="text-base font-black text-alloro-navy tracking-tight truncate group-hover:translate-x-1 transition-transform">
        {value}
      </div>
    </div>
  </div>
);

function GscSettingsSection({
  missingScopes,
  onGrantAccess,
}: {
  missingScopes: string[];
  onGrantAccess: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [granting, setGranting] = useState(false);
  const hasGscScope = !missingScopes.includes("gsc");

  const handleGrantAccess = async () => {
    setGranting(true);
    try {
      const token = localStorage.getItem("token");
      const res = await fetch("/api/auth/google/reconnect?scopes=gsc", {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const data = await res.json();
      if (!data.success || !data.authUrl) {
        setGranting(false);
        return;
      }

      const left = window.screenX + (window.outerWidth - 500) / 2;
      const top = window.screenY + (window.outerHeight - 600) / 2;
      const popup = window.open(
        data.authUrl,
        "gsc_scope_grant",
        `left=${left},top=${top},width=500,height=600,resizable=yes,scrollbars=yes`,
      );

      if (!popup) {
        setGranting(false);
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        const allowedOrigins = [
          window.location.origin,
          "http://localhost:3000",
          "http://localhost:5173",
          "http://localhost:5174",
        ];
        if (!allowedOrigins.includes(event.origin)) return;
        if (event.data.type === "GOOGLE_OAUTH_SUCCESS" || event.data.type === "GOOGLE_OAUTH_ERROR") {
          try { popup.close(); } catch { /* COOP */ }
          setGranting(false);
          window.removeEventListener("message", handleMessage);
          if (event.data.type === "GOOGLE_OAUTH_SUCCESS") onGrantAccess();
        }
      };

      window.addEventListener("message", handleMessage);

      const checkClosed = () => {
        try {
          if (popup.closed) {
            setGranting(false);
            window.removeEventListener("message", handleMessage);
            return;
          }
        } catch { /* COOP */ }
        setTimeout(checkClosed, 1000);
      };
      checkClosed();
    } catch {
      setGranting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden"
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
            <Search size={16} className="text-blue-600" />
          </div>
          <div className="text-left">
            <div className="text-sm font-bold text-alloro-navy">
              Google Search Console
            </div>
            <div className="text-xs text-slate-400">
              {hasGscScope
                ? "Connected"
                : "Additional permission needed"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasGscScope ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-100 text-green-700">
              <CheckCircle2 size={10} /> Connected
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
              <AlertTriangle size={10} /> Action needed
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-slate-300 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-5 pt-1 border-t border-slate-100">
              {hasGscScope ? (
                <p className="text-sm text-slate-500">
                  Search Console access is active. Your admin can connect
                  specific sites from the website integrations panel.
                </p>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    Grant Search Console access to unlock website performance
                    insights in your dashboard.
                  </p>
                  <button
                    onClick={handleGrantAccess}
                    disabled={granting}
                    className="shrink-0 px-4 py-2 bg-alloro-orange text-white text-sm font-bold rounded-xl hover:bg-alloro-orange/90 transition-colors disabled:opacity-50"
                  >
                    {granting ? "Granting..." : "Grant Access"}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export const IntegrationsRoute: React.FC = () => {
  const { userProfile, selectedDomain, hasProperties, hasGoogleConnection, refreshUserProperties } = useAuth();
  const { isWizardActive, restartWizard } = useOnboardingWizard();

  const orgId = userProfile?.organizationId;
  const { data: scopesData, isLoading: scopesLoading, refetch: refetchScopes } = useSettingsScopes();
  const { data: pmsData, isLoading: pmsLoading } = usePmsStatus(orgId ?? undefined);

  const missingScopes = (scopesData?.missingScopes ?? []) as string[];
  const missingScopeCount = scopesData?.missingCount ?? 0;
  const hasPmsData = pmsData?.success && (pmsData?.data?.months?.length ?? 0) > 0 ? true : false;
  const isLoading = scopesLoading || pmsLoading;

  const handleGrantAccessComplete = () => {
    refetchScopes();
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
        <div className="xl:col-span-5 space-y-8">
          <div className="bg-white rounded-[2.5rem] border border-black/5 p-10 shadow-premium animate-pulse">
            <div className="h-4 w-32 bg-slate-100 rounded mb-10" />
            <div className="space-y-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex items-start gap-5">
                  <div className="w-10 h-10 bg-slate-100 rounded-2xl" />
                  <div>
                    <div className="h-3 w-16 bg-slate-100 rounded mb-2" />
                    <div className="h-4 w-32 bg-slate-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="xl:col-span-7 space-y-8 lg:space-y-10">
          <div className="h-6 w-48 bg-slate-100 rounded animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="bg-white rounded-[2.5rem] border border-black/5 p-10 shadow-premium animate-pulse"
              >
                <div className="flex items-center justify-between mb-10">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl" />
                  <div className="h-6 w-16 bg-slate-100 rounded-lg" />
                </div>
                <div className="h-5 w-40 bg-slate-100 rounded mb-2" />
                <div className="h-3 w-24 bg-slate-100 rounded mb-8" />
                <div className="h-4 w-28 bg-slate-100 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 lg:gap-12">
      {/* Left Column - Practice Identity */}
      <section className="xl:col-span-5 space-y-6">
        <div className="px-1">
          <h2 className="text-lg font-black text-alloro-navy tracking-tight mb-1">
            Practice Details
          </h2>
          <p className="text-slate-500 text-sm">
            Your practice information and contact details
          </p>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-[2rem] border border-black/5 p-6 lg:p-8 shadow-premium space-y-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-alloro-orange/[0.03] rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none group-hover:bg-alloro-orange/[0.06] transition-all duration-700"></div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-x-8 gap-y-5 relative z-10">
            <InfoRow
              icon={<Globe size={18} />}
              label="Website"
              value={
                selectedDomain?.domain ||
                userProfile?.domainName ||
                "Not configured"
              }
            />
            <InfoRow
              icon={<Mail size={18} />}
              label="Email"
              value={userProfile?.email || "Not configured"}
            />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-alloro-navy rounded-3xl p-6 lg:p-8 text-white relative overflow-hidden shadow-2xl group text-left"
        >
          <div className="absolute top-0 right-0 w-48 h-48 bg-alloro-orange/5 rounded-full -mr-24 -mt-24 blur-[60px] pointer-events-none group-hover:bg-alloro-orange/10 transition-all duration-700"></div>
          <div className="relative z-10 flex items-center gap-6">
            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
              <Shield size={22} className="text-white/60" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold leading-snug tracking-tight text-white/90">
                <span className="text-alloro-orange font-black">
                  Encrypted & Secure.
                </span>{" "}
                All patient and practice data is protected by high-level
                encryption protocols.
              </p>
              <div className="flex items-center gap-4 pt-1">
                <span className="flex items-center gap-1.5 text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">
                  <Lock size={10} /> HIPAA Compliant
                </span>
                <span className="flex items-center gap-1.5 text-[8px] font-black text-white/20 uppercase tracking-[0.2em]">
                  <Activity size={10} /> Monitored 24/7
                </span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Restart Product Tour */}
        {!isWizardActive && (
          <button
            onClick={restartWizard}
            className="w-full text-left px-4 py-3 rounded-2xl border border-dashed border-slate-200 text-sm font-medium text-slate-400 hover:text-alloro-orange hover:border-alloro-orange/30 transition-all"
          >
            Restart Product Tour
          </button>
        )}
      </section>

      {/* Right Column - Locations & Integrations */}
      <section
        data-wizard-target="settings-integrations"
        className="xl:col-span-7 space-y-6"
      >
        {/* Missing Scopes Banner */}
        {missingScopeCount > 0 && (
          <MissingScopeBanner
            missingCount={missingScopeCount}
            missingScopes={missingScopes}
            onGrantAccess={handleGrantAccessComplete}
          />
        )}

        {/* Connect Google Banner — show when no Google connection */}
        {!hasGoogleConnection && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-alloro-orange/20 rounded-2xl p-6 mb-8"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="font-black text-alloro-navy text-lg">
                  Connect Google Account
                </h3>
                <p className="text-slate-500 text-sm mt-1">
                  Link your Google Business Profile to manage your locations and start tracking performance.
                </p>
              </div>
              <div className="shrink-0">
                <GoogleConnectButton
                  variant="primary"
                  size="sm"
                  onSuccess={async () => {
                    await refreshUserProperties();
                  }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Google Search Console Section */}
        {hasGoogleConnection && (
          <GscSettingsSection
            missingScopes={missingScopes}
            onGrantAccess={handleGrantAccessComplete}
          />
        )}

        {/* PMS Upload Banner — only show when at least one location is configured */}
        {hasPmsData === false && hasProperties && <PMSUploadBanner />}

        {/* Location-centric properties management */}
        <PropertiesTab />
      </section>
    </div>
  );
};
