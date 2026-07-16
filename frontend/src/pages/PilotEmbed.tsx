import { useEffect, useState, type ReactNode } from "react";
import {
  MemoryRouter,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Dashboard from "./Dashboard";
import { Settings } from "./Settings";
import { IntegrationsRoute } from "./settings/IntegrationsRoute";
import { LocationsRoute } from "./settings/LocationsRoute";
import { UsersRoute } from "./settings/UsersRoute";
import { BillingRoute } from "./settings/BillingRoute";
import { AccountRoute } from "./settings/AccountRoute";
import { DFYWebsite } from "./DFYWebsite";
import { GbpManagerPage } from "./GbpManagerPage";
import { Notifications } from "./Notifications";
import Help from "./Help";
import LocationCompetitorOnboarding from "./competitor-onboarding/LocationCompetitorOnboarding";
import { PageWrapper } from "../components/PageWrapper";
import { AuthProvider } from "../contexts/AuthContext.tsx";
import { GBPProvider } from "../contexts/GBPContext.tsx";
import { ClarityProvider } from "../contexts/ClarityContext.tsx";
import { SessionProvider } from "../contexts/SessionProvider.tsx";
import { LocationProvider } from "../contexts/LocationProvider.tsx";
import { OnboardingWizardProvider } from "../contexts/OnboardingWizardContext.tsx";
import {
  SetupProgressProvider,
  SetupProgressWizard as _SetupProgressWizard,
} from "../components/SetupProgressWizard";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { ConfirmProvider } from "../components/ui/ConfirmModal";
import { DFYRoute } from "../components/DFYRoute";
import { PilotBanner } from "../components/Admin/shell/PilotBanner";
import { SessionExpiredModal } from "../components/SessionExpiredModal";
import { GlobalSupportAction } from "../components/support/GlobalSupportAction";
import { SupportQuickActionProvider } from "../contexts/SupportQuickActionContext";
import { AppTelemetryTracker } from "../components/telemetry/AppTelemetryTracker";
import { WizardController } from "../components/onboarding-wizard";
import {
  PILOT_EMBED_READY_MESSAGE,
  PILOT_EMBED_TOKEN_MESSAGE,
  setEmbeddedPilotSession,
} from "../utils/embeddedPilotSession";

void _SetupProgressWizard;

type PilotEmbedState =
  | { status: "waiting" }
  | { message: string; status: "error" }
  | { status: "ready" };

function PilotAppProviders({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <LocationProvider>
        <GBPProvider>
          <ClarityProvider>{children}</ClarityProvider>
        </GBPProvider>
      </LocationProvider>
    </SessionProvider>
  );
}

function PilotProtectedLayout() {
  return (
    <ProtectedRoute>
      <PilotAppProviders>
        <PageWrapper>
          <Outlet />
        </PageWrapper>
        <GlobalSupportAction />
      </PilotAppProviders>
    </ProtectedRoute>
  );
}

export function PilotEmbed() {
  const [state, setState] = useState<PilotEmbedState>({ status: "waiting" });

  useEffect(() => {
    const notifyReady = () => {
      window.parent.postMessage(
        { type: PILOT_EMBED_READY_MESSAGE },
        window.location.origin
      );
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || typeof event.data !== "object") return;

      const data = event.data as {
        email?: unknown;
        role?: unknown;
        token?: unknown;
        type?: unknown;
        userId?: unknown;
      };
      if (data.type !== PILOT_EMBED_TOKEN_MESSAGE) return;
      if (typeof data.token !== "string" || data.token.length === 0) {
        setState({ message: "Pilot token was missing.", status: "error" });
        return;
      }

      setEmbeddedPilotSession({
        email: typeof data.email === "string" ? data.email : null,
        role: typeof data.role === "string" ? data.role : "client",
        token: data.token,
        userId: typeof data.userId === "number" ? data.userId : null,
      });
      setState({ status: "ready" });
    };

    window.addEventListener("message", handleMessage);
    notifyReady();
    const readyInterval = window.setInterval(notifyReady, 1000);

    return () => {
      window.clearInterval(readyInterval);
      window.removeEventListener("message", handleMessage);
    };
  }, []);

  if (state.status !== "ready") {
    return <PilotEmbedWaitingScreen state={state} />;
  }

  return (
    <MemoryRouter initialEntries={["/dashboard"]}>
      <AuthProvider>
        <AppTelemetryTracker />
        <SupportQuickActionProvider>
          <OnboardingWizardProvider>
            <SetupProgressProvider>
              <ConfirmProvider>
                <Toaster position="top-right" />
                <SessionExpiredModal />
                <WizardController />
                <PilotEmbedRoutes />
                <PilotBanner />
              </ConfirmProvider>
            </SetupProgressProvider>
          </OnboardingWizardProvider>
        </SupportQuickActionProvider>
      </AuthProvider>
    </MemoryRouter>
  );
}

function PilotEmbedWaitingScreen({
  state,
}: {
  state: Exclude<PilotEmbedState, { status: "ready" }>;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white text-gray-600">
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-5 text-center shadow-sm">
        {state.status === "error" ? (
          <>
            <p className="text-sm font-bold text-red-600">Pilot failed</p>
            <p className="mt-1 text-sm text-gray-500">{state.message}</p>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin text-alloro-navy" />
            <p className="text-sm font-bold text-gray-800">
              Waiting for pilot session
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function PilotEmbedRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route element={<PilotProtectedLayout />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/patientJourneyInsights" element={<Dashboard />} />
        <Route path="/pmsStatistics" element={<Dashboard />} />
        <Route
          path="/tasks"
          element={<Navigate to="/dashboard" replace />}
        />
        <Route path="/rankings" element={<Dashboard />} />
        <Route path="/gbp-manager" element={<GbpManagerPage />} />
        <Route path="/referralEngine" element={<Dashboard />} />
        <Route
          path="/dashboard/competitors/:locationId/onboarding"
          element={<LocationCompetitorOnboarding />}
        />
        <Route
          path="/dfy/website"
          element={
            <DFYRoute>
              <DFYWebsite />
            </DFYRoute>
          }
        />
        <Route path="/settings" element={<Settings />}>
          <Route index element={<Navigate to="integrations" replace />} />
          <Route path="integrations" element={<IntegrationsRoute />} />
          <Route path="locations" element={<LocationsRoute />} />
          <Route path="users" element={<UsersRoute />} />
          <Route path="billing" element={<BillingRoute />} />
          <Route path="account" element={<AccountRoute />} />
        </Route>
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/help" element={<Help />} />
      </Route>
    </Routes>
  );
}
