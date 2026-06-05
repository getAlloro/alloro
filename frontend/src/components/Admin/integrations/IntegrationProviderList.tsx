import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import type { Integration, IntegrationStatus } from "../../../api/integrations";

import { ClarityLogo, GoogleLogo, HubSpotLogo, RybbitLogo } from "./integrationLogos";

type ProviderStatus = "not_connected" | IntegrationStatus;

interface ProviderEntry {
  platform: string;
  label: string;
  description: string;
  logo: ReactNode;
  bgColor: string;
}

const PROVIDERS: ProviderEntry[] = [
  {
    platform: "hubspot",
    label: "HubSpot",
    description: "Push form submissions as contacts",
    logo: <HubSpotLogo className="w-4.5 h-4.5" />,
    bgColor: "bg-orange-50",
  },
  {
    platform: "rybbit",
    label: "Rybbit",
    description: "Privacy-first website analytics",
    logo: <RybbitLogo className="w-5 h-5" />,
    bgColor: "bg-green-50",
  },
  {
    platform: "clarity",
    label: "Clarity",
    description: "Heatmaps and session recordings",
    logo: <ClarityLogo className="w-5 h-5" />,
    bgColor: "bg-blue-50",
  },
  {
    platform: "gsc",
    label: "Search Console",
    description: "Google search performance data",
    logo: <GoogleLogo className="w-4 h-4" />,
    bgColor: "bg-blue-50",
  },
];

interface Props {
  integrations: Integration[];
  selectedPlatform: string | null;
  onSelectPlatform: (platform: string) => void;
}

const STATUS_BADGE: Record<ProviderStatus, { label: string; className: string }> = {
  not_connected: {
    label: "Not connected",
    className: "bg-gray-100 text-gray-500",
  },
  active: {
    label: "Connected",
    className: "bg-green-100 text-green-700",
  },
  revoked: {
    label: "Revoked",
    className: "bg-red-100 text-red-700",
  },
  broken: {
    label: "Broken",
    className: "bg-amber-100 text-amber-700",
  },
};

export default function IntegrationProviderList({
  integrations,
  selectedPlatform,
  onSelectPlatform,
}: Props) {
  return (
    <div className="flex flex-col h-full border-r border-gray-200">
      {/* Sidebar header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Providers</h3>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {integrations.filter((i) => i.status === "active").length}/{PROVIDERS.length} Providers connected
          </span>
          {/* Placeholder for adding additional providers in v2 */}
          <button
            type="button"
            disabled
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-300 rounded-md cursor-not-allowed"
            title="More providers coming soon"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
      </div>

      {/* Provider list */}
      <div className="flex-1 overflow-y-auto py-1">
        {PROVIDERS.map((provider) => {
          const integration = integrations.find(
            (i) => i.platform === provider.platform,
          );
          const status: ProviderStatus = integration?.status ?? "not_connected";
          const badge = STATUS_BADGE[status];
          const isActive = selectedPlatform === provider.platform;
          const portalId = getPortalId(integration);

          return (
            <motion.button
              key={provider.platform}
              type="button"
              onClick={() => onSelectPlatform(provider.platform)}
              whileTap={{ scale: 0.995 }}
              className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                isActive
                  ? "border-l-alloro-orange bg-orange-50/50"
                  : "border-l-transparent hover:bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${provider.bgColor}`}
                >
                  {provider.logo}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {provider.label}
                    {integration?.label && (
                      <span className="text-gray-400 font-normal ml-1.5">
                        &middot; {integration.label}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {provider.description}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mt-2">
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${badge.className}`}
                >
                  {badge.label}
                </span>
                {portalId && (
                  <span className="text-[10px] text-gray-400 truncate">
                    Portal {portalId}
                  </span>
                )}
              </div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

function getPortalId(integration?: Integration): string | null {
  const portalId = integration?.metadata?.portalId;
  if (typeof portalId === "string" || typeof portalId === "number") {
    return String(portalId);
  }
  return null;
}
