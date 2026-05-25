import { useState, useEffect } from "react";
import {
  useAdminOrganization,
  useAdminOrganizationLocations,
  useInvalidateOrganizations,
} from "../../hooks/queries/useAdminQueries";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  RefreshCw,
  Crown,
  Users,
  Globe,
  CheckSquare,
  Database,
  Trophy,
  MessageSquare,
  FileText,
  TrendingUp,
  Target,
  Share2,
  Bell,
  Settings,
  BarChart3,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import { toast } from "react-hot-toast";
import { AdminPageHeader, Badge } from "../../components/ui/DesignSystem";
import { OrgLocationSelector } from "../../components/Admin/OrgLocationSelector";
import { OrgTasksTab } from "../../components/Admin/OrgTasksTab";
import { OrgPmsTab } from "../../components/Admin/OrgPmsTab";
import { OrgAgentOutputsTab } from "../../components/Admin/OrgAgentOutputsTab";
import { OrgRankingsTab } from "../../components/Admin/OrgRankingsTab";
import { OrgNotificationsTab } from "../../components/Admin/OrgNotificationsTab";
import { OrgGbpAutomationTab } from "../../components/Admin/OrgGbpAutomationTab";
import { OrgSubscriptionSection } from "../../components/Admin/OrgSubscriptionSection";
import { OrgUsersSection } from "../../components/Admin/OrgUsersSection";
import { OrgConnectionsSection } from "../../components/Admin/OrgConnectionsSection";
import { OrgSettingsSection } from "../../components/Admin/OrgSettingsSection";
import { ResetOrgDataModal } from "../../components/Admin/ResetOrgDataModal";
import type { AdminLocation } from "../../api/admin-organizations";

// ---------------------------------------------------------------------------
// Sidebar section definitions
// ---------------------------------------------------------------------------

type SectionKey =
  | "subscription"
  | "users"
  | "connections"
  | "gbpAutomation"
  | "agent"
  | "settings";

const SECTION_CONFIG: Record<
  SectionKey,
  { label: string; icon: React.ReactNode }
> = {
  subscription: {
    label: "Subscription & Project",
    icon: <Crown className="h-4 w-4" />,
  },
  users: {
    label: "Users & Roles",
    icon: <Users className="h-4 w-4" />,
  },
  connections: {
    label: "Connections",
    icon: <Globe className="h-4 w-4" />,
  },
  gbpAutomation: {
    label: "GBP Automation",
    icon: <MessageSquare className="h-4 w-4" />,
  },
  agent: {
    label: "Agent Results",
    icon: <BarChart3 className="h-4 w-4" />,
  },
  settings: {
    label: "Organization Settings",
    icon: <Settings className="h-4 w-4" />,
  },
};

const SECTION_KEYS: SectionKey[] = [
  "subscription",
  "users",
  "connections",
  "gbpAutomation",
  "agent",
  "settings",
];

// Agent Results sub-tabs
const AGENT_TAB_KEYS = [
  "tasks",
  "notifications",
  "rankings",
  "pms",
  "proofline",
  "summary",
  "opportunity",
  "cro",
  "referral",
] as const;
type AgentTabKey = (typeof AGENT_TAB_KEYS)[number];

const AGENT_TAB_CONFIG: Record<
  AgentTabKey,
  { label: string; icon: React.ReactNode }
