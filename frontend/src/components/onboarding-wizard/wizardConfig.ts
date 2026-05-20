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
  | "tasks"
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
  // ========== PRACTICE HUB (Dashboard) — 7 steps ==========
  {
    id: "dashboard-overview",
    page: "dashboard",
    targetSelector: null,
    title: "Welcome to Practice Hub",
    description:
      "This is your command center. One top priority, key metrics, and everything you need to run your practice — all on one page.",
    isPageOverview: true,
  },
  {
    id: "dashboard-hero",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-hero']",
    title: "Your Top Priority",
    description:
      "Every month, Alloro surfaces the single most impactful action for your practice. This card shows what it is, why it matters, and exactly what to do.",
    scrollToElement: true,
  },
  {
    id: "dashboard-trajectory",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-trajectory']",
    title: "Practice Trajectory",
    description:
      "A personalized daily briefing from Alloro's intelligence engine. See your production, new patient starts, and visibility score with month-over-month trends.",
    scrollToElement: true,
  },
  {
    id: "dashboard-queue",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-queue']",
    title: "Action Queue",
    description:
      "After your top priority, these are the next actions ranked by impact. Click any item to jump straight to the details in your To-Do List.",
    scrollToElement: true,
  },
  {
    id: "dashboard-website",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-website']",
    title: "Website Performance",
    description:
      "Track verified form submissions from your website over the last 12 months. See unread leads, flagged entries, and conversion trends at a glance.",
    scrollToElement: true,
  },
  {
    id: "dashboard-visibility",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-visibility']",
    title: "Local Visibility",
    description:
      "Your estimated Google Maps position, Practice Health score, and the key ranking factors driving your local search visibility.",
    scrollToElement: true,
  },
  {
    id: "dashboard-pms",
    page: "dashboard",
    targetSelector: "[data-wizard-target='dashboard-pms']",
    title: "PMS Summary",
    description:
      "Current-month production, total referrals, and your referral mix (doctor vs. self). See your top referral sources and 12-month production trend.",
    scrollToElement: true,
  },

  // ========== REFERRALS HUB (PMS Statistics) — 5 steps ==========
  {
    id: "pms-overview",
    page: "pmsStatistics",
    targetSelector: null,
    title: "Referrals Hub",
    description:
      "Deep-dive into where your patients come from. Upload PMS data and Alloro analyzes referral patterns, revenue attribution, and growth opportunities.",
    isPageOverview: true,
  },
  {
    id: "pms-vitals",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-vitals']",
    title: "PMS Vitals",
    description:
      "Year-to-date production, total referrals, and referral source count — your key PMS health metrics at a glance.",
    scrollToElement: true,
  },
  {
    id: "pms-insights",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-insights']",
    title: "What's Good & What's Risky",
    description:
      "Alloro highlights positive trends and potential concerns in your referral data so you know where to focus your energy.",
    scrollToElement: true,
  },
  {
    id: "pms-velocity",
    page: "pmsStatistics",
    targetSelector: "[data-wizard-target='pms-velocity']",
    title: "Referral Velocity",
    description:
      "Monthly referral volume over time — see whether your pipeline is growing, steady, or needs attention.",
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

  // ========== LOCAL RANKINGS — 4 steps ==========
  {
    id: "rankings-overview",
    page: "rankings",
    targetSelector: null,
    title: "Local Rankings",
    description:
      "Track how your practice ranks in local Google search results. We scan your area, analyze competitors, and identify what's driving your visibility.",
    isPageOverview: true,
  },
  {
    id: "rankings-score",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-score']",
    title: "Practice Performance",
    description:
      "Your live Google Maps rank estimate, Practice Health score, and the key metrics that matter — reviews, rating, and search visibility.",
    scrollToElement: true,
  },
  {
    id: "rankings-factors",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-factors']",
    title: "Visibility Drivers",
    description:
      "What's working for you and what's holding you back. Each factor is scored and ranked so you know exactly where to improve.",
    scrollToElement: true,
  },
  {
    id: "rankings-competitors",
    page: "rankings",
    targetSelector: "[data-wizard-target='rankings-competitors']",
    title: "Competitor Landscape",
    description:
      "See who you're competing against in Google Maps. Compare star ratings, review counts, and positions to find your edge.",
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

  // ========== TO-DO LIST (Tasks) — 3 steps ==========
  {
    id: "tasks-overview",
    page: "tasks",
    targetSelector: null,
    title: "To-Do List",
    description:
      "Your prioritized action plan. Complete these tasks to capture revenue opportunities and fix issues before they become problems.",
    isPageOverview: true,
  },
  {
    id: "tasks-team",
    page: "tasks",
    targetSelector: "[data-wizard-target='tasks-team']",
    title: "Team Tasks",
    description:
      "Action items for your practice staff, prioritized by revenue impact. Check them off as you go — your completion rate is tracked.",
    scrollToElement: true,
  },
  {
    id: "tasks-alloro",
    page: "tasks",
    targetSelector: "[data-wizard-target='tasks-alloro']",
    title: "Alloro Intelligence",
    description:
      "Background monitoring Alloro runs automatically: reputation tracking, rank monitoring, and lead flow integrity. These run 24/7.",
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
    title: "Integrations & Locations",
    description:
      "Connect Google Business Profiles, Google Search Console, and manage your practice locations. Each location gets its own GBP connection.",
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
      "That's the full tour. Upload your practice management data to start receiving personalized insights, action items, and growth recommendations.",
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
    tasks: "/tasks",
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
    tasks: "To-Do List",
    website: "Websites",
    support: "Support",
    settings: "Settings",
    settingsUsers: "Users & Roles",
    settingsBilling: "Billing",
    settingsAccount: "Account",
  };
  return names[page];
}

/**
 * Demo/placeholder data for wizard mode.
 *
 * Each property is keyed so consuming components can cherry-pick via
 * `useWizardDemoData()?.someKey`. Shapes match what the real hooks return
 * so components can swap in demo data with minimal branching.
 */
export const WIZARD_DEMO_DATA = {
  // ───────────────────────── User Profile ─────────────────────────
  userProfile: {
    firstName: "Doctor",
    lastName: "Smith",
    practiceName: "Smith Orthodontics",
  },

  // ───────────────────────── Dashboard — Hero ─────────────────────────
  // Shape: ResolvedTopAction (from useTopAction)
  heroAction: {
    taskId: 1,
    title: "Respond to 3 pending Google reviews",
    urgency: "high" as const,
    priority_score: 92,
    domain: "review" as const,
    rationale:
      "You have 3 unanswered reviews from the last 7 days. Prompt responses improve local ranking signals and show prospective patients you're engaged.",
    highlights: [
      "Review response rate dropped below 80%",
      "2 of 3 reviews mention wait times",
    ],
    supporting_metrics: [
      { label: "Pending reviews", value: "3", sub: "last 7 days", source_field: "reviews.pending" },
      { label: "Avg response time", value: "4.2 days", sub: "vs 1.5 day goal", source_field: "reviews.avg_response" },
      { label: "Review score", value: "4.8", sub: "127 total reviews", source_field: "reviews.rating" },
    ],
    outcome: {
      deliverables: "Respond to all 3 reviews (estimated 10 min)",
      mechanism:
        "Faster review responses correlate with a 15% increase in new patient inquiries for similar practices.",
    },
    cta: {
      primary: { label: "Open Reviews", action_url: "/dashboard" },
      secondary: { label: "View All Tasks", action_url: "/tasks" },
    },
    domain_summaries: [
      {
        domain: "review" as const,
        heading: "Online Reputation",
        summary: "127 reviews · 4.8 average · 3 pending responses",
        detail:
          "Your overall rating is strong but response rate has dipped this week. Two recent reviews mention wait times — consider a templated reply addressing scheduling improvements.",
      },
      {
        domain: "ranking" as const,
        heading: "Local Visibility",
        summary: "Ranked #3 of 15 competitors",
        detail:
          "Your map pack ranking has been steady. Responding to reviews is one of the top signals that can push you from #3 to #2.",
      },
    ],
  },

  // ───────────────────────── Dashboard — Trajectory ─────────────────────────
  // Shape: ProoflineResult (from useAgentData -> agents.proofline.results)
  trajectoryData: {
    title: "Practice Trajectory",
    trajectory:
      "Your practice is showing <hl>strong momentum</hl> this month. New patient starts are up 12% and your local visibility continues to improve. Production is trending 15% above last month, driven by a surge in marketing-sourced referrals.",
    explanation: "Based on PMS data, GBP metrics, and ranking signals.",
    metric_signal: "production_up",
    value_change: 15.2,
    highlights: [
      "Google reviews up 23% this quarter",
      "Website form submissions increased by 18%",
      "Patient retention rate at 89%",
    ],
    dateEnd: new Date().toISOString(),
  },

  // ───────────────────────── Dashboard — Shared metrics ─────────────────────────
  // Partial DashboardMetrics consumed by Trajectory mini-stats, LocalRankingCard, PMSCard
  dashboardMetrics: {
    pms: {
      production_total: 156000,
      production_this_month: 156000,
      production_change_30d: 15.2,
      total_referrals: 47,
      total_referrals_this_month: 47,
      doctor_referrals: 14,
      doctor_referrals_this_month: 14,
      self_referrals: 33,
      distinct_months: 6,
    },
    ranking: {
      position: 3,
      total_competitors: 15,
      score: 78,
      lowest_factor: "review_velocity",
    },
    reviews: {
      total: 127,
      average_rating: 4.8,
      this_month: 8,
      pending_responses: 3,
    },
    gbp: {
      call_clicks: 42,
      direction_clicks: 28,
      website_clicks: 65,
    },
    form_submissions: {
      total: 23,
      unread: 5,
      flagged: 2,
      verified: 16,
    },
    referral: {
      total_sources: 8,
      top_source: "Google Ads",
    },
  },

  // ───────────────────────── Dashboard — Action Queue ─────────────────────────
  // Shape: ActionQueueRow[] (from useActionQueue)
  actionQueueItems: [
    { id: 1, title: "Respond to 3 pending Google reviews", urgency: "High" as const, due: "Today", agent: "summary" as const, domain: "review" },
    { id: 2, title: "Update GBP business description", urgency: "Med" as const, due: "May 25", agent: "summary" as const, domain: "gbp" },
    { id: 3, title: "Review referral source anomaly", urgency: "Med" as const, due: "May 26", agent: "re" as const, domain: "referral" },
    { id: 4, title: "Upload May PMS data", urgency: "Low" as const, due: "Jun 1", agent: "summary" as const, domain: "pms-data-quality" },
    { id: 5, title: "Add photos to Google Business Profile", urgency: "Low" as const, due: "Jun 3", agent: "summary" as const, domain: "gbp" },
  ],

  // ───────────────────────── Dashboard — Website Card ─────────────────────────
  // Shape: FormSubmissionsStats + TimeseriesPoint[]
  websiteCardData: {
    stats: { unreadCount: 5, flaggedCount: 2, verifiedCount: 16 },
    timeseries: [
      { month: "2025-07", verified: 8, unread: 2, flagged: 1 },
      { month: "2025-08", verified: 10, unread: 3, flagged: 0 },
      { month: "2025-09", verified: 12, unread: 1, flagged: 2 },
      { month: "2025-10", verified: 9, unread: 4, flagged: 1 },
      { month: "2025-11", verified: 14, unread: 2, flagged: 1 },
      { month: "2025-12", verified: 11, unread: 3, flagged: 0 },
      { month: "2026-01", verified: 15, unread: 1, flagged: 2 },
      { month: "2026-02", verified: 13, unread: 2, flagged: 1 },
      { month: "2026-03", verified: 16, unread: 3, flagged: 0 },
      { month: "2026-04", verified: 14, unread: 2, flagged: 2 },
      { month: "2026-05", verified: 18, unread: 1, flagged: 1 },
      { month: "2026-06", verified: 16, unread: 5, flagged: 2 },
    ],
  },

  // ───────────────────────── Dashboard — Local Ranking Card ─────────────────────────
  // Shape: RankingResultLite (from useLatestRanking + useDashboardMetrics)
  localRankingCardData: {
    rankScore: 78,
    rankPosition: 3,
    totalCompetitors: 15,
    specialty: "Orthodontics",
    location: "Springfield, IL",
    searchPosition: 4,
    searchStatus: "ok" as const,
    searchQuery: "orthodontist near me",
    searchCheckedAt: new Date().toISOString(),
    practiceHealth: 82,
    rankingFactors: {
      category_match: 0.95,
      keyword_name: 0.7,
      gbp_activity: 0.85,
      nap_consistency: 0.9,
      star_rating: { score: 0.96 },
      review_count: { score: 0.78 },
      review_velocity: { score: 0.55 },
      sentiment: { score: 0.88 },
    },
  },

  // ───────────────────────── Dashboard — PMS Card ─────────────────────────
  // Shape: PmsKeyData subset (months[] + sources[]) consumed by PMSCard
  pmsCardData: {
    months: [
      { month: "2026-01", selfReferrals: 12, doctorReferrals: 8, totalReferrals: 20, productionTotal: 24000 },
      { month: "2026-02", selfReferrals: 15, doctorReferrals: 10, totalReferrals: 25, productionTotal: 30000 },
      { month: "2026-03", selfReferrals: 18, doctorReferrals: 12, totalReferrals: 30, productionTotal: 36000 },
      { month: "2026-04", selfReferrals: 14, doctorReferrals: 11, totalReferrals: 25, productionTotal: 30000 },
      { month: "2026-05", selfReferrals: 20, doctorReferrals: 14, totalReferrals: 34, productionTotal: 40800 },
      { month: "2026-06", selfReferrals: 22, doctorReferrals: 13, totalReferrals: 35, productionTotal: 42000 },
    ],
    sources: [
      { rank: 1, name: "Google Ads", referrals: 38, production: 45600, percentage: 29.2 },
      { rank: 2, name: "Dr. Johnson (Pediatrics)", referrals: 22, production: 26400, percentage: 16.9 },
      { rank: 3, name: "Patient Referrals", referrals: 18, production: 21600, percentage: 13.8 },
      { rank: 4, name: "Dr. Williams (Family)", referrals: 15, production: 18000, percentage: 11.5 },
      { rank: 5, name: "Website Organic", referrals: 12, production: 14400, percentage: 9.2 },
    ],
  },

  // ───────────────────────── PMS Statistics — Monthly Data ─────────────────────────
  // Shape: PmsDashboardMonth[] (passed to PmsVitalsRow, PmsVelocityCard, etc.)
  pmsMonthlyData: [
    { month: "2026-01", selfReferrals: 12, doctorReferrals: 8, total: 20, totalReferrals: 20, productionTotal: 24000 },
    { month: "2026-02", selfReferrals: 15, doctorReferrals: 10, total: 25, totalReferrals: 25, productionTotal: 30000 },
    { month: "2026-03", selfReferrals: 18, doctorReferrals: 12, total: 30, totalReferrals: 30, productionTotal: 36000 },
    { month: "2026-04", selfReferrals: 14, doctorReferrals: 11, total: 25, totalReferrals: 25, productionTotal: 30000 },
    { month: "2026-05", selfReferrals: 20, doctorReferrals: 14, total: 34, totalReferrals: 34, productionTotal: 40800 },
    { month: "2026-06", selfReferrals: 22, doctorReferrals: 13, total: 35, totalReferrals: 35, productionTotal: 42000 },
  ],

  // ───────────────────────── PMS Statistics — Top Sources ─────────────────────────
  // Shape: PmsKeyDataSource[] (passed to PmsAttentionCards, PmsTopSourcesCard)
  pmsTopSources: [
    { rank: 1, name: "Google Ads", referrals: 38, production: 45600, percentage: 29.2 },
    { rank: 2, name: "Dr. Johnson (Pediatrics)", referrals: 22, production: 26400, percentage: 16.9 },
    { rank: 3, name: "Patient Referrals", referrals: 18, production: 21600, percentage: 13.8 },
    { rank: 4, name: "Dr. Williams (Family)", referrals: 15, production: 18000, percentage: 11.5 },
    { rank: 5, name: "Website Organic", referrals: 12, production: 14400, percentage: 9.2 },
    { rank: 6, name: "Insurance Referrals", referrals: 10, production: 12000, percentage: 7.7 },
    { rank: 7, name: "Social Media", referrals: 8, production: 9600, percentage: 6.2 },
    { rank: 8, name: "Walk-ins", referrals: 6, production: 7200, percentage: 4.6 },
  ],

  // ───────────────────────── PMS Statistics — Totals ─────────────────────────
  pmsTotals: { totalProduction: 156000, totalReferrals: 130 },

  // ───────────────────────── PMS Statistics — Legacy referral shape ─────────────────────────
  // Consumed by PMSVisualPillars wizard path (wizardDemoData.referralData.monthlyData)
  referralData: {
    monthlyData: [
      { month: "Jan", marketing: 12, doctor: 8 },
      { month: "Feb", marketing: 15, doctor: 10 },
      { month: "Mar", marketing: 18, doctor: 12 },
      { month: "Apr", marketing: 14, doctor: 11 },
      { month: "May", marketing: 20, doctor: 14 },
      { month: "Jun", marketing: 22, doctor: 13 },
    ],
    keyData: {
      mktProduction: 89000,
      docProduction: 67000,
      totalReferrals: 130,
    },
  },

  // ───────────────────────── Referral Engine ─────────────────────────
  // Shape: ReferralEngineData (passed to ReferralEngineDashboard)
  referralEngineData: {
    executive_summary: [
      "Marketing-sourced referrals (Google Ads, website, social) make up 58% of new starts and are growing 12% month-over-month.",
      "Doctor referrals contribute 42% of production but are concentrated in two providers — diversifying relationships is the top growth lever.",
      "Average production per referral ($1,200) is above the regional benchmark of $1,050, suggesting strong case acceptance.",
    ],
    doctor_referral_matrix: [
      { referrer_name: "Dr. Johnson (Pediatrics)", referred: 22, net_production: 26400, avg_production_per_referral: 1200, trend_label: "Steady", notes: "Longest-standing referral partner" },
      { referrer_name: "Dr. Williams (Family)", referred: 15, net_production: 18000, avg_production_per_referral: 1200, trend_label: "Growing", notes: "Increased from 2 to 4/month last quarter" },
      { referrer_name: "Dr. Park (Pediatric Dentistry)", referred: 8, net_production: 9600, avg_production_per_referral: 1200, trend_label: "New", notes: "Started referring 3 months ago" },
      { referrer_name: "Dr. Chen (General Dentistry)", referred: 5, net_production: 6000, avg_production_per_referral: 1200, trend_label: "Declining", notes: "Down from 8 last quarter" },
    ],
    non_doctor_referral_matrix: [
      { source_label: "Google Ads", source_key: "google_ads", source_type: "paid", referred: 38, net_production: 45600, avg_production_per_referral: 1200, trend_label: "Growing", notes: "Highest volume source" },
      { source_label: "Patient Referrals", source_key: "patient_referrals", source_type: "organic", referred: 18, net_production: 21600, avg_production_per_referral: 1200, trend_label: "Steady", notes: "Word-of-mouth remains strong" },
      { source_label: "Website Organic", source_key: "website_organic", source_type: "organic", referred: 12, net_production: 14400, avg_production_per_referral: 1200, trend_label: "Growing", notes: "SEO improvements paying off" },
      { source_label: "Insurance Referrals", source_key: "insurance", source_type: "other", referred: 10, net_production: 12000, avg_production_per_referral: 1200, trend_label: "Steady", notes: "In-network listings" },
      { source_label: "Social Media", source_key: "social_media", source_type: "paid", referred: 8, net_production: 9600, avg_production_per_referral: 1200, trend_label: "New", notes: "Instagram campaigns started 2 months ago" },
    ],
    growth_opportunity_summary: {
      top_three_fixes: [
        { title: "Re-engage Dr. Chen", description: "Schedule a lunch-and-learn to rebuild the referral relationship. Potential: +3/month." },
        { title: "Expand Google Ads budget", description: "Current ROAS is 4.2x. A 25% budget increase could yield 8-10 additional starts/month." },
        { title: "Launch patient referral program", description: "Formalize word-of-mouth with incentives. Similar practices see a 30% lift." },
      ],
      estimated_additional_annual_revenue: 150000,
    },
    observed_period: { start_date: "2026-01-01", end_date: "2026-06-30" },
    confidence: 0.87,
  },

  // ───────────────────────── Rankings ─────────────────────────
  // Shape consumed by RankingsDashboard via useWizardDemoData()?.rankingData
  rankingData: [
    {
      locationName: "Main Office",
      rank: 3,
      totalCompetitors: 15,
      visibilityScore: 78,
      patientMood: "High",
      reviews: 127,
      rating: 4.8,
    },
  ],

  // ───────────────────────── Patient Journey — GBP ─────────────────────────
  // Shape: GBPData (from useGBP)
  gbpDemoData: {
    newReviews: { prevMonth: 6, currMonth: 8 },
    avgRating: { prevMonth: 4.7, currMonth: 4.8 },
    callClicks: { prevMonth: 35, currMonth: 42 },
    trendScore: 72,
  },

  // ───────────────────────── Patient Journey — Clarity ─────────────────────────
  // Shape: ClarityData (from useClarity)
  clarityDemoData: {
    sessions: { prevMonth: 420, currMonth: 485 },
    bounceRate: { prevMonth: 0.38, currMonth: 0.32 },
    deadClicks: { prevMonth: 24, currMonth: 18 },
    trendScore: 65,
  },

  // ───────────────────────── Tasks ─────────────────────────
  // Shape: GroupedActionItems (ActionItem[] per category)
  tasks: {
    USER: [
      {
        id: 1,
        title: "Respond to 3 pending Google reviews",
        description:
          "You have 3 reviews from the past week that need responses. Responding improves your local ranking.",
        category: "USER" as const,
        status: "pending" as const,
        is_approved: true,
        created_by_admin: false,
        agent_type: "GBP_OPTIMIZATION" as const,
        created_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        updated_at: new Date(Date.now() - 3 * 86_400_000).toISOString(),
        due_date: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        metadata: { urgency: "Immediate" },
      },
      {
        id: 2,
        title: "Update Google Business Profile hours",
        description:
          "Your holiday hours may be outdated. Verify and update to avoid patient confusion.",
        category: "USER" as const,
        status: "pending" as const,
        is_approved: true,
        created_by_admin: false,
        agent_type: "GBP_OPTIMIZATION" as const,
        created_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        updated_at: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        due_date: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        metadata: { urgency: "High" },
      },
      {
        id: 3,
        title: "Add 5 new photos to GBP listing",
        description:
          "Listings with 10+ photos get 35% more clicks. You currently have 7 — add 5 more.",
        category: "USER" as const,
        status: "pending" as const,
        is_approved: true,
        created_by_admin: false,
        agent_type: "GBP_OPTIMIZATION" as const,
        created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        updated_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        due_date: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        metadata: { urgency: "Normal" },
      },
    ],
    ALLORO: [
      {
        id: 101,
        title: "Monitoring review sentiment",
        description: "Automatically tracking patient sentiment across platforms.",
        category: "ALLORO" as const,
        status: "in_progress" as const,
        is_approved: true,
        created_by_admin: false,
        agent_type: "GBP_OPTIMIZATION" as const,
        created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 102,
        title: "Tracking local rankings",
        description: "Monitoring your position against 15 local competitors.",
        category: "ALLORO" as const,
        status: "in_progress" as const,
        is_approved: true,
        created_by_admin: false,
        agent_type: "RANKING" as const,
        created_at: new Date(Date.now() - 14 * 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 103,
        title: "Analyzing referral source patterns",
        description:
          "Identifying growth opportunities and declining referral relationships.",
        category: "ALLORO" as const,
        status: "in_progress" as const,
        is_approved: true,
        created_by_admin: false,
        agent_type: "REFERRAL_ENGINE_ANALYSIS" as const,
        created_at: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        updated_at: new Date().toISOString(),
      },
    ],
  },

  // ───────────────────────── Websites — Project ─────────────────────────
  // Shape: Project (from /user/website API)
  demoProject: {
    id: "demo-project-1",
    hostname: "smithortho.alloro.io",
    display_name: "Smith Orthodontics",
    status: "READY",
    is_read_only: false,
    custom_domain: null,
    domain_verified_at: null,
    wrapper: "<div id=\"site-wrapper\"></div>",
    header: "<header>Smith Orthodontics</header>",
    footer: "© 2026 Smith Orthodontics",
    template_id: "modern-dental",
    organization_id: 1,
    primary_color: "#2563eb",
    accent_color: "#7c3aed",
  },

  // ───────────────────────── Websites — Pages ─────────────────────────
  // Shape: Page[] (from /user/website API)
  demoPages: [
    { id: "demo-page-home", path: "/", status: "published", sections: {}, updated_at: new Date().toISOString() },
    { id: "demo-page-about", path: "/about", status: "published", sections: {}, updated_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { id: "demo-page-services", path: "/services", status: "published", sections: {}, updated_at: new Date(Date.now() - 7 * 86_400_000).toISOString() },
    { id: "demo-page-contact", path: "/contact", status: "published", sections: {}, updated_at: new Date(Date.now() - 5 * 86_400_000).toISOString() },
  ],

  // ───────────────────────── Websites — Form Submissions ─────────────────────────
  demoSubmissions: [
    { id: "sub-1", name: "Sarah M.", email: "sarah.m@email.com", phone: "(555) 123-4567", message: "I'd like to schedule a consultation for my daughter's braces.", source: "Contact Page", status: "verified", created_at: new Date(Date.now() - 1 * 86_400_000).toISOString() },
    { id: "sub-2", name: "James K.", email: "james.k@email.com", phone: "(555) 234-5678", message: "Do you offer Invisalign for adults? What's the typical timeline?", source: "Services Page", status: "unread", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() },
    { id: "sub-3", name: "Maria L.", email: "maria.l@email.com", phone: "(555) 345-6789", message: "Insurance question — do you accept Delta Dental PPO?", source: "Contact Page", status: "flagged", created_at: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { id: "sub-4", name: "Robert P.", email: "robert.p@email.com", phone: "(555) 456-7890", message: "Looking to transfer from another orthodontist. Can you do a records review?", source: "Contact Page", status: "verified", created_at: new Date(Date.now() - 5 * 86_400_000).toISOString() },
  ],

  // ───────────────────────── Support — Tickets ─────────────────────────
  // Shape: SupportTicket[] (from useSupportTickets)
  demoTickets: [
    {
      id: "demo-ticket-1",
      publicId: "TK-001",
      type: "feature_request" as const,
      status: "in_progress" as const,
      severity: "medium" as const,
      title: "Add automated review response templates",
      currentPageUrl: null,
      requestedCompletionDate: null,
      guidedAnswers: {},
      resolutionNotes: null,
      resolvedAt: null,
      latestMessageAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      clientVisibleMessageCount: 3,
      createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
    },
    {
      id: "demo-ticket-2",
      publicId: "TK-002",
      type: "bug_report" as const,
      status: "resolved" as const,
      severity: "low" as const,
      title: "Dashboard chart not loading on Safari",
      currentPageUrl: "/dashboard",
      requestedCompletionDate: null,
      guidedAnswers: {},
      resolutionNotes: "Fixed in latest release.",
      resolvedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      latestMessageAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      clientVisibleMessageCount: 4,
      createdAt: new Date(Date.now() - 10 * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    },
    {
      id: "demo-ticket-3",
      publicId: "TK-003",
      type: "website_edit" as const,
      status: "new" as const,
      severity: "low" as const,
      title: "Update office hours on website footer",
      currentPageUrl: "/dfy/website",
      requestedCompletionDate: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      guidedAnswers: {},
      resolutionNotes: null,
      resolvedAt: null,
      latestMessageAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      clientVisibleMessageCount: 1,
      createdAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
      updatedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    },
  ],

  // ───────────────────────── Support — Messages (keyed by ticket ID) ─────────────────────────
  // Shape: Record<string, SupportTicketMessage[]>
  demoMessages: {
    "demo-ticket-1": [
      {
        id: "msg-1a",
        ticketId: "demo-ticket-1",
        authorUserId: null,
        authorRole: "client" as const,
        visibility: "client_visible" as const,
        body: "It would be great to have pre-written templates for responding to Google reviews. We get similar questions often.",
        authorName: "Dr. Smith",
        createdAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
      },
      {
        id: "msg-1b",
        ticketId: "demo-ticket-1",
        authorUserId: null,
        authorRole: "admin" as const,
        visibility: "client_visible" as const,
        body: "Great suggestion! We're working on an AI-powered review response feature. I'll keep you updated on the timeline.",
        authorName: "Alloro Support",
        createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      },
      {
        id: "msg-1c",
        ticketId: "demo-ticket-1",
        authorUserId: null,
        authorRole: "admin" as const,
        visibility: "client_visible" as const,
        body: "Quick update — the review response templates feature is now in development. Expected release in about 2 weeks.",
        authorName: "Alloro Support",
        createdAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
        updatedAt: new Date(Date.now() - 1 * 86_400_000).toISOString(),
      },
    ],
  },

  // ───────────────────────── Settings — Team Members ─────────────────────────
  // Shape: User[] (from useSettingsUsers)
  demoUsers: [
    { id: 1, email: "dr.smith@smithortho.com", name: "Dr. Smith", role: "admin", joined_at: "2025-06-15T00:00:00.000Z" },
    { id: 2, email: "jessica@smithortho.com", name: "Jessica Torres", role: "manager", joined_at: "2025-08-01T00:00:00.000Z" },
    { id: 3, email: "mike@smithortho.com", name: "Mike Chen", role: "viewer", joined_at: "2026-01-10T00:00:00.000Z" },
  ],

  // ───────────────────────── Settings — Pending Invitations ─────────────────────────
  // Shape: Invitation[] (from useSettingsUsers)
  demoInvitations: [
    { id: 1, email: "newteam@smithortho.com", role: "manager", created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), expires_at: new Date(Date.now() + 5 * 86_400_000).toISOString() },
  ],
};
