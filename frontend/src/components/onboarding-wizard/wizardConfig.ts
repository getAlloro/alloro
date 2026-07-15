/**
 * Onboarding Wizard Configuration
 * Defines all steps, pages, and demo data for the product tour
 */


export type WizardPage =
  | "dashboard"
  | "pmsStatistics"
  | "referralEngine"
  | "rankings"
  | "patientJourneyInsights"
  | "website"
  | "support"
  | "settings"
  | "settingsUsers"
  | "settingsBilling"
  | "settingsAccount";

export interface WizardStep {
  id: string;
  page: WizardPage;
  /** CSS selector for the element to highlight (null for page overview) */
  targetSelector: string | null;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Whether this is a page overview step (highlights entire content area) */
  isPageOverview?: boolean;
  /** Whether to scroll to this element */
  scrollToElement?: boolean;
  /** Special action: prompt user to click something */
  promptAction?: {
    type: "click" | "navigate";
    target: string;
    buttonText: string;
  };
}

export const WIZARD_STEPS: WizardStep[] = [
  // ========== PRACTICE HUB (Dashboard) — 5 steps ==========
  // Simplified redesign: the Trajectory and Action-Queue steps were retired
  // along with their cards. plans/06092026-practice-hub-simplification.
  {
    id: "dashboard-overview",
    page: "dashboard",
    targetSelector: null,
    title: "Welcome to Practice Hub",
    description:
      "This is your command center. One top priority, your production trend, and the four metrics that matter — all on one page.",
    isPageOverview: true,
  },
  {
    id: "dashboard-hero",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-hero']",
    title: "Your Top Priority",
    description:
      'Every month, Alloro surfaces the single most impactful action for your practice. This banner shows what it is and why it matters — expand "Details" for the full picture.',
    scrollToElement: true,
  },
  {
    id: "dashboard-pms",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-pms']",
    title: "Production",
    description:
      "Your year-to-date production charted across the year, with the month-over-month trend so you can see where you're heading.",
    scrollToElement: true,
  },
  {
    id: "dashboard-website",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-website']",
    title: "Form Submissions",
    description:
      "New website leads this month at a glance. Click through to your full submissions inbox.",
    scrollToElement: true,
  },
  {
    id: "dashboard-visibility",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-visibility']",
    title: "Local Visibility",
    description:
      "Your estimated Google Maps position and whether a fresh Google post is due — the levers that move your local search ranking.",
    scrollToElement: true,
  },

  // ========== REFERRALS HUB (PMS Statistics) — 4 steps ==========
  // Simplified redesign: velocity step retired; insights step re-pointed to
  // the "1 action" banner. plans/06102026-referrals-hub-simplification.
  {
    id: "pms-overview",
    page: "pmsStatistics",
    targetSelector: null,
    title: "Referrals Hub",
    description:
      "See where your patients come from. Switch between month, quarter, and year-to-date to track production and referrals over time.",
    isPageOverview: true,
  },
  {
    id: "pms-vitals",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-vitals']",
    title: "Your Numbers",
    description:
      "Production for the selected period, total referrals, your active source count, and year-to-date production — at a glance.",
    scrollToElement: true,
  },
  {
    id: "pms-insights",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-insights']",
    title: "The One Action",
    description:
      "Alloro flags the single most important move — like protecting the top sources that drive most of your referrals.",
    scrollToElement: true,
  },
  {
    id: "pms-upload",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-upload']",
    title: "Upload PMS Data",
    description:
      "Drop a CSV, use our guided wizard, or enter data manually. Alloro processes and analyzes your practice management data automatically.",
    scrollToElement: true,
  },

  // ========== REVENUE SOURCES (Referral Engine) — 2 steps ==========
  {
    id: "re-overview",
    page: "referralEngine",
    targetSelector: null,
    title: "Revenue Sources",
    description:
      "See exactly which marketing channels and referring doctors generate the most production. Powered by your PMS data.",
    isPageOverview: true,
  },
  {
    id: "re-matrix",
    page: "referralEngine",
    targetSelector: "[data-wizard-target='re-matrix']",
    title: "Attribution Matrix",
    description:
      "The full breakdown: every referral source, their production value, referral count, and trend direction — filterable by doctor vs. marketing.",
    scrollToElement: true,
  },

  // ========== LOCAL RANKINGS — 3 steps ==========
  // Simplified redesign: the Visibility/Health score and factor breakdown
  // were retired, so the "Visibility Drivers" step is gone and the rank step
  // re-points to the map hero. plans/06102026-local-rankings-simplification.
  {
    id: "rankings-overview",
    page: "rankings",
    targetSelector: null,
    title: "Local Rankings",
    description:
      "See exactly where you rank against the practices nearest you, and the one move that protects or improves your position.",
    isPageOverview: true,
  },
  {
    id: "rankings-score",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-score']",
    title: "Your Rank on the Map",
    description:
      "Your live Google Maps position for one standard search, with every tracked competitor plotted around you.",
    scrollToElement: true,
  },
  {
    id: "rankings-competitors",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-competitors']",
    title: "Competitor Landscape",
    description:
      "How you stack up against the practices you track — open Manage Competitors to adjust the set.",
    scrollToElement: true,
  },

  // ========== PATIENT JOURNEY INSIGHTS — 2 steps ==========
  {
    id: "pji-overview",
    page: "patientJourneyInsights",
    targetSelector: null,
    title: "Patient Journey Insights",
    description:
      "Understand how patients discover and choose your practice — from initial consideration through the booking decision.",
    isPageOverview: true,
  },
  {
    id: "pji-stages",
    page: "patientJourneyInsights",
    targetSelector: "[data-wizard-target='pji-stages']",
    title: "Journey Stages",
    description:
      "Consideration tracks your Google reputation (reviews, ratings, calls). Decision tracks your website experience (sessions, bounce rate). Both feed AI-generated insights.",
    scrollToElement: true,
  },

  // ========== WEBSITES — 3 steps ==========
  {
    id: "website-overview",
    page: "website",
    targetSelector: null,
    title: "Your Website",
    description:
      "Manage your practice website, track form submissions, and publish blog posts — all from one place.",
    isPageOverview: true,
  },
  {
    id: "website-editor",
    page: "website",
    targetSelector: "[data-wizard-target='website-editor']",
    title: "Visual Editor",
    description:
      "Edit your website visually with our AI-powered editor. Click any section to modify text, images, and layout — changes go live when you save.",
    scrollToElement: true,
  },
  {
    id: "website-submissions",
    page: "website",
    targetSelector: "[data-wizard-target='website-submissions']",
    title: "Form Submissions",
    description:
      "Every form submission from your website lands here. Track new leads, flag important ones, and never miss a patient inquiry.",
    scrollToElement: true,
  },

  // ========== SUPPORT — 1 step ==========
  {
    id: "support-overview",
    page: "support",
    targetSelector: null,
    title: "Help Desk",
    description:
      "Need help? Submit a support ticket, track its status, and keep the full conversation with our team in one place.",
    isPageOverview: true,
  },

  // ========== SETTINGS: INTEGRATIONS — 2 steps ==========
  {
    id: "settings-overview",
    page: "settings",
    targetSelector: null,
    title: "Settings & Integrations",
    description:
      "Connect your Google accounts, manage locations, and configure integrations to unlock the full power of Alloro.",
    isPageOverview: true,
  },
  {
    id: "settings-integrations",
    page: "settings",
    targetSelector: "[data-wizard-target='settings-integrations']",
    title: "Google Integrations",
    description:
      "Connect Google Business Profile and Search Console here. Your practice locations have their own Locations tab, where each location gets its own GBP connection.",
    scrollToElement: true,
  },

  // ========== SETTINGS: USERS & ROLES — 1 step ==========
  {
    id: "settings-users",
    page: "settingsUsers",
    targetSelector: "[data-wizard-target='settings-users']",
    title: "Team Members & Roles",
    description:
      "Invite team members and control who has access. Admins manage everything, Managers handle day-to-day, Viewers can only read.",
    scrollToElement: true,
  },

  // ========== SETTINGS: BILLING — 1 step ==========
  {
    id: "settings-billing",
    page: "settingsBilling",
    targetSelector: "[data-wizard-target='settings-billing']",
    title: "Subscription & Billing",
    description:
      "View your active plan, manage payment methods, and track your subscription status.",
    scrollToElement: true,
  },

  // ========== SETTINGS: ACCOUNT — 1 step ==========
  {
    id: "settings-account",
    page: "settingsAccount",
    targetSelector: "[data-wizard-target='settings-account']",
    title: "Account Security",
    description:
      "Set or change your account password to keep your practice data secure.",
    scrollToElement: true,
  },

  // ========== FINAL CTA — Back to PMS Upload ==========
  {
    id: "final-pms-upload",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-upload']",
    title: "You're All Set!",
    description:
      "That's the full tour. Upload your practice management data to start receiving personalized insights and growth recommendations.",
    scrollToElement: true,
    promptAction: {
      type: "click",
      target: "[data-wizard-target='pms-upload']",
      buttonText: "Let's get started!",
    },
  },
];

