import React, { useState, useEffect } from "react";
import { AlertTriangle, Building2, Settings, Lock, ChevronRight, ChevronDown } from "lucide-react";

// Import auth and integration hooks for domain selection
import { useAuth } from "../hooks/useAuth";

// Dashboard Components
import { ConnectionDebugPanel } from "../components/ConnectionDebugPanel";
import { DashboardOverview } from "../components/dashboard/DashboardOverview";
import { ReferralEngineDashboard } from "../components/ReferralEngineDashboard";
import { PMSVisualPillars } from "../components/PMS/PMSVisualPillars";
import { RankingsDashboard } from "../components/dashboard/RankingsDashboard";
import { CogitatingLoader } from "../components/ui/CogitatingLoader";

// Integration Modal Components
import { GBPIntegrationModal } from "../components/GBPIntegrationModal";
import { ClarityIntegrationModal } from "../components/ClarityIntegrationModal";
import { PatientJourneyDashboard } from "../components/dashboard/patient-journey/PatientJourneyDashboard";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation, useNavigate } from "react-router-dom";

// Onboarding Components
import { OnboardingContainer } from "../components/onboarding/OnboardingContainer";
import { useIsWizardActive, useIsWizardLoading, useRecheckWizardStatus } from "../contexts/OnboardingWizardContext";
import { useLocationContext } from "../contexts/locationContext";
import { logger } from "../lib/logger";
import { isPilotSession } from "../api";
import { usePmsCopy } from "../components/PMS/pmsCopy";

