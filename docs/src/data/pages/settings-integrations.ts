import type { DocPage } from "../../types/docs";
import { IntegrationsReplica } from "../../components/replicas/IntegrationsReplica";

export const settingsIntegrationsPage: DocPage = {
  slug: "settings-integrations",
  route: "/settings/integrations",
  title: "Integrations",
  description:
    "The Integrations settings page lets you connect and manage the third-party services that power your Alloro data. Connect your Google Business Profile, analytics platforms, and practice management system from one place.",
  category: "settings",
  replica: IntegrationsReplica,
  hotspots: [
    {
      id: "gbp-connect",
      x: 54,
      y: 17,
      width: 40,
      height: 8,
      label: "Google Business Profile",
      description: "Connect your GBP account to enable local rankings tracking, review monitoring, and profile optimization recommendations. Click Connect to start the OAuth flow.",
      action: "Click",
      step: 1,
    },
    {
      id: "analytics-connections",
      x: 24,
      y: 17,
      width: 28,
      height: 25,
      label: "Analytics Connections",
      description: "Connect Google Analytics or other platforms to pull traffic and conversion data into your dashboard. Each platform has its own connect button.",
      action: "Click",
      step: 2,
    },
    {
      id: "connection-status",
      x: 24,
      y: 45,
      width: 28,
      height: 17,
      label: "Connection Status",
      description: "A green badge means the integration is active and syncing. Red or yellow indicates an error — click the integration card to see details and re-authorize if needed.",
      step: 3,
    },
    {
      id: "disconnect-btn",
      x: 54,
      y: 37,
      width: 40,
      height: 16,
      label: "Disconnect",
      description: "Click to revoke an existing integration. Disconnecting will stop data sync for that service until you reconnect.",
      action: "Click",
      step: 4,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Connect Google Business Profile",
      description: "Click Connect next to Google Business Profile and complete the OAuth authorization. This is required for local rankings and review data to appear in your dashboard.",
      hotspotId: "gbp-connect",
    },
    {
      number: 2,
      title: "Connect analytics platforms",
      description: "Link Google Analytics or other supported platforms to bring traffic data into your Alloro reports.",
      hotspotId: "analytics-connections",
    },
    {
      number: 3,
      title: "Monitor connection health",
      description: "Green status badges confirm active sync. If a badge turns red, click the card to re-authorize the connection — this usually fixes token expiration issues.",
      hotspotId: "connection-status",
    },
    {
      number: 4,
      title: "Disconnect an integration",
      description: "Use the disconnect button only if you need to remove a service or switch accounts. Data for that integration will stop syncing until you reconnect.",
      hotspotId: "disconnect-btn",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the Integrations settings page.",
    },
    {
      version: "0.0.81",
      date: "April 2026",
      summary: "Fixed OAuth token revocation bug — disconnecting and reconnecting GBP now reliably clears the previous session before issuing a new token.",
    },
  ],
};
