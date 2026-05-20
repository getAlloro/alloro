import type { DocPage } from "../../types/docs";
import { ReferralsHubReplica } from "../../components/replicas/ReferralsHubReplica";

export const referralsHubPage: DocPage = {
  slug: "referrals-hub",
  route: "/pmsStatistics",
  title: "Referrals Hub",
  description:
    "The Referrals Hub is your Revenue Attribution Dashboard — showing which marketing channels and doctor relationships drive referrals, production, and your next best growth moves.",
  category: "dashboard",
  replica: ReferralsHubReplica,
  hotspots: [
    {
      id: "stats-row",
      x: 5,
      y: 18,
      width: 90,
      height: 12,
      label: "Monthly Totals",
      description:
        "Four metric cards showing MKT Production, Doc Production, Total Starts, and Confidence Score with trend indicators.",
      step: 1,
    },
    {
      id: "production-chart",
      x: 5,
      y: 32,
      width: 90,
      height: 28,
      label: "Referral Velocity Pipeline",
      description:
        "Trailing 6-month horizontal bar chart comparing marketing (self) referrals vs doctor referrals per month.",
      step: 2,
    },
    {
      id: "referral-sources",
      x: 5,
      y: 62,
      width: 90,
      height: 20,
      label: "Attribution Master Matrix",
      description:
        "Filterable table showing every referral source with volume, average production per referral, total production, and intelligence notes.",
      step: 3,
    },
    {
      id: "referral-matrix",
      x: 5,
      y: 84,
      width: 90,
      height: 14,
      label: "Ledger Ingestion",
      description:
        "Upload area for PMS exports (Cloud9, Dolphin, Gaidge). HIPAA-secure, AES-256 encrypted file ingestion.",
      step: 4,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Review monthly totals",
      description:
        "Check MKT and Doc production, total starts, and the AI confidence score. Trend badges show month-over-month movement.",
      hotspotId: "stats-row",
    },
    {
      number: 2,
      title: "Analyze referral velocity",
      description:
        "The pipeline chart shows 6 months of marketing vs doctor referral volume side-by-side so you can spot seasonal patterns.",
      hotspotId: "production-chart",
    },
    {
      number: 3,
      title: "Drill into the attribution matrix",
      description:
        "Filter by All, Doctor, or Marketing to see which sources drive the most volume and production. Intelligence notes surface actionable insights.",
      hotspotId: "referral-sources",
    },
    {
      number: 4,
      title: "Upload PMS data",
      description:
        "Drag or click to upload your latest PMS export. The system auto-detects Cloud9, Dolphin, and Gaidge formats and refreshes all models.",
      hotspotId: "referral-matrix",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary:
        "Initial documentation baseline for the Referrals Hub PMS Visual Pillars view.",
    },
    {
      version: "0.0.83",
      date: "May 2026",
      summary:
        "Replaced placeholder replica with visual replica of the real Revenue Attribution Dashboard (ReferralEngineDashboard).",
    },
  ],
};
