import type { ReactNode } from "react";
import {
  BarChart3,
  ChevronDown,
  Crown,
  FileCode,
  Globe,
  MonitorPlay,
  MessageSquare,
  Settings,
  Users,
} from "lucide-react";
import {
  ORGANIZATION_DETAIL_SECTION_KEYS,
  type OrganizationDetailAgentTabKey,
  type OrganizationDetailGbpTabKey,
  type OrganizationDetailSectionKey,
  type OrganizationDetailSubmenuSectionKey,
  type OrganizationDetailWebsiteTabKey,
} from "../organizationDetailNavigationConfig";
import { OrganizationDetailSubmenuRow } from "./OrganizationDetailSubmenuRow";

const SECTION_CONFIG: Record<
  OrganizationDetailSectionKey,
  { label: string; icon: ReactNode }
> = {
  subscription: { label: "Subscription", icon: <Crown className="h-4 w-4" /> },
  users: { label: "Users & Roles", icon: <Users className="h-4 w-4" /> },
  pilot: { label: "Pilot", icon: <MonitorPlay className="h-4 w-4" /> },
  connections: { label: "Connections", icon: <Globe className="h-4 w-4" /> },
  website: { label: "Website", icon: <FileCode className="h-4 w-4" /> },
  gbpAutomation: {
    label: "GBP Automation",
    icon: <MessageSquare className="h-4 w-4" />,
  },
  agent: { label: "Agent Results", icon: <BarChart3 className="h-4 w-4" /> },
  settings: {
    label: "Organization Settings",
    icon: <Settings className="h-4 w-4" />,
  },
};

export type OrganizationDetailNavigationProps = {
  activeSection: OrganizationDetailSectionKey;
  activeAgentTab: OrganizationDetailAgentTabKey;
  activeWebsiteTab: OrganizationDetailWebsiteTabKey;
  activeGbpTab: OrganizationDetailGbpTabKey;
  expandedSection: OrganizationDetailSubmenuSectionKey | null;
  onSectionChange: (section: OrganizationDetailSectionKey) => void;
  onSubmenuToggle: (section: OrganizationDetailSubmenuSectionKey) => void;
  onAgentTabChange: (tab: OrganizationDetailAgentTabKey) => void;
  onWebsiteTabChange: (tab: OrganizationDetailWebsiteTabKey) => void;
  onGbpTabChange: (tab: OrganizationDetailGbpTabKey) => void;
};

export function OrganizationDetailNavigation({
  activeSection,
  activeAgentTab,
  activeWebsiteTab,
  activeGbpTab,
  expandedSection,
  onSectionChange,
  onSubmenuToggle,
  onAgentTabChange,
  onWebsiteTabChange,
  onGbpTabChange,
}: OrganizationDetailNavigationProps) {
  return (
    <nav className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {ORGANIZATION_DETAIL_SECTION_KEYS.map((key) => {
          const config = SECTION_CONFIG[key];
          const isActive = activeSection === key;
          const submenuSection = getSubmenuSection(key);

          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                if (submenuSection) onSubmenuToggle(submenuSection);
                else onSectionChange(key);
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-alloro-orange/10 text-alloro-orange"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              }`}
            >
              {config.icon}
              {config.label}
              {submenuSection && (
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    expandedSection === submenuSection ? "rotate-180" : ""
                  }`}
                />
              )}
            </button>
          );
        })}
      </div>

      {expandedSection && (
        <OrganizationDetailSubmenuRow
          activeSection={activeSection}
          activeAgentTab={activeAgentTab}
          activeWebsiteTab={activeWebsiteTab}
          activeGbpTab={activeGbpTab}
          expandedSection={expandedSection}
          onAgentTabChange={onAgentTabChange}
          onWebsiteTabChange={onWebsiteTabChange}
          onGbpTabChange={onGbpTabChange}
        />
      )}
    </nav>
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