/**
 * Get steps for a specific page
 */
export function getStepsForPage(page: WizardPage): WizardStep[] {
  return WIZARD_STEPS.filter((step) => step.page === page);
}

/**
 * Get the page route for a wizard page
 */
export function getPageRoute(page: WizardPage): string {
  const routes: Record<WizardPage, string> = {
    dashboard: "/dashboard",
    pmsStatistics: "/pmsStatistics",
    referralEngine: "/referralEngine",
    rankings: "/rankings",
    patientJourneyInsights: "/patientJourneyInsights",
    website: "/dfy/website",
    support: "/help",
    settings: "/settings",
    settingsUsers: "/settings/users",
    settingsBilling: "/settings/billing",
    settingsAccount: "/settings/account",
  };
  return routes[page];
}

/**
 * Get the page name for display
 */
export function getPageDisplayName(page: WizardPage): string {
  const names: Record<WizardPage, string> = {
    dashboard: "Practice Hub",
    pmsStatistics: "Referrals Hub",
    referralEngine: "Revenue Sources",
    rankings: "Local Rankings",
    patientJourneyInsights: "Patient Journey",
    website: "Websites",
    support: "Support",
    settings: "Settings",
    settingsUsers: "Users & Roles",
    settingsBilling: "Billing",
    settingsAccount: "Account",
  };
  return names[page];
}

// WIZARD_DEMO_DATA is a large static fixture; it lives in ./wizardDemoData
// and is re-exported here so existing imports keep working.
export { WIZARD_DEMO_DATA } from "./wizardDemoData";
