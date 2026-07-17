import type { ReactNode } from "react";
import {
  Archive,
  ArrowRightLeft,
  Bell,
  Code,
  Database,
  DollarSign,
  FileText,
  Image,
  Inbox,
  Layout,
  Menu,
  MessageSquare,
  Newspaper,
  Plug,
  Settings,
  Share2,
  Star,
  Target,
  TrendingUp,
  Trophy,
  Wrench,
} from "lucide-react";
import {
  ORGANIZATION_DETAIL_AGENT_TAB_KEYS,
  ORGANIZATION_DETAIL_GBP_TAB_KEYS,
  ORGANIZATION_DETAIL_WEBSITE_TAB_KEYS,
  type OrganizationDetailAgentTabKey,
  type OrganizationDetailGbpTabKey,
  type OrganizationDetailSectionKey,
  type OrganizationDetailSubmenuSectionKey,
  type OrganizationDetailWebsiteTabKey,
} from "../organizationDetailNavigationConfig";

const AGENT_TAB_CONFIG: Record<
  OrganizationDetailAgentTabKey,
  { label: string; icon: ReactNode }
> = {
  notifications: { label: "Notifications", icon: <Bell className="h-3.5 w-3.5" /> },
  rankings: { label: "Rankings", icon: <Trophy className="h-3.5 w-3.5" /> },
  pms: { label: "PMS Ingestion", icon: <Database className="h-3.5 w-3.5" /> },
  proofline: { label: "Proofline", icon: <MessageSquare className="h-3.5 w-3.5" /> },
  summary: { label: "Summary", icon: <FileText className="h-3.5 w-3.5" /> },
  opportunity: { label: "Opportunity", icon: <TrendingUp className="h-3.5 w-3.5" /> },
  cro: { label: "CRO", icon: <Target className="h-3.5 w-3.5" /> },
  referral: { label: "Referral Engine", icon: <Share2 className="h-3.5 w-3.5" /> },
};

const WEBSITE_TAB_CONFIG: Record<
  OrganizationDetailWebsiteTabKey,
  { label: string; icon: ReactNode }
> = {
  pages: { label: "Pages", icon: <FileText className="h-3.5 w-3.5" /> },
  layouts: { label: "Layouts", icon: <Layout className="h-3.5 w-3.5" /> },
  "code-manager": { label: "Code Manager", icon: <Code className="h-3.5 w-3.5" /> },
  media: { label: "Media", icon: <Image className="h-3.5 w-3.5" /> },
  "form-submissions": { label: "Forms", icon: <Inbox className="h-3.5 w-3.5" /> },
  posts: { label: "Posts", icon: <Newspaper className="h-3.5 w-3.5" /> },
  menus: { label: "Menus", icon: <Menu className="h-3.5 w-3.5" /> },
  reviews: { label: "Reviews", icon: <Star className="h-3.5 w-3.5" /> },
  redirects: { label: "Redirects", icon: <ArrowRightLeft className="h-3.5 w-3.5" /> },
  integrations: { label: "Integrations", icon: <Plug className="h-3.5 w-3.5" /> },
  backups: { label: "Backups", icon: <Archive className="h-3.5 w-3.5" /> },
  "advanced-tools": { label: "Advanced Tools", icon: <Wrench className="h-3.5 w-3.5" /> },
  costs: { label: "Costs", icon: <DollarSign className="h-3.5 w-3.5" /> },
};

const GBP_TAB_CONFIG: Record<
  OrganizationDetailGbpTabKey,
  { label: string; icon: ReactNode }
> = {
  reviews: { label: "Reviews", icon: <Star className="h-3.5 w-3.5" /> },
  posts: { label: "GBP Posts", icon: <Newspaper className="h-3.5 w-3.5" /> },
  settings: { label: "Settings", icon: <Settings className="h-3.5 w-3.5" /> },
};

export type OrganizationDetailSubmenuRowProps = {
  activeSection: OrganizationDetailSectionKey;
  activeAgentTab: OrganizationDetailAgentTabKey;
  activeWebsiteTab: OrganizationDetailWebsiteTabKey;
  activeGbpTab: OrganizationDetailGbpTabKey;
  expandedSection: OrganizationDetailSubmenuSectionKey;
  onAgentTabChange: (tab: OrganizationDetailAgentTabKey) => void;
  onWebsiteTabChange: (tab: OrganizationDetailWebsiteTabKey) => void;
  onGbpTabChange: (tab: OrganizationDetailGbpTabKey) => void;
};

export function OrganizationDetailSubmenuRow({
  activeSection,
  activeAgentTab,
  activeWebsiteTab,
  activeGbpTab,
  expandedSection,
  onAgentTabChange,
  onWebsiteTabChange,
  onGbpTabChange,
}: OrganizationDetailSubmenuRowProps) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-gray-100 pt-2">
      {expandedSection === "agent" &&
        ORGANIZATION_DETAIL_AGENT_TAB_KEYS.map((tab) => (
          <SubmenuButton
            key={tab}
            active={activeSection === "agent" && activeAgentTab === tab}
            icon={AGENT_TAB_CONFIG[tab].icon}
            label={AGENT_TAB_CONFIG[tab].label}
            onClick={() => onAgentTabChange(tab)}
          />
        ))}
      {expandedSection === "website" &&
        ORGANIZATION_DETAIL_WEBSITE_TAB_KEYS.map((tab) => (
          <SubmenuButton
            key={tab}
            active={activeSection === "website" && activeWebsiteTab === tab}
            icon={WEBSITE_TAB_CONFIG[tab].icon}
            label={WEBSITE_TAB_CONFIG[tab].label}
            onClick={() => onWebsiteTabChange(tab)}
          />
        ))}
      {expandedSection === "gbpAutomation" &&
        ORGANIZATION_DETAIL_GBP_TAB_KEYS.map((tab) => (
          <SubmenuButton
            key={tab}
            active={activeSection === "gbpAutomation" && activeGbpTab === tab}
            icon={GBP_TAB_CONFIG[tab].icon}
            label={GBP_TAB_CONFIG[tab].label}
            onClick={() => onGbpTabChange(tab)}
          />
        ))}
    </div>
  );
}

function SubmenuButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "bg-alloro-orange/10 text-alloro-orange"
          : "text-gray-500 hover:bg-gray-50 hover:text-gray-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
