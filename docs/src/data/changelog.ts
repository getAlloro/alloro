import type { ChangelogEntry } from "../types/docs";

export const CHANGELOG_ENTRIES: ChangelogEntry[] = [
  {
    version: "0.0.82",
    date: "May 2026",
    title: "SerpApi Maps Estimate Source",
    summary: "Moved the Local Rankings headline Google Maps estimate from the legacy Apify Maps actor to SerpApi Google Maps search centered on the client's saved GBP coordinates.",
    pagesAffected: ["local-rankings", "practice-hub"],
  },
  {
    version: "0.0.81",
    date: "May 2026",
    title: "Integration Revocation Repair",
    summary: "Stopped the CRM mapping validation worker from applying HubSpot-style credential validation to analytics integrations, preventing incorrect revocation markers.",
    pagesAffected: ["settings-integrations"],
  },
  {
    version: "0.0.80",
    date: "May 2026",
    title: "Website Project Archive Tab",
    summary: "Added an admin-only Archive view for website projects so staff can move projects out of the normal Active and Inactive lists without changing live status.",
    pagesAffected: ["website"],
  },
  {
    version: "0.0.79",
    date: "May 2026",
    title: "Harvest Row JSON Inspector",
    summary: "Added a lazy JSON inspector for integration harvest rows so admins can inspect stored raw analytics payloads.",
    pagesAffected: ["settings-integrations"],
  },
  {
    version: "0.0.78",
    date: "May 2026",
    title: "Selected Competitor Maps List Clarity",
    summary: "Improved the competitor comparison view in the Local Rankings dashboard with clearer labeling and list organization.",
    pagesAffected: ["local-rankings"],
  },
];
