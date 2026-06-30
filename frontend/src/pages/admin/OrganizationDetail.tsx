import { useState, useEffect } from "react";
import {
  useAdminOrganization,
  useAdminOrganizationLocations,
  useInvalidateOrganizations,
} from "../../hooks/queries/useAdminQueries";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, RefreshCw, Globe, FileCode, Archive } from "lucide-react";
import { toast } from "react-hot-toast";
import { Badge } from "../../components/ui/DesignSystem";
import { OrgLocationSelector } from "../../components/Admin/org/OrgLocationSelector";
import { OrgTasksTab } from "../../components/Admin/org/OrgTasksTab";
import { OrgPmsTab } from "../../components/Admin/org/OrgPmsTab";
import { OrgAgentOutputsTab } from "../../components/Admin/org/OrgAgentOutputsTab";
import { OrgRankingsTab } from "../../components/Admin/org/OrgRankingsTab";
import { OrgNotificationsTab } from "../../components/Admin/org/OrgNotificationsTab";
import { OrgGbpAutomationTab } from "../../components/Admin/org/OrgGbpAutomationTab";
import { OrgSubscriptionSection } from "../../components/Admin/org/OrgSubscriptionSection";
import { OrgUsersSection } from "../../components/Admin/org/OrgUsersSection";
import { OrgPilotSection } from "../../components/Admin/org/OrgPilotSection";
import { OrgConnectionsSection } from "../../components/Admin/org/OrgConnectionsSection";
import { OrgSettingsSection } from "../../components/Admin/org/OrgSettingsSection";
import { OrganizationDetailNavigation } from "../../components/Admin/org/OrganizationDetailNavigation";
import {
  isOrganizationDetailAgentTabKey,
  isOrganizationDetailGbpTabKey,
  isOrganizationDetailSectionKey,
  isOrganizationDetailWebsiteTabKey,
  type OrganizationDetailAgentTabKey,
  type OrganizationDetailGbpTabKey,
  type OrganizationDetailSectionKey,
  type OrganizationDetailSubmenuSectionKey,
  type OrganizationDetailWebsiteTabKey,
} from "../../components/Admin/organizationDetailNavigationConfig";
import type { AdminLocation } from "../../api/admin-organizations";
import WebsiteDetail from "./WebsiteDetail";

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
  const rawPilotUserId = searchParams.get("userId");
  const activeSection = (
    isOrganizationDetailSectionKey(rawSection) ? rawSection : "subscription"
  ) as OrganizationDetailSectionKey;
  const parsedPilotUserId = rawPilotUserId ? parseInt(rawPilotUserId, 10) : null;
  const routePilotUserId =
    parsedPilotUserId && Number.isFinite(parsedPilotUserId)
      ? parsedPilotUserId
      : null;
  const activeAgentTab = (
    activeSection === "agent" && isOrganizationDetailAgentTabKey(rawTab)
      ? rawTab
      : "tasks"
  ) as OrganizationDetailAgentTabKey;
  const activeWebsiteTab = (
    activeSection === "website" && isOrganizationDetailWebsiteTabKey(rawTab)
      ? rawTab
      : "pages"
  ) as OrganizationDetailWebsiteTabKey;
  const activeGbpTab = (
    activeSection === "gbpAutomation" && isOrganizationDetailGbpTabKey(rawTab)
      ? rawTab
      : "reviews"
  ) as OrganizationDetailGbpTabKey;
  const [expandedSection, setExpandedSection] =
    useState<OrganizationDetailSubmenuSectionKey | null>(
      getSubmenuSection(activeSection)
    );

  const [selectedLocation, setSelectedLocation] =
    useState<AdminLocation | null>(null);
  const [selectedPilotUserId, setSelectedPilotUserId] =
    useState<number | null>(routePilotUserId);

  useEffect(() => {
    if (!orgId) {
      toast.error("Invalid organization ID");
      navigate("/admin/mission-control");
    }
  }, [navigate, orgId]);

  useEffect(() => {
    if (locations.length > 0 && !selectedLocation) {
      setSelectedLocation(locations[0]);
    }
  }, [locations, selectedLocation]);

  useEffect(() => {
    setExpandedSection(getSubmenuSection(activeSection));
  }, [activeSection]);

  useEffect(() => {
    if (rawSection === "agent" && rawTab === "gbpAutomation") {
      setSearchParams({ section: "gbpAutomation" });
    }
  }, [rawSection, rawTab, setSearchParams]);

  useEffect(() => {
    if (routePilotUserId) {
      setSelectedPilotUserId(routePilotUserId);
    }
  }, [routePilotUserId]);

  const setSection = (section: OrganizationDetailSectionKey, tab?: string) => {
    const params: Record<string, string> = { section };
    if (tab) params.tab = tab;
    setSearchParams(params);
  };

  const setSubmenuSection = (section: OrganizationDetailSubmenuSectionKey) => {
    setExpandedSection(section);
    setSection(section, getDefaultTab(section));
  };

  const setAgentTab = (tab: OrganizationDetailAgentTabKey) => {
    setSearchParams({ section: "agent", tab });
  };

  const setWebsiteTab = (tab: OrganizationDetailWebsiteTabKey) => {
    setSearchParams({ section: "website", tab });
  };

  const setGbpTab = (tab: OrganizationDetailGbpTabKey) => {
    setSearchParams({ section: "gbpAutomation", tab });
  };

  const setPilotUser = (userId: number | null) => {
    setSelectedPilotUserId(userId);
    const params: Record<string, string> = { section: "pilot" };
    if (userId) params.userId = String(userId);
    setSearchParams(params);
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
      <section className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              onClick={() => navigate("/admin/mission-control")}
              aria-label="Back to Mission Control"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-gray-50 text-gray-600 transition-all duration-200 hover:-translate-x-0.5 hover:border-alloro-orange/30 hover:bg-alloro-orange/10 hover:text-alloro-orange focus:outline-none focus:ring-2 focus:ring-alloro-orange/30"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-alloro-navy text-white shadow-premium">
              <Globe className="h-7 w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                Organization
              </p>
              <h1 className="mt-1 truncate text-2xl font-black tracking-tight text-alloro-navy">
                {org.name}
              </h1>
              <p className="mt-1 truncate text-sm font-semibold text-gray-500">
                {org.domain || "No domain assigned"}
              </p>
            </div>
          </div>
          <div className="flex items-center sm:justify-end">
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge variant="orange">DFY</Badge>
              {org.archived_at && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-bold text-gray-700">
                  <Archive className="h-3.5 w-3.5" />
                  Archived
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {org.archived_at && (
        <section className="rounded-2xl border border-gray-300 bg-gray-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <Archive className="mt-0.5 h-5 w-5 shrink-0 text-gray-700" />
            <div>
              <h2 className="text-sm font-bold text-gray-900">
                This organization is archived
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Connected sites are archived, custom domains are disconnected,
                and automation will not create new work until this organization
                is restored.
              </p>
            </div>
          </div>
        </section>
      )}

      <OrganizationDetailNavigation
        activeSection={activeSection}
        activeAgentTab={activeAgentTab}
        activeWebsiteTab={activeWebsiteTab}
        activeGbpTab={activeGbpTab}
        expandedSection={expandedSection}
        onSectionChange={setSection}
        onSubmenuToggle={setSubmenuSection}
        onAgentTabChange={setAgentTab}
        onWebsiteTabChange={setWebsiteTab}
        onGbpTabChange={setGbpTab}
      />

      <div className="min-h-[600px]">
        <div className="min-w-0">
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

          <div
            aria-hidden={activeSection !== "pilot"}
            className={activeSection === "pilot" ? "block" : "hidden"}
          >
            <OrgPilotSection
              isActive={activeSection === "pilot"}
              org={org}
              selectedUserId={selectedPilotUserId}
              onUserSelect={setPilotUser}
            />
          </div>

          {activeSection === "connections" && (
            <OrgConnectionsSection org={org} />
          )}

          {activeSection === "website" && (
            org.website ? (
              <WebsiteDetail
                projectId={String(org.website.id)}
                embedded
                activeTab={activeWebsiteTab}
                hideTabBar
                onTabChange={setWebsiteTab}
              />
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
                <FileCode className="mx-auto h-10 w-10 text-gray-300" />
                <h3 className="mt-3 text-lg font-semibold text-gray-900">
                  No website connected
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm text-gray-500">
                  Connect this organization to a website project before managing
                  website pages, forms, media, posts, and integrations here.
                </p>
                <button
                  type="button"
                  onClick={() => navigate("/admin/websites")}
                  className="mt-4 rounded-xl bg-alloro-orange px-4 py-2 text-sm font-semibold text-white transition hover:bg-alloro-orange/90"
                >
                  Open Websites
                </button>
              </div>
            )
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
                activeView={activeGbpTab}
                hideHeader
                onViewChange={setGbpTab}
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
            <OrgSettingsSection org={org} orgId={orgId} onRefresh={handleRefresh} />
          )}
        </div>
      </div>

    </div>
  );
}

function getSubmenuSection(
  section: OrganizationDetailSectionKey
): OrganizationDetailSubmenuSectionKey | null {
  if (
    section === "website" ||
    section === "gbpAutomation" ||
    section === "agent"
  ) {
    return section;
  }
  return null;
}

function getDefaultTab(section: OrganizationDetailSubmenuSectionKey): string {
  if (section === "website") return "pages";
  if (section === "gbpAutomation") return "reviews";
  return "tasks";
}
