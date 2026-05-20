import type { DocPage } from "../../types/docs";
import { BillingReplica } from "../../components/replicas/BillingReplica";

export const settingsBillingPage: DocPage = {
  slug: "settings-billing",
  route: "/settings/billing",
  title: "Billing",
  description:
    "The Billing settings page shows your current subscription plan, stored payment method, and a history of past invoices. Manage your plan and update payment details from here.",
  category: "settings",
  replica: BillingReplica,
  hotspots: [
    {
      id: "current-plan",
      x: 24,
      y: 14,
      width: 70,
      height: 23,
      label: "Current Plan",
      description: "Shows your active subscription plan, renewal date, and included features. Contact your Alloro account manager to discuss plan changes.",
      step: 1,
    },
    {
      id: "payment-method",
      x: 24,
      y: 39,
      width: 70,
      height: 24,
      label: "Payment Method",
      description: "Displays the credit card on file for your subscription. Click Update to change the card or add a new payment method.",
      action: "Click",
      step: 2,
    },
    {
      id: "invoice-history",
      x: 24,
      y: 72,
      width: 70,
      height: 22,
      label: "Invoice History",
      description: "A list of past invoices with amount, date, and status. Click any row to download the PDF invoice for your records.",
      action: "Click",
      step: 3,
    },
  ],
  steps: [
    {
      number: 1,
      title: "Review your plan",
      description: "Check your current plan details including what's included and when your next renewal date is. Reach out to your account manager if you need to adjust your plan.",
      hotspotId: "current-plan",
    },
    {
      number: 2,
      title: "Update your payment method",
      description: "If your card is expiring or you need to switch payment methods, click Update and enter your new card details.",
      hotspotId: "payment-method",
    },
    {
      number: 3,
      title: "Download invoices",
      description: "Click any row in the invoice history to download a PDF invoice. Useful for accounting and expense reporting.",
      hotspotId: "invoice-history",
    },
  ],
  changelog: [
    {
      version: "0.0.82",
      date: "May 2026",
      summary: "Initial documentation baseline for the Billing settings page.",
    },
  ],
};
