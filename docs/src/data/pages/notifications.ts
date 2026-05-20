import type { DocPage } from "../../types/docs";
import { NotificationsReplica } from "../../components/replicas/NotificationsReplica";

export const notificationsPage: DocPage = {
  slug: "notifications",
  route: "/notifications",
  title: "Notifications",
  description:
    "The Notifications page shows a chronological feed of alerts and updates from across your Alloro account — ranking changes, new reviews, task reminders, PMS sync issues, and system announcements.",
  category: "dashboard",
  replica: NotificationsReplica,
  hotspots: [
    {
      id: "header-actions",
      x: 24,
      y: 2,
      width: 70,
      height: 7,
      label: "Header & Actions",
      description: "The notifications page header with mark-all-read and filter actions.",
      step: 1,
    },
    {
      id: "notification-card-1",
      x: 24,
      y: 14,
      width: 70,
      height: 25,
      label: "Notification — Ranking Improved",
      description: "A notification card indicating your local search ranking has improved. Click to view the full ranking details.",
      action: "Click",
      step: 2,
    },
    {
      id: "notification-card-2",
      x: 24,
      y: 44,
      width: 70,
      height: 25,
      label: "Notification — New Review",
      description: "A notification card alerting you to a new patient review. Click to read the review and respond.",
      action: "Click",
      step: 3,
    },
    {
      id: "notification-card-3",
      x: 24,
      y: 74,
      width: 70,
      height: 20,
      label: "Notification — Website Published",
      description: "A notification card confirming your website changes have been published. Click for details.",
      action: "Click",
      step: 4,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Use header actions",
      description: "The header provides mark-all-read and filter controls to manage your notification feed efficiently.",
      hotspotId: "header-actions",
    },
    {
      number: 2,
      title: "Check ranking improvements",
      description: "Click the ranking notification to see which keywords improved and by how many positions.",
      hotspotId: "notification-card-1",
    },
    {
      number: 3,
      title: "Respond to new reviews",
      description: "Click the new review notification to read the patient's feedback and craft a response.",
      hotspotId: "notification-card-2",
    },
    {
      number: 4,
      title: "Confirm website published",
      description: "Click the website published notification to verify your changes are live and see what was updated.",
      hotspotId: "notification-card-3",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the Notifications feed.",
    },
  ],
};