export default function Dashboard() {
  // Domain selection and auth hooks - now includes centralized onboarding state
  const {
    selectedDomain,
    userProfile,
    refreshUserProperties,
    onboardingCompleted,
    hasProperties,
    setOnboardingCompleted,
    setHasProperties,
    isLoadingUserProperties,
  } = useAuth();
  const pmsCopy = usePmsCopy();
  const isWizardActive = useIsWizardActive();
  const isWizardLoading = useIsWizardLoading();
  const recheckWizardStatus = useRecheckWizardStatus();
  const { selectedLocation, isTransitioning, registerContentLoading } = useLocationContext();
  const locationId = selectedLocation?.id ?? null;

  // Modal state management
  const [showGBPModal, setShowGBPModal] = useState(false);
  const [showClarityModal, setShowClarityModal] = useState(false);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<
    | "Dashboard"
    | "Patient Journey Insights"
    | "PMS Statistics"
    | "Rankings"
    | "Referral Engine"
  >("Dashboard");

  // Use context loading state instead of local checkingOnboarding
  // This avoids duplicate API calls - AuthContext already fetches onboarding status
  const checkingOnboarding = isLoadingUserProperties && onboardingCompleted === null;

  // Map between tabs and routes
  const tabFromPath = (path: string): typeof activeTab => {
    if (path.startsWith("/patientJourneyInsights"))
      return "Patient Journey Insights";
    if (path.startsWith("/pmsStatistics")) return "PMS Statistics";
    if (path.startsWith("/rankings")) return "Rankings";
    if (path.startsWith("/referralEngine")) return "Referral Engine";
    return "Dashboard";
  };

  // Initialize/keep activeTab in sync with path
  useEffect(() => {
    setActiveTab(tabFromPath(location.pathname));
  }, [location.pathname]);

  // Register content loading during location transitions so the splash waits for data
  useEffect(() => {
    if (isTransitioning) {
      registerContentLoading();
    }
  }, [locationId]);


  // REMOVED: Duplicate onboarding status check
  // AuthContext now handles this centrally - see AuthContext.tsx loadUserProperties()
  // This eliminates one of the duplicate /api/onboarding/status calls

  // Transition flag: prevents empty state flash between onboarding complete and wizard start
  const [isTransitioningToWizard, setIsTransitioningToWizard] = useState(false);

  // Handler for when onboarding is completed
  const handleOnboardingComplete = async () => {
    logger.log("[Dashboard] Onboarding completed");

    // Mark onboarding as complete immediately so the Dashboard renders
    // (not null — null would fall through to the onboarding fallback)
    setOnboardingCompleted(true);
    if (!isPilotSession()) {
      localStorage.setItem("onboardingCompleted", "true");
    }

    // After simplified onboarding, properties are NOT connected yet
    setHasProperties(false);
    if (!isPilotSession()) {
      localStorage.setItem("hasProperties", "false");
    }

    // Prevent empty state flash while wizard loads
    setIsTransitioningToWizard(true);

    // Run both concurrently — wizard check doesn't depend on property refresh
    try {
      await Promise.all([
        refreshUserProperties().then(() =>
          logger.log("[Dashboard] User properties refreshed from database")
        ),
        recheckWizardStatus().then(() =>
          logger.log("[Dashboard] Wizard status checked")
        ),
      ]);
    } catch (error) {
      logger.error("Failed post-onboarding setup:", error);
    } finally {
      setIsTransitioningToWizard(false);
    }
  };

  // Placeholder data - replace with actual hook data later
  const ready = true;
  const session = { user: { id: "1", email: "user@example.com" } };
  const clientId = "demo-client-123";
  const clientLoading = false;
  const clientError = null;
  // Fast redirect to sign in if not authenticated
  if (!session) {
    window.location.href = "/signin";
    return null;
  }

  // Debug: trace which branch renders
  const renderBranch =
    !ready || checkingOnboarding ? "LOADING"
    : clientLoading ? "CLIENT_LOADING"
    : clientError ? "CLIENT_ERROR"
    : !clientId ? "NO_CLIENT"
    : onboardingCompleted === false ? "ONBOARDING"
    : onboardingCompleted === true
      ? (!hasProperties && !isWizardActive && !isTransitioningToWizard && !isWizardLoading ? "EMPTY_STATE" : "DASHBOARD")
    : "FALLBACK_ONBOARDING";
  logger.log("[Dashboard] render branch:", renderBranch, {
    onboardingCompleted, hasProperties, isWizardActive, isWizardLoading, isTransitioningToWizard
  });

  return (
    <div className="w-full max-w-[1600px] mx-auto min-h-screen flex flex-col bg-alloro-bg font-body text-alloro-navy">
      {/* Show loading state while checking onboarding */}
      {!ready || checkingOnboarding || (!selectedLocation && !isWizardActive) ? (
        <CogitatingLoader />
      ) : clientLoading ? (
        <div className="h-full flex items-center justify-center bg-alloro-bg">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-alloro-orange/20 border-t-alloro-orange mx-auto mb-4"></div>
            <p className="text-slate-600 font-medium">Resolving client access...</p>
          </div>
        </div>
      ) : clientError ? (
        <div className="h-full flex items-center justify-center bg-gray-50/50">
          <div className="max-w-md w-full mx-4">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Client Access Error
              </h2>
              <p className="text-gray-600 mb-6">{clientError}</p>
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      ) : !clientId ? (
        <div className="flex-1 flex items-center justify-center bg-gray-50/50">
          <div className="max-w-md w-full mx-4">
            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 text-center">
              <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-yellow-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                No Client Access
              </h2>
              <p className="text-gray-600 mb-6">
                You don't have access to any client accounts. Please contact
                support.
              </p>
              <button
                onClick={() => (window.location.href = "/signout")}
                className="w-full bg-gray-600 text-white py-3 px-4 rounded-lg hover:bg-gray-700 transition-colors"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      ) : onboardingCompleted === false ? (
        <div className="p-8">
          <OnboardingContainer onComplete={handleOnboardingComplete} />
        </div>
      ) : onboardingCompleted === true ? (
        !hasProperties && !isWizardActive && !isTransitioningToWizard && !isWizardLoading ? (
          // Empty State - Creative 2-step onboarding flow
          <div className="flex-1 flex flex-col items-center justify-center p-8">
            <div className="max-w-2xl w-full">
              {/* Welcome header */}
              <div className="text-center mb-10">
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-alloro-orange/10 rounded-full mb-4">
                  <span className="w-2 h-2 bg-alloro-orange rounded-full animate-pulse"></span>
                  <span className="text-xs font-bold text-alloro-orange uppercase tracking-wider">Getting Started</span>
                </div>
                <h1 className="font-display text-3xl font-medium text-alloro-navy tracking-tight mb-3">
                  Let's Set Up Your Dashboard
                </h1>
                <p className="text-lg text-slate-500 font-medium">
                  {pmsCopy.setupSubtitle}
                </p>
              </div>

              {/* Steps */}
              <div className="space-y-4">
                {/* Step 1 - Connect Properties */}
                <div
                  onClick={() => navigate("/settings/integrations")}
                  className="group relative bg-white rounded-3xl border-2 border-alloro-orange shadow-xl shadow-alloro-orange/10 p-5 sm:p-8 cursor-pointer hover:shadow-2xl hover:shadow-alloro-orange/20 transition-all duration-300 hover:-translate-y-1"
                >
                  <div className="flex items-start gap-4 sm:gap-6">
                    {/* Step number */}
                    <div className="shrink-0">
                      <div className="w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-alloro-orange to-orange-600 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-alloro-orange/30 group-hover:scale-110 transition-transform">
                        <span className="text-base sm:text-2xl font-black text-white">1</span>
                      </div>
                    </div>
                    {/* Content */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                        <h3 className="text-base sm:text-xl font-black text-alloro-navy tracking-tight leading-snug">Connect Your Google Business Profile</h3>
                        <span className="px-2 py-1 bg-alloro-orange/10 text-alloro-orange text-[10px] font-black uppercase tracking-wider rounded-lg">Required</span>
                      </div>
                      <p className="text-sm sm:text-base text-slate-500 font-medium leading-relaxed mb-4">
                        Link your Google Business Profile to enable tracking and insights.
                      </p>
                      <div className="flex items-center gap-2 text-alloro-orange font-bold text-sm group-hover:gap-3 transition-all">
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

                {/* Step 2 - PMS Data (Locked) */}
                <div className="relative bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 p-5 sm:p-8 opacity-60">
                  <div className="flex items-start gap-4 sm:gap-6">
                    {/* Step number */}
                    <div className="shrink-0">
                      <div className="w-10 h-10 sm:w-14 sm:h-14 bg-slate-200 rounded-xl sm:rounded-2xl flex items-center justify-center">
                        <span className="text-base sm:text-2xl font-black text-slate-400">2</span>
                      </div>
                    </div>
                    {/* Content */}
                    <div className="flex-1 text-left min-w-0">
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
                        <h3 className="text-base sm:text-xl font-black text-slate-400 tracking-tight leading-snug">{pmsCopy.setupUploadTitle}</h3>
                        <span className="px-2 py-1 bg-slate-200 text-slate-400 text-[10px] font-black uppercase tracking-wider rounded-lg flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          Locked
                        </span>
                      </div>
                      <p className="text-sm sm:text-base text-slate-400 font-medium leading-relaxed">
                        {pmsCopy.setupUploadDescription}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Help text */}
              <p className="text-center text-sm text-slate-400 mt-8">
                Having trouble? <button type="button" onClick={() => navigate("/help?newTicket=bug_report")} className="text-alloro-orange font-semibold hover:underline">Submit a ticket</button>
              </p>
            </div>
          </div>
        ) : (
          // Dashboard Content
          <div className="w-full  mx-auto space-y-8 pt-10 pb-20">
            <div className="space-y-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                >
                  {activeTab === "Dashboard" && (
                    <DashboardOverview
                      organizationId={userProfile?.organizationId ?? null}
                      locationId={locationId}
                    />
                  )}

                  {activeTab === "Patient Journey Insights" && (
                    <PatientJourneyDashboard
                      organizationId={userProfile?.organizationId ?? null}
                      locationId={locationId}
                    />
                  )}

                  {activeTab === "PMS Statistics" && (
                    <React.Suspense
                      fallback={
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {[...Array(4)].map((_, i) => (
                            <div
                              key={i}
                              className="bg-white rounded-[32px] p-6 h-48 animate-pulse shadow-sm border border-slate-100"
                            >
                              <div className="h-4 bg-slate-100 rounded-full w-2/3 mb-4"></div>
                              <div className="h-8 bg-slate-100 rounded-full w-1/2 mb-2"></div>
                              <div className="h-32 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl"></div>
                            </div>
                          ))}
                        </div>
                      }
                    >
                      {/* Render PMSVisualPillars when domain is available OR during wizard mode (for demo data) */}
                      {selectedDomain?.domain || isWizardActive ? (
                        <PMSVisualPillars
                          domain={selectedDomain?.domain || ""}
                          organizationId={userProfile?.organizationId ?? null}
                          locationId={locationId}
                          locationName={selectedLocation?.name ?? null}
                          hasProperties={hasProperties}
                        />
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          {[...Array(4)].map((_, i) => (
                            <div
                              key={i}
                              className="bg-white rounded-[32px] p-6 h-48 animate-pulse shadow-sm border border-slate-100"
                            >
                              <div className="h-4 bg-slate-100 rounded-full w-2/3 mb-4"></div>
                              <div className="h-8 bg-slate-100 rounded-full w-1/2 mb-2"></div>
                              <div className="h-32 bg-gradient-to-br from-slate-50 to-slate-100/50 rounded-2xl"></div>
                            </div>
                          ))}
                        </div>
                      )}
                    </React.Suspense>
                  )}

                  {activeTab === "Rankings" && (
                    <RankingsDashboard
                      organizationId={userProfile?.organizationId ?? null}
                      locationId={locationId}
                    />
                  )}

                  {activeTab === "Referral Engine" && (
                    <ReferralEngineDashboard
                      organizationId={userProfile?.organizationId ?? null}
                      locationId={locationId}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Integration Modal Components */}
            <GBPIntegrationModal
              isOpen={showGBPModal}
              onClose={() => setShowGBPModal(false)}
              clientId={clientId}
              ready={ready}
              session={session}
              onSuccess={() => {
                logger.log("GBP integration successful!");
              }}
            />

            <ClarityIntegrationModal
              isOpen={showClarityModal}
              onClose={() => setShowClarityModal(false)}
              clientId={clientId}
              onSuccess={() => {
                logger.log("Clarity integration successful!");
              }}
            />

            {/* Connection Debug Panel */}
            <ConnectionDebugPanel
              isVisible={showDebugPanel}
              onClose={() => setShowDebugPanel(false)}
            />
          </div>
        )
      ) : (
        // Fallback: onboardingCompleted is null after loading finished — show onboarding
        <div className="p-8">
          <OnboardingContainer onComplete={handleOnboardingComplete} />
        </div>
      )}
    </div>
  );
}