> = {
  tasks: { label: "Tasks Hub", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  notifications: {
    label: "Notifications",
    icon: <Bell className="h-3.5 w-3.5" />,
  },
  rankings: { label: "Rankings", icon: <Trophy className="h-3.5 w-3.5" /> },
  pms: { label: "PMS Ingestion", icon: <Database className="h-3.5 w-3.5" /> },
  proofline: {
    label: "Proofline",
    icon: <MessageSquare className="h-3.5 w-3.5" />,
  },
  summary: { label: "Summary", icon: <FileText className="h-3.5 w-3.5" /> },
  opportunity: {
    label: "Opportunity",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
  cro: { label: "CRO", icon: <Target className="h-3.5 w-3.5" /> },
  referral: {
    label: "Referral Engine",
    icon: <Share2 className="h-3.5 w-3.5" />,
  },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrganizationDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const orgId = parseInt(id || "0", 10);
  const { data: org, isLoading: orgLoading } = useAdminOrganization(orgId);
  const { data: locations = [], isLoading: locLoading } =
    useAdminOrganizationLocations(orgId);
  const { invalidateOne: invalidateOrg } = useInvalidateOrganizations();
  const loading = orgLoading || locLoading;
  const hasMultipleLocations = locations.length > 1;

  // URL-driven state
  const rawSection = searchParams.get("section");
  const rawTab = searchParams.get("tab");
  const activeSection = (
    SECTION_KEYS.includes(rawSection as SectionKey) ? rawSection : "subscription"
  ) as SectionKey;
  const activeAgentTab = (
    AGENT_TAB_KEYS.includes(rawTab as AgentTabKey) ? rawTab : "tasks"
  ) as AgentTabKey;
  const [agentExpanded, setAgentExpanded] = useState(activeSection === "agent");

  const [selectedLocation, setSelectedLocation] =
    useState<AdminLocation | null>(null);

  // Reset Data modal — destructive action, page is already super-admin gated
  // by AdminGuard so no extra role check is needed here.
  const [resetModalOpen, setResetModalOpen] = useState(false);

  useEffect(() => {
    if (!orgId) {
      toast.error("Invalid organization ID");
      navigate("/admin/organization-management");
    }
  }, [navigate, orgId]);

  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
  }, [locations, selectedLocation]);

  // Keep agent expanded state in sync with URL
  useEffect(() => {
    if (activeSection === "agent") setAgentExpanded(true);
  }, [activeSection]);

  useEffect(() => {
    if (rawSection === "agent" && rawTab === "gbpAutomation") {
      setSearchParams({ section: "gbpAutomation" });
    }
  }, [rawSection, rawTab, setSearchParams]);

  const setSection = (section: SectionKey, tab?: string) => {
    const params: Record<string, string> = { section };
    if (section === "agent") params.tab = tab || activeAgentTab;
    setSearchParams(params);
  };

  const setAgentTab = (tab: AgentTabKey) => {
    setSearchParams({ section: "agent", tab });
  };

  const handleRefresh = async () => {
    await invalidateOrg(orgId);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <motion.div
          className="flex items-center gap-3 text-gray-500"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        >
          <RefreshCw className="h-5 w-5 animate-spin" />
          Loading organization...
        </motion.div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Organization not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate("/admin/organization-management")}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title="Back to organizations"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <AdminPageHeader
            icon={<Globe className="w-6 h-6" />}
            title={org.name}
            description={org.domain || "No domain assigned"}
            actionButtons={
              <div className="flex items-center gap-2">
                <Badge variant="orange">DFY</Badge>
                {activeSection === "agent" && (
                  <button
                    onClick={() => setResetModalOpen(true)}
                    title="Wipe selected agent outputs and PMS data for this org"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-300 bg-transparent rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Reset Data
                  </button>
                )}
              </div>
            }
          />
        </div>
      </div>

      {/* Sidebar + Content Layout */}
      <div className="flex gap-6 min-h-[600px]">
        {/* Sidebar */}
        <nav className="w-[220px] shrink-0 rounded-2xl border border-gray-200 bg-white p-2 self-start sticky top-4">
          {SECTION_KEYS.map((key) => {
            const config = SECTION_CONFIG[key];
            const isActive = activeSection === key;
            const isAgent = key === "agent";

            return (
              <div key={key}>
                <button
                  onClick={() => {
                    if (isAgent) {
                      setAgentExpanded(!agentExpanded);
                      setSection("agent", "tasks");
                    } else {
                      setSection(key);
                    }
                  }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                    isActive && !isAgent
                      ? "bg-alloro-orange/10 text-alloro-orange"
                      : isAgent && activeSection === "agent"
                        ? "bg-alloro-orange/10 text-alloro-orange"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  }`}
                >
                  {config.icon}
                  <span className="flex-1 text-left">{config.label}</span>
                  {isAgent && (
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${agentExpanded ? "rotate-180" : ""}`}
                    />
                  )}
                </button>

                {/* Agent sub-items */}
                {isAgent && agentExpanded && (
                  <div className="ml-3 mt-0.5 mb-1 border-l-2 border-gray-200 pl-2 space-y-0.5">
                    {AGENT_TAB_KEYS.map((tab) => {
                      const tabConfig = AGENT_TAB_CONFIG[tab];
                      const isTabActive =
                        activeSection === "agent" && activeAgentTab === tab;

                      return (
                        <button
                          key={tab}
                          onClick={() => setAgentTab(tab)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                            isTabActive
                              ? "text-alloro-orange bg-alloro-orange/5 border-l-2 border-alloro-orange -ml-[2px] pl-[12px]"
                              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {tabConfig.icon}
                          {tabConfig.label}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Divider after connections (before automation and agent results) */}
                {key === "connections" && (
                  <div className="border-t border-gray-100 my-1.5 mx-2" />
                )}
              </div>
            );
          })}

          {/* Divider before settings */}
          <div className="border-t border-gray-100 my-1.5 mx-2" />
        </nav>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {activeSection === "subscription" && (
            <OrgSubscriptionSection
              org={org}
              orgId={orgId}
              onRefresh={handleRefresh}
            />
          )}

          {activeSection === "users" && (
            <OrgUsersSection
              org={org}
              orgId={orgId}
              onRefresh={handleRefresh}
            />
          )}

          {activeSection === "connections" && (
            <OrgConnectionsSection org={org} />
          )}

          {activeSection === "gbpAutomation" && (
            <div className="space-y-4">
              {hasMultipleLocations && (
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Location context
                  </span>
                  <OrgLocationSelector
                    locations={locations}
                    selectedLocation={selectedLocation}
                    onSelect={setSelectedLocation}
                  />
                </div>
              )}

              <OrgGbpAutomationTab
                organizationId={orgId}
                locationId={selectedLocation?.id ?? null}
              />
            </div>
          )}

          {activeSection === "agent" && (
            <div className="space-y-4">
              {/* Location Selector — only in Agent Results */}
              {hasMultipleLocations && (
                <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">
                    Location context
                  </span>
                  <OrgLocationSelector
                    locations={locations}
                    selectedLocation={selectedLocation}
                    onSelect={setSelectedLocation}
                  />
                </div>
              )}

              {/* Agent Tab Content */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                {activeAgentTab === "tasks" && (
                  <OrgTasksTab
                    organizationId={orgId}
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "notifications" && (
                  <OrgNotificationsTab
                    organizationId={orgId}
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "rankings" && (
                  <OrgRankingsTab
                    organizationId={orgId}
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "pms" && (
                  <OrgPmsTab
                    organizationId={orgId}
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "proofline" && (
                  <OrgAgentOutputsTab
                    organizationId={orgId}
                    agentType="proofline"
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "summary" && (
                  <OrgAgentOutputsTab
                    organizationId={orgId}
                    agentType="summary"
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "opportunity" && (
                  <OrgAgentOutputsTab
                    organizationId={orgId}
                    agentType="opportunity"
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "cro" && (
                  <OrgAgentOutputsTab
                    organizationId={orgId}
                    agentType="cro_optimizer"
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
                {activeAgentTab === "referral" && (
                  <OrgAgentOutputsTab
                    organizationId={orgId}
                    agentType="referral_engine"
                    locationId={selectedLocation?.id ?? null}
                  />
                )}
              </div>
            </div>
          )}

          {activeSection === "settings" && (
            <OrgSettingsSection org={org} orgId={orgId} />
          )}
        </div>
      </div>

      {/* Reset Data destructive modal — super-admin only via AdminGuard */}
      <ResetOrgDataModal
        org={{ id: orgId, name: org.name }}
        open={resetModalOpen}
        onClose={() => setResetModalOpen(false)}
      />
    </div>
  );
}
