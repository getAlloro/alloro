import { Routes, Route, Navigate } from "react-router-dom";
import {
  AdminLayout,
  PMSAutomationCards,
} from "../components/Admin";
import { ActionItemsHub } from "@/components/Admin/org/ActionItemsHub";
import { AdminGuard } from "@/components/Admin/shell/AdminGuard";
import AIDataInsightsList from "./admin/AIDataInsightsList";
import AIDataInsightsDetail from "./admin/AIDataInsightsDetail";
import AppLogs from "./admin/AppLogs";
import { OrganizationManagement } from "./admin/OrganizationManagement";
import AgentOutputsList from "./admin/AgentOutputsList";
import { PracticeRanking } from "./admin/PracticeRanking";
import OrganizationDetail from "./admin/OrganizationDetail";
import WebsitesList from "./admin/WebsitesList";
import WebsiteDetail from "./admin/WebsiteDetail";
import TemplatesList from "./admin/TemplatesList";
import TemplateDetail from "./admin/TemplateDetail";
import ImportDetail from "./admin/ImportDetail";
import PageEditor from "./admin/PageEditor";
import LayoutEditor from "./admin/LayoutEditor";
import AdminSettings from "./admin/AdminSettings";
import Schedules from "./admin/Schedules";
import MindsList from "./admin/MindsList";
import MindDetail from "./admin/MindDetail";
import AlloroPostsDocs from "./admin/AlloroPostsDocs";
import ProjectsDashboard from "./admin/ProjectsDashboard";
import ProjectBoard from "./admin/ProjectBoard";
import { PmErrorBoundary } from "@/components/pm/PmErrorBoundary";
import LeadgenSubmissions from "./admin/LeadgenSubmissions";
import SupportDashboard from "./admin/SupportDashboard";
import MissionControl from "./admin/MissionControl";
import AdminApps from "./admin/AdminApps";

function WebDevEngine() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center text-gray-500">
      <p className="text-lg font-semibold text-gray-700">
        Alloro WebDev Engine
      </p>
      <p className="mt-2 max-w-md text-sm text-gray-500">
        Websites, landing pages, and deployment automations will live in this
        workspace.
      </p>
    </div>
  );
}

function SentryTest() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <p className="text-lg font-semibold text-gray-700">Sentry Test</p>
      <button
        className="rounded bg-red-600 px-4 py-2 text-white hover:bg-red-700"
        onClick={() => {
          throw new Error("This is your first error!");
        }}
      >
        Break the world
      </button>
    </div>
  );
}

/** Admin layout wrapper for non-fullscreen routes */
function AdminWithLayout() {
  return (
    <AdminLayout>
      <Routes>
        <Route path="/" element={<Navigate to="mission-control" replace />} />
        <Route path="mission-control" element={<MissionControl />} />
        <Route path="apps" element={<AdminApps />} />
        <Route path="apps/:appKey" element={<AdminApps />} />
        <Route path="ai-pms-automation" element={<PMSAutomationCards />} />
        <Route path="action-items" element={<ActionItemsHub />} />
        <Route path="agent-outputs" element={<AgentOutputsList />} />
        <Route path="ai-data-insights" element={<AIDataInsightsList />} />
        <Route
          path="ai-data-insights/:agentType"
          element={<AIDataInsightsDetail />}
        />
        <Route path="webdev-engine" element={<WebDevEngine />} />
        <Route path="app-logs" element={<AppLogs />} />
        <Route
          path="organization-management"
          element={<OrganizationManagement />}
        />
        <Route
          path="organizations/:id"
          element={<OrganizationDetail />}
        />
        <Route path="practice-ranking" element={<PracticeRanking />} />
        <Route path="websites" element={<WebsitesList />} />
        <Route path="websites/:id" element={<WebsiteDetail />} />
        <Route path="templates" element={<TemplatesList />} />
        <Route path="templates/imports/:id" element={<ImportDetail />} />
        <Route path="templates/:id" element={<TemplateDetail />} />
        <Route path="minds" element={<MindsList />} />
        <Route path="minds/:mindId" element={<MindDetail />} />
        <Route path="documentation/alloro-posts" element={<AlloroPostsDocs />} />
        <Route path="schedules" element={<Schedules />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="sentry-test" element={<SentryTest />} />
        <Route path="pm" element={<PmErrorBoundary><ProjectsDashboard /></PmErrorBoundary>} />
        <Route path="pm/:projectId" element={<PmErrorBoundary><ProjectBoard /></PmErrorBoundary>} />
        <Route path="support" element={<SupportDashboard />} />
        <Route path="leadgen-submissions" element={<LeadgenSubmissions />} />
      </Routes>
    </AdminLayout>
  );
}

export default function Admin() {
  return (
    <AdminGuard>
      <Routes>
        {/* Full-screen editors — no AdminLayout */}
        <Route
          path="websites/:id/pages/:pageId/edit"
          element={<PageEditor />}
        />
        <Route
          path="websites/:id/layout/:field"
          element={<LayoutEditor />}
        />

        {/* All other admin routes — with AdminLayout */}
        <Route path="*" element={<AdminWithLayout />} />
      </Routes>
    </AdminGuard>
  );
}
