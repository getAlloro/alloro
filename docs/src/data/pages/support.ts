import type { DocPage } from "../../types/docs";
import { SupportReplica } from "../../components/replicas/SupportReplica";

export const supportPage: DocPage = {
  slug: "support",
  route: "/help",
  title: "Support",
  description:
    "The Support page is where you can submit tickets, track open requests, and view responses from the Alloro support team. Open a new ticket for technical issues, content update requests, or questions about your account.",
  category: "help",
  replica: SupportReplica,
  hotspots: [
    {
      id: "new-ticket-btn",
      x: 86,
      y: 8,
      width: 11,
      height: 5,
      label: "New Ticket",
      description: "Click to open a new support request. Describe your issue clearly and include any relevant details — screenshots or error messages help the team respond faster.",
      action: "Click",
      step: 1,
    },
    {
      id: "ticket-list",
      x: 21,
      y: 16,
      width: 23,
      height: 42,
      label: "Ticket List",
      description: "All open and recent tickets are listed here with their subject, status (Open, In Progress, Resolved), and last update time. Click any ticket to view the full thread.",
      action: "Click",
      step: 2,
    },
    {
      id: "ticket-detail",
      x: 47,
      y: 16,
      width: 48,
      height: 42,
      label: "Ticket Detail",
      description: "The selected ticket's full conversation thread appears here. You can read support responses and reply directly from this panel.",
      action: "Click",
      step: 3,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Open a new ticket",
      description: "Click New Ticket and fill in the subject and description. Be specific about what you're seeing — the more detail you provide, the faster the team can help.",
      hotspotId: "new-ticket-btn",
    },
    {
      number: 2,
      title: "Review your ticket list",
      description: "The ticket list shows all your open and recent support requests. Status badges tell you at a glance what's pending, in progress, or resolved.",
      hotspotId: "ticket-list",
    },
    {
      number: 3,
      title: "Read and reply in the detail view",
      description: "Click any ticket to open the full conversation thread. You can read support responses and send a reply without leaving the page.",
      hotspotId: "ticket-detail",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the Support page.",
    },
  ],
};
