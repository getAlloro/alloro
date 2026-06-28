import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOnboarding } from "../../hooks/useOnboarding";
import { useAuth } from "../../hooks/useAuth";
import { ProgressIndicator } from "./ProgressIndicator";
import { Step0UserInfo } from "./Step0_UserInfo";
import { Step1PracticeInfo } from "./Step1_PracticeInfo";
import { Step2DomainInfo } from "./Step2_DomainInfo";
import { Step3PlanChooser } from "./Step3_PlanChooser";
import { isPilotSession } from "../../api";

interface OnboardingContainerProps {
  onComplete?: () => void;
}

export const OnboardingContainer: React.FC<OnboardingContainerProps> = () => {
  const { hasGoogleConnection, refreshUserProperties, userProfile } = useAuth();

  // Compute initial step: if org already exists (Step 2 was completed), resume at Step 3.
  // This replaces the old useEffect-based resume logic that caused a race condition
  // where refreshUserProperties() triggered the effect mid-update, double-advancing steps.
  const initialStep = userProfile?.organizationId ? 3 : 1;

  const {
    currentStep,
    totalSteps,
    error,
    isSavingProfile,
    firstName,
    lastName,
    practiceName,
    domainName,
    setFirstName,
    setLastName,
    setPracticeName,
    setDomainName,
    selectedGbpLocations,
    fetchAvailableGBP,
    saveGbpSelections,
    saveProfileAndCreateOrg,
    nextStep,
    previousStep,
    initiateCheckout,
    isCheckoutProcessing,
    completeOnboarding,
  } = useOnboarding(initialStep);

  const [autoOpenGbp, setAutoOpenGbp] = useState(false);
  const [isSkipping, setIsSkipping] = useState(false);
  const [skipError, setSkipError] = useState<string | null>(null);

  // Mark onboarding complete and drop the user into the app without paying.
  // Hard-redirects so AuthContext refetches with the new onboarding + billing state.
  const handleSkipToApp = async () => {
    setSkipError(null);
    setIsSkipping(true);
    const ok = await completeOnboarding();
    if (ok) {
      if (!isPilotSession()) {
        localStorage.setItem("onboardingCompleted", "true");
      }
      window.location.href = "/dashboard";
    } else {
      setSkipError("Something went wrong. Please try again.");
      setIsSkipping(false);
    }
  };

  // Called when Google OAuth popup succeeds — refresh auth state then auto-open GBP selector
  const handleGoogleConnected = async () => {
    await refreshUserProperties();
    setAutoOpenGbp(true);
  };

  // Step 2: Save profile + create org, then advance to Step 3
  const handleSaveProfileAndAdvance = async () => {
    const orgId = await saveProfileAndCreateOrg();
    if (orgId) {
      // Refresh auth so the new organizationId is available for Step 3 API calls
      await refreshUserProperties();
      nextStep();
    }
  };

  // Fade animation variants
  const fadeVariants = {
    enter: {
      opacity: 0,
      y: 10,
    },
    center: {
      opacity: 1,
      y: 0,
    },
    exit: {
      opacity: 0,
      y: -10,
    },
  };

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4 font-body relative overflow-hidden"
        style={{
          background: "radial-gradient(ellipse at top, rgba(214, 104, 83, 0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(214, 104, 83, 0.05) 0%, transparent 40%), #F3F4F6"
        }}
      >
        <div className="w-full max-w-md p-4 sm:p-6 lg:p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-alloro-orange/10 shadow-[0_8px_32px_rgba(214,104,83,0.12)]">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h2 className="text-alloro-navy text-xl font-bold font-heading">
              Oops! Something went wrong
            </h2>
            <p className="text-slate-600">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white font-semibold hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5 transition-all"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] p-4 flex items-center justify-center font-body relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at top, rgba(214, 104, 83, 0.08) 0%, transparent 50%), radial-gradient(ellipse at bottom right, rgba(214, 104, 83, 0.05) 0%, transparent 40%), #F3F4F6"
      }}
    >
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-96 h-96 bg-alloro-orange/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-80 h-80 bg-alloro-orange/5 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />

      <div className={`w-full relative z-10 ${currentStep === 4 ? "max-w-2xl" : "max-w-xl"}`}>
        {/* Main Card */}
        <div className="p-4 sm:p-6 lg:p-8 rounded-2xl bg-white/80 backdrop-blur-sm border border-alloro-orange/10 shadow-[0_8px_32px_rgba(214,104,83,0.12)]">
          {/* Progress Indicator */}
          <ProgressIndicator
            currentStep={currentStep}
            totalSteps={totalSteps}
          />

          {/* Steps Container */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              variants={fadeVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{
                duration: 0.25,
                ease: "easeOut",
              }}
            >
              {/* Step 1: User Info */}
              {currentStep === 1 && (
                <Step0UserInfo
                  firstName={firstName}
                  lastName={lastName}
                  onFirstNameChange={setFirstName}
                  onLastNameChange={setLastName}
                  onNext={nextStep}
                />
              )}

              {/* Step 2: Practice Info + Domain */}
              {currentStep === 2 && (
                <Step1PracticeInfo
                  practiceName={practiceName}
                  domainName={domainName}
                  onPracticeNameChange={setPracticeName}
                  onDomainNameChange={setDomainName}
                  onNext={handleSaveProfileAndAdvance}
                  onBack={previousStep}
                  isSaving={isSavingProfile}
                />
              )}

              {/* Step 3: Google Connect + GBP Selector */}
              {currentStep === 3 && (
                <Step2DomainInfo
                  hasGoogleConnection={hasGoogleConnection}
                  selectedGbpLocations={selectedGbpLocations}
                  onGbpSelect={saveGbpSelections}
                  fetchAvailableGBP={fetchAvailableGBP}
                  onGoogleConnected={handleGoogleConnected}
                  autoOpenGbp={autoOpenGbp}
                  onAutoOpenGbpHandled={() => setAutoOpenGbp(false)}
                  onNext={nextStep}
                  onBack={previousStep}
                  isCompleting={false}
                />
              )}

              {/* Step 4: Subscribe + Stripe Checkout */}
              {currentStep === 4 && (
                <Step3PlanChooser
                  onSubscribe={initiateCheckout}
                  onSkip={handleSkipToApp}
                  onBack={previousStep}
                  isProcessing={isCheckoutProcessing}
                  isSkipping={isSkipping}
                  skipError={skipError}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Help Text */}
        <div className="text-center mt-6">
          <p className="text-slate-500 text-sm">
            Need help? Contact us at{" "}
            <a
              href="mailto:info@getalloro.com"
              className="text-alloro-orange hover:underline font-medium"
            >
              info@getalloro.com
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};
