import type { ReactNode } from "react";

import { ClarityLogo, GoogleLogo, HubSpotLogo, RybbitLogo } from "./integrationLogos";

export type IntegrationPlatform = "hubspot" | "rybbit" | "clarity" | "gsc";

export type ActiveIntegration = {
  platform: IntegrationPlatform;
  status: string;
};

const INTEGRATION_ORDER: IntegrationPlatform[] = ["hubspot", "rybbit", "clarity", "gsc"];

const INTEGRATION_LABELS: Record<IntegrationPlatform, string> = {
  hubspot: "HubSpot",
  rybbit: "Rybbit",
  clarity: "Clarity",
  gsc: "Search Console",
};

const INTEGRATION_LOGOS: Record<IntegrationPlatform, ReactNode> = {
  hubspot: <HubSpotLogo className="h-3.5 w-3.5" />,
  rybbit: <RybbitLogo className="h-4 w-4" />,
  clarity: <ClarityLogo className="h-4 w-4" />,
  gsc: <GoogleLogo className="h-3.5 w-3.5" />,
};

function getActiveIntegrationPlatforms(
  integrations: ActiveIntegration[] | null | undefined,
): IntegrationPlatform[] {
  const platforms = new Set(
    (integrations ?? [])
      .filter((integration) => integration.status === "active")
      .map((integration) => integration.platform),
  );
  return INTEGRATION_ORDER.filter((platform) => platforms.has(platform));
}

/**
 * Renders a compact row of badge logos for a project's active integrations.
 * Shared by the Websites tab and the Mission Control org card. Returns null
 * when there are no active integrations.
 */
export function ActiveIntegrationLogos({
  integrations,
}: {
  integrations?: ActiveIntegration[] | null;
}) {
  const platforms = getActiveIntegrationPlatforms(integrations);
  if (platforms.length === 0) return null;

  return (
    <span className="ml-1 inline-flex items-center gap-1" aria-label="Active integrations">
      {platforms.map((platform) => (
        <span
          key={platform}
          title={INTEGRATION_LABELS[platform]}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white shadow-sm"
        >
          {INTEGRATION_LOGOS[platform]}
        </span>
      ))}
    </span>
  );
}
